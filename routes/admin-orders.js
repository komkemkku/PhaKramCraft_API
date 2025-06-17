const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET: รายการออเดอร์ (search/filter/pagination)
router.get("/", async (req, res) => {
  const { q, status, page = 1, pageSize = 10 } = req.query;
  let where = [];
  let values = [];
  let idx = 1;

  let sql = `
    SELECT o.id, o.created_at, o.status, o.total_price, o.tracking_no,
      a.fullname AS receiver_name, a.address
    FROM orders o
    LEFT JOIN addresses a ON a.id = o.address_id
  `;

  if (q) {
    where.push(`(a.fullname ILIKE $${idx} OR o.id::text ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }
  if (status) {
    where.push(`o.status = $${idx}`);
    values.push(status);
    idx++;
  }
  if (where.length > 0) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY o.created_at DESC";
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(Number(pageSize));
  values.push((Number(page) - 1) * Number(pageSize));

  try {
    const result = await pool.query(sql, values);
    let countSql = `
      SELECT COUNT(*) FROM orders o
      LEFT JOIN addresses a ON a.id = o.address_id
    `;
    if (where.length > 0) countSql += " WHERE " + where.join(" AND ");
    const countResult = await pool.query(countSql, values.slice(0, idx - 1));

    res.json({
      data: result.rows,
      total: Number(countResult.rows[0].count),
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: รายละเอียดออเดอร์ (แสดงข้อมูลที่อยู่, รายการสินค้า, ข้อมูลการชำระเงิน)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // ดึงข้อมูล order + address
    const orderRes = await pool.query(
      `SELECT o.id, o.created_at, o.status, o.total_price, o.tracking_no,
        a.fullname, a.tel, a.address, a.province, a.postcode
      FROM orders o
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = $1`,
      [id]
    );
    if (orderRes.rowCount === 0)
      return res.status(404).json({ error: "ไม่พบออเดอร์" });
    const order = orderRes.rows[0];

    // ดึงรายการสินค้าในออเดอร์
    const itemsRes = await pool.query(
      `SELECT product_name, product_price, product_amount
       FROM orderitems WHERE order_id = $1`,
      [id]
    );
    order.items = itemsRes.rows;

    // ดึงข้อมูลการชำระเงินล่าสุด 1 รายการ (ถ้ามี)
    const paymentRes = await pool.query(
      `SELECT slip_url, transfer_date, transfer_time, created_at
       FROM order_payments
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    order.payment = paymentRes.rows[0] || null;

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH: อัปเดตสถานะและหมายเลขติดตาม
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { status, tracking_no } = req.body;

  let fields = [];
  let values = [];
  let idx = 1;

  if (status) {
    fields.push(`status = $${idx}`);
    values.push(status);
    idx++;
  }
  if (typeof tracking_no !== "undefined") {
    fields.push(`tracking_no = $${idx}`);
    values.push(tracking_no);
    idx++;
  }
  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  values.push(id);
  const sql = `UPDATE orders SET ${fields.join(
    ", "
  )}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0)
      return res.status(404).json({ error: "ไม่พบออเดอร์" });
    res.json({ message: "อัปเดตสำเร็จ", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: ลบออเดอร์
router.delete("/:id", async (req, res) => {
  try {
    const del = await pool.query("DELETE FROM orders WHERE id = $1", [
      req.params.id,
    ]);
    if (del.rowCount === 0)
      return res.status(404).json({ error: "ไม่พบออเดอร์" });
    res.json({ message: "ลบออเดอร์สำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
