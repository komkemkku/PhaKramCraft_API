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
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_owner",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) เพิ่มเจ้าของสินค้า/กลุ่ม "${name}"`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "create_owner_error", err.message);
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
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
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
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_owner",
      `Admin (${adminUsername || "id=" + req.adminId}) แก้ไขเจ้าของ id=${id} (${
        oldOwner.name
      } => ${name})`
    );
    res.json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "update_owner_error", err.message);
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
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
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
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_owner",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) ลบเจ้าของ id=${id} ชื่อ="${oldOwner.name}"`
    );
    res.json({ message: "ลบเจ้าของสินค้า/กลุ่มสำเร็จ", owner: result.rows[0] });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "delete_owner_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
