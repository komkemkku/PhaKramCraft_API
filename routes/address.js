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

// GET /address : ดูที่อยู่ทั้งหมดของ user
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  try {
    const result = await pool.query(
      "SELECT * FROM address WHERE user_id = $1 ORDER BY id DESC",
      [user_id]
    );
    const username = await getUsernameById(user_id);
    await logAction(username, null, "get_addresses", "ดูที่อยู่ทั้งหมด");
    res.json(result.rows);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "get_addresses_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /address/:id : ดูที่อยู่เดียว (ต้องเป็นของตัวเอง)
router.get("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM address WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    const username = await getUsernameById(user_id);
    if (result.rowCount === 0) {
      await logAction(
        username,
        null,
        "get_address_failed",
        `ไม่พบที่อยู่ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบที่อยู่นี้" });
    }
    await logAction(username, null, "get_address", `ดูที่อยู่ id=${id}`);
    res.json(result.rows[0]);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "get_address_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /address : เพิ่มที่อยู่ (login เท่านั้น)
router.post("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { firstname, lastname, address_detail, province, zipcode } = req.body;
  if (!firstname || !lastname || !address_detail || !province || !zipcode) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO address (user_id, firstname, lastname, address_detail, province, zipcode)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, firstname, lastname, address_detail, province, zipcode]
    );
    const username = await getUsernameById(user_id);
    await logAction(
      username,
      null,
      "add_address",
      `เพิ่มที่อยู่ใหม่ id=${result.rows[0].id}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "add_address_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /address/:id : แก้ไขที่อยู่ของตัวเอง
router.patch("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  const { firstname, lastname, address_detail, province, zipcode } = req.body;
  try {
    // ตรวจสอบสิทธิ์เป็นของตัวเองเท่านั้น
    const oldResult = await pool.query(
      "SELECT * FROM address WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    const username = await getUsernameById(user_id);
    if (oldResult.rowCount === 0) {
      await logAction(
        username,
        null,
        "update_address_failed",
        `ไม่พบที่อยู่ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบที่อยู่นี้" });
    }
    const oldAddr = oldResult.rows[0];

    const result = await pool.query(
      `UPDATE address SET
        firstname = $1, lastname = $2, address_detail = $3, province = $4, zipcode = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        firstname ?? oldAddr.firstname,
        lastname ?? oldAddr.lastname,
        address_detail ?? oldAddr.address_detail,
        province ?? oldAddr.province,
        zipcode ?? oldAddr.zipcode,
        id,
        user_id,
      ]
    );
    await logAction(username, null, "update_address", `แก้ไขที่อยู่ id=${id}`);
    res.json(result.rows[0]);
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "update_address_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /address/:id : ลบที่อยู่ของตัวเอง
router.delete("/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { id } = req.params;
  try {
    const oldResult = await pool.query(
      "SELECT * FROM address WHERE id = $1 AND user_id = $2",
      [id, user_id]
    );
    const username = await getUsernameById(user_id);
    if (oldResult.rowCount === 0) {
      await logAction(
        username,
        null,
        "delete_address_failed",
        `ไม่พบที่อยู่ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบที่อยู่นี้" });
    }
    const result = await pool.query(
      "DELETE FROM address WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, user_id]
    );
    await logAction(username, null, "delete_address", `ลบที่อยู่ id=${id}`);
    res.json({ message: "ลบที่อยู่สำเร็จ", address: result.rows[0] });
  } catch (err) {
    const username = await getUsernameById(user_id);
    await logAction(username, null, "delete_address_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
