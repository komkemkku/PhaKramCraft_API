const express = require("express");
const router = express.Router();
const pool = require("../db"); // ปรับตามที่เก็บ pool ของคุณ
const authenticateUser = require("../middlewares/authUser");

// เพิ่มที่อยู่ใหม่
router.post("/", authenticateUser, async (req, res) => {
  const user_id = req.userId; // ได้จาก JWT middleware
  const { fullname, tel, address, province, postcode } = req.body;

  if (!fullname || !tel || !address || !province || !postcode) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO addresses (user_id, fullname, tel, address, province, postcode, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [user_id, fullname, tel, address, province, postcode]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "เพิ่มที่อยู่ไม่สำเร็จ" });
  }
});

// ดึงที่อยู่ทั้งหมดของ user (เฉพาะคนนี้)
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await pool.query(
      "SELECT * FROM addresses WHERE user_id = $1 ORDER BY id DESC",
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "โหลดที่อยู่ล้มเหลว" });
  }
});

// แก้ไขที่อยู่ (ตาม id)
router.put("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  const { fullname, tel, address, province, postcode } = req.body;

  if (!fullname || !tel || !address || !province || !postcode) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
  }

  try {
    // เช็คก่อนว่าเป็นของ user นี้จริง
    const check = await pool.query(
      "SELECT * FROM addresses WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    if (check.rowCount === 0)
      return res.status(404).json({ error: "ไม่พบที่อยู่นี้" });

    const result = await pool.query(
      `UPDATE addresses
       SET fullname = $1, tel = $2, address = $3, province = $4, postcode = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [fullname, tel, address, province, postcode, id, user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "แก้ไขที่อยู่ล้มเหลว" });
  }
});

// ลบที่อยู่
router.delete("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  try {
    // เช็คก่อนว่าเป็นของ user นี้จริง
    const check = await pool.query(
      "SELECT * FROM addresses WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    if (check.rowCount === 0)
      return res.status(404).json({ error: "ไม่พบที่อยู่นี้" });

    await pool.query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [
      id,
      user_id,
    ]);
    res.json({ message: "ลบที่อยู่เรียบร้อย" });
  } catch (err) {
    res.status(500).json({ error: "ลบที่อยู่ล้มเหลว" });
  }
});

module.exports = router;
