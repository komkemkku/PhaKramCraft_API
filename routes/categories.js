const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const authenticateAdmin = require("../middlewares/authenticateAdmin");
const logAction = require("../middlewares/logger");

// ฟังก์ชันช่วย: ดึง admin username จาก adminId
async function getAdminUsername(adminId) {
  if (!adminId) return null;
  const result = await pool.query("SELECT username FROM admins WHERE id = $1", [
    adminId,
  ]);
  return result.rows.length > 0 ? result.rows[0].username : null;
}

// GET /categories
// GET /categories
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as count
      FROM categories c
      ORDER BY c.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /categories/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM categories WHERE id = $1", [
      id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบหมวดหมู่นี้" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /categories
router.post("/", authenticateAdmin, async (req, res) => {
  const { name, is_active = true } = req.body;
  if (!name) {
    return res.status(400).json({ error: "กรุณาระบุชื่อหมวดหมู่" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO categories (name, is_active) VALUES ($1, $2) RETURNING *",
      [name, is_active]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_category",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) เพิ่มหมวดหมู่ใหม่ "${name}"`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "create_category_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /categories/:id : แก้ไขหมวดหมู่
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;
  try {
    // ดึงข้อมูลเก่ามา log
    const oldResult = await pool.query(
      "SELECT * FROM categories WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "update_category_failed",
        `ไม่พบหมวดหมู่ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบหมวดหมู่นี้" });
    }
    const oldCat = oldResult.rows[0];

    const result = await pool.query(
      "UPDATE categories SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [name ?? oldCat.name, is_active ?? oldCat.is_active, id]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_category",
      `Admin (${adminUsername || "id=" + req.adminId}) แก้ไขหมวด id=${id} (${
        oldCat.name
      }=>${name})`
    );
    res.json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "update_category_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /categories/:id : ลบหมวดหมู่
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const oldResult = await pool.query(
      "SELECT * FROM categories WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "delete_category_failed",
        `ไม่พบหมวดหมู่ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบหมวดหมู่นี้" });
    }
    const oldCat = oldResult.rows[0];

    const result = await pool.query(
      "DELETE FROM categories WHERE id = $1 RETURNING *",
      [id]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_category",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) ลบหมวดหมู่ id=${id} ชื่อ="${oldCat.name}"`
    );
    res.json({ message: "ลบหมวดหมู่สำเร็จ", category: result.rows[0] });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "delete_category_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
