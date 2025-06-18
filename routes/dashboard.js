const express = require("express");
const router = express.Router();
const pool = require("../db");

// 1. Dashboard Summary (จำนวนสินค้า หมวดหมู่ ขายได้ ผู้ใช้)
router.get("/summary", async (req, res) => {
  try {
    const productCount = await pool.query("SELECT COUNT(*) FROM products");
    const categoryCount = await pool.query("SELECT COUNT(*) FROM categories");
    const userCount = await pool.query("SELECT COUNT(*) FROM users");
    const soldCount = await pool.query(
      "SELECT COALESCE(SUM(product_amount), 0) AS sold FROM orderitems"
    );
    res.json({
      product_count: Number(productCount.rows[0].count),
      category_count: Number(categoryCount.rows[0].count),
      sold_count: Number(soldCount.rows[0].sold),
      user_count: Number(userCount.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. จำนวนขายตามหมวดหมู่ในแต่ละปี
router.get("/sold-by-category/:year", async (req, res) => {
  const year = req.params.year;
  try {
    const sql = `
      SELECT c.name AS category, COALESCE(SUM(oi.product_amount),0) AS sold
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN orderitems oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND EXTRACT(YEAR FROM o.created_at) = $1
      GROUP BY c.id, c.name
      ORDER BY c.name
    `;
    const result = await pool.query(sql, [year]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. กราฟยอดขายรายเดือน (บาท)
router.get("/sales-by-month/:year", async (req, res) => {
  const year = req.params.year;
  try {
    const sql = `
      SELECT EXTRACT(MONTH FROM o.created_at)::int AS month,
             COALESCE(SUM(o.total_price),0) AS total
      FROM orders o
      WHERE EXTRACT(YEAR FROM o.created_at) = $1
      GROUP BY month
      ORDER BY month
    `;
    const result = await pool.query(sql, [year]);
    let arr = Array(12).fill(0);
    result.rows.forEach((r) => {
      arr[r.month - 1] = Number(r.total);
    });
    res.json(arr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 10 ออเดอร์ล่าสุดของปีนี้ (table ด้านล่าง)
router.get("/recent-orders/:year", async (req, res) => {
  const year = req.params.year;
  try {
    // เปลี่ยนเป็น username แทน name/fullname
    const sql = `
      SELECT o.id, TO_CHAR(o.created_at, 'YYYY-MM-DD') as date, o.status, o.total_price,
        o.id as order_no, u.username as buyer
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE EXTRACT(YEAR FROM o.created_at) = $1
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    const result = await pool.query(sql, [year]);
    let data = [];
    for (const row of result.rows) {
      const itemsRes = await pool.query(
        `SELECT p.name AS product, oi.product_amount AS qty
         FROM orderitems oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = $1`,
        [row.id]
      );
      data.push({
        ...row,
        items: itemsRes.rows,
      });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. รายชื่อปีที่มี order (drop down filter ปี)
router.get("/years", async (req, res) => {
  try {
    const sql = `SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year FROM orders ORDER BY year DESC`;
    const result = await pool.query(sql);
    const years = result.rows.map((r) => r.year);
    if (years.length === 0) years.push(new Date().getFullYear());
    res.json(years);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
