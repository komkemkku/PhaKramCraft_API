const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const authenticateAdmin = require("../middlewares/authenticateAdmin");
const logAction = require("../middlewares/logger");

// GET /categories
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM categories ORDER BY id DESC"
    );
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
    await logAction(
      null,
      req.adminId,
      "create_category",
      `Admin id=${req.adminId} เพิ่มหมวดหมู่ใหม่ "${name}"`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "create_category_error", err.message);
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
      await logAction(
        null,
        req.adminId,
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
    await logAction(
      null,
      req.adminId,
      "update_category",
      `Admin id=${req.adminId} แก้ไขหมวด id=${id} (${oldCat.name}=>${name})`
    );
    res.json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "update_category_error", err.message);
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
      await logAction(
        null,
        req.adminId,
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
    await logAction(
      null,
      req.adminId,
      "delete_category",
      `Admin id=${req.adminId} ลบหมวดหมู่ id=${id} ชื่อ="${oldCat.name}"`
    );
    res.json({ message: "ลบหมวดหมู่สำเร็จ", category: result.rows[0] });
  } catch (err) {
    await logAction(null, req.adminId, "delete_category_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
