const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateUser = require("../middlewares/authUser");

// GET /orderUsers?status=paid
// ดึงประวัติคำสั่งซื้อ แยกตามสถานะ (ถ้าไม่ระบุ แสดงทั้งหมด)
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const status = req.query.status;
  let query = `SELECT * FROM orders WHERE user_id = $1`;
  let params = [user_id];

  if (status) {
    query += " AND status = $2";
    params.push(status);
  }
  query += " ORDER BY created_at DESC";

  const ordersRes = await pool.query(query, params);
  const orders = ordersRes.rows;

  // ดึง items ของทุก order แบบรวดเร็ว (multi-query)
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id);
    const itemsRes = await pool.query(
      `SELECT * FROM orderitems WHERE order_id = ANY($1::int[])`,
      [orderIds]
    );
    // Group items by order_id
    const itemsByOrder = {};
    itemsRes.rows.forEach((item) => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    });
    orders.forEach((order) => {
      order.items = itemsByOrder[order.id] || [];
    });

    // ดึง address ของแต่ละ order (join addresses)
    const addressIds = [
      ...new Set(orders.map((o) => o.address_id).filter(Boolean)),
    ];
    let addressMap = {};
    if (addressIds.length > 0) {
      const addressRes = await pool.query(
        `SELECT * FROM addresses WHERE id = ANY($1::int[])`,
        [addressIds]
      );
      addressRes.rows.forEach((ad) => {
        addressMap[ad.id] = ad;
      });
    }
    orders.forEach((order) => {
      order.address = addressMap[order.address_id] || null;
    });
  }

  res.json({ orders });
});

// GET /orderUsers/:id
// ดูรายละเอียดแต่ละ order (สินค้าที่สั่ง และ address)
router.get("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const order_id = req.params.id;

  // ต้องเป็นของ user เอง
  const orderRes = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
    [order_id, user_id]
  );
  if (orderRes.rowCount === 0) {
    return res.status(404).json({ error: "ไม่พบคำสั่งซื้อนี้!" });
  }
  const order = orderRes.rows[0];

  // ดึง order items
  const itemsRes = await pool.query(
    `SELECT * FROM orderitems WHERE order_id = $1`,
    [order_id]
  );
  order.items = itemsRes.rows;

  // ดึง address (join ตาม address_id)
  let address = null;
  if (order.address_id) {
    const addressRes = await pool.query(
      `SELECT * FROM addresses WHERE id = $1`,
      [order.address_id]
    );
    if (addressRes.rowCount > 0) address = addressRes.rows[0];
  }
  order.address = address;

  res.json({ order });
});

// PATCH /orderUsers/:id/cancel
// ยกเลิก order (เฉพาะ pending เท่านั้น)
router.patch("/:id/cancel", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const order_id = req.params.id;

  // ต้องเช็คสถานะก่อน (pending ถึงยกเลิกได้)
  const orderRes = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [order_id, user_id]
  );
  if (orderRes.rowCount === 0) {
    return res.status(400).json({ error: "ไม่สามารถยกเลิกออเดอร์นี้ได้" });
  }
  // อัปเดตสถานะ
  await pool.query(
    `UPDATE orders SET status = 'cancel', updated_at = NOW() WHERE id = $1`,
    [order_id]
  );
  res.json({ message: "ยกเลิกออเดอร์สำเร็จ" });
});

module.exports = router;
