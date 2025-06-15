const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const authenticateAdmin = require("../middlewares/authenticateAdmin");
const logAction = require("../middlewares/logger");

// GET /owners : ดูเจ้าของสินค้า/กลุ่มทั้งหมด
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM ownerproducts ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /owners/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM ownerproducts WHERE id = $1",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูลเจ้าของนี้" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /owners
router.post("/", authenticateAdmin, async (req, res) => {
  const { name, amount } = req.body;
  if (!name) {
    return res.status(400).json({ error: "กรุณาระบุชื่อเจ้าของ/กลุ่ม" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO ownerproducts (name, amount) VALUES ($1, $2) RETURNING *",
      [name, amount || 0]
    );
    await logAction(
      null,
      req.adminId,
      "create_owner",
      `Admin id=${req.adminId} เพิ่มเจ้าของสินค้า/กลุ่ม "${name}"`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "create_owner_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /owners/:id
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, amount } = req.body;
  try {
    const oldResult = await pool.query(
      "SELECT * FROM ownerproducts WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "update_owner_failed",
        `ไม่พบเจ้าของ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบข้อมูลเจ้าของนี้" });
    }
    const oldOwner = oldResult.rows[0];

    const result = await pool.query(
      "UPDATE ownerproducts SET name = $1, amount = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [name ?? oldOwner.name, amount ?? oldOwner.amount, id]
    );
    await logAction(
      null,
      req.adminId,
      "update_owner",
      `Admin id=${req.adminId} แก้ไขเจ้าของ id=${id} (${oldOwner.name} => ${name})`
    );
    res.json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "update_owner_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /owners/:id
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const oldResult = await pool.query(
      "SELECT * FROM ownerproducts WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "delete_owner_failed",
        `ไม่พบเจ้าของ id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบข้อมูลเจ้าของนี้" });
    }
    const oldOwner = oldResult.rows[0];

    const result = await pool.query(
      "DELETE FROM ownerproducts WHERE id = $1 RETURNING *",
      [id]
    );
    await logAction(
      null,
      req.adminId,
      "delete_owner",
      `Admin id=${req.adminId} ลบเจ้าของ id=${id} ชื่อ="${oldOwner.name}"`
    );
    res.json({ message: "ลบเจ้าของสินค้า/กลุ่มสำเร็จ", owner: result.rows[0] });
  } catch (err) {
    await logAction(null, req.adminId, "delete_owner_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
