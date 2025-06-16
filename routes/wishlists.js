const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const authenticateUser = require("../middlewares/authUser");
const logAction = require("../middlewares/logger");

// ฟังก์ชันช่วย: ดึง username จาก user_id
async function getUsernameById(userId) {
  if (!userId) return null;
  const result = await pool.query("SELECT username FROM users WHERE id = $1", [
    userId,
  ]);
  return result.rows.length > 0 ? result.rows[0].username : null;
}

// GET /wishlist : ดูสินค้าที่กดถูกใจทั้งหมด (login เท่านั้น)
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await pool.query(
      `SELECT w.id as wishlist_id, w.created_at, 
              p.id as product_id, p.name as product_name, p.price, p.description
         FROM wishlists w
         LEFT JOIN products p ON w.product_id = p.id
         WHERE w.user_id = $1
         ORDER BY w.created_at DESC`,
      [user_id]
    );
    // เก็บ log ว่า user เข้าดู wishlist
    const username = await getUsernameById(user_id);
    await logAction(username, null, "view_wishlist", "ดูรายการสินค้าถูกใจ");
    res.json(result.rows);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "view_wishlist_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /wishlist : เพิ่มสินค้าเข้ารายการถูกใจ
router.post("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { product_id } = req.body;
  if (!product_id) {
    return res.status(400).json({ error: "กรุณาระบุ product_id" });
  }
  try {
    // ป้องกัน duplicate wishlist
    const exist = await pool.query(
      "SELECT 1 FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [user_id, product_id]
    );
    if (exist.rowCount > 0) {
      return res.status(400).json({ error: "คุณกดถูกใจสินค้านี้ไปแล้ว" });
    }
    const result = await pool.query(
      "INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2) RETURNING *",
      [user_id, product_id]
    );
    const username = await getUsernameById(user_id);
    await logAction(
      username,
      null,
      "add_wishlist",
      `เพิ่มสินค้าถูกใจ product_id=${product_id}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "add_wishlist_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /wishlist/:id : ลบรายการ wishlist (เฉพาะของตัวเอง)
router.delete("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  try {
    // เช็คว่าเป็นของตัวเอง
    const check = await pool.query(
      "SELECT * FROM wishlists WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบหรือไม่มีสิทธิ์ลบ" });
    }
    const result = await pool.query(
      "DELETE FROM wishlists WHERE id = $1 RETURNING *",
      [id]
    );
    const username = await getUsernameById(user_id);
    await logAction(
      username,
      null,
      "delete_wishlist",
      `ลบสินค้าถูกใจ id=${id}`
    );
    res.json({ message: "ลบสำเร็จ", wishlist: result.rows[0] });
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "delete_wishlist_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
