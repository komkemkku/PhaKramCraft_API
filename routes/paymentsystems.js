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

// GET /paymentsystems : ดูช่องทางรับเงินทั้งหมด
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM paymentsystems ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /paymentsystems/:id : ดูข้อมูลช่องทางเดียว
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM paymentsystems WHERE id = $1",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบช่องทางรับเงินนี้" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /paymentsystems : เพิ่มช่องทาง (admin เท่านั้น)
router.post("/", authenticateAdmin, async (req, res) => {
  const {
    qrCode,
    name_account,
    name_bank,
    number_account,
    name_branch,
    is_active,
  } = req.body;
  if (!name_account || !name_bank || !number_account) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลบัญชีให้ครบ" });
  }
  try {
    // ถ้า active อันนี้ ต้อง set อันอื่นเป็น false
    if (is_active === true) {
      await pool.query("UPDATE paymentsystems SET is_active = false");
    }
    const result = await pool.query(
      `INSERT INTO paymentsystems
       (qrCode, name_account, name_bank, number_account, name_branch, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        qrCode,
        name_account,
        name_bank,
        number_account,
        name_branch,
        !!is_active,
      ]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_paymentsystem",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) เพิ่มช่องทางรับเงินใหม่ (${name_account}, ${name_bank})`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_paymentsystem_error",
      err.message
    );
    res.status(500).json({ error: err.message });
  }
});

// PATCH /paymentsystems/:id : แก้ไขช่องทาง (admin เท่านั้น)
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    qrCode,
    name_account,
    name_bank,
    number_account,
    name_branch,
    is_active,
  } = req.body;
  try {
    // ดึงข้อมูลเก่าไว้ log
    const oldResult = await pool.query(
      "SELECT * FROM paymentsystems WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "update_paymentsystem_failed",
        `ไม่พบช่องทาง id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบช่องทางรับเงินนี้" });
    }
    const oldPS = oldResult.rows[0];

    // ถ้า active = true ต้อง set อันอื่นเป็น false
    if (is_active === true) {
      await pool.query(
        "UPDATE paymentsystems SET is_active = false WHERE id <> $1",
        [id]
      );
    }

    const result = await pool.query(
      `UPDATE paymentsystems SET
        qrCode = $1, name_account = $2, name_bank = $3, number_account = $4, name_branch = $5,
        is_active = $6, updated_at = NOW()
        WHERE id = $7 RETURNING *`,
      [
        qrCode ?? oldPS.qrCode,
        name_account ?? oldPS.name_account,
        name_bank ?? oldPS.name_bank,
        number_account ?? oldPS.number_account,
        name_branch ?? oldPS.name_branch,
        typeof is_active === "boolean" ? is_active : oldPS.is_active,
        id,
      ]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_paymentsystem",
      `Admin (${adminUsername || "id=" + req.adminId}) แก้ไขช่องทาง id=${id} (${
        oldPS.name_account
      }, ${oldPS.name_bank})`
    );
    res.json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_paymentsystem_error",
      err.message
    );
    res.status(500).json({ error: err.message });
  }
});

// DELETE /paymentsystems/:id : ลบช่องทาง (admin เท่านั้น)
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const oldResult = await pool.query(
      "SELECT * FROM paymentsystems WHERE id = $1",
      [id]
    );
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "delete_paymentsystem_failed",
        `ไม่พบช่องทาง id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบช่องทางรับเงินนี้" });
    }
    const oldPS = oldResult.rows[0];

    const result = await pool.query(
      "DELETE FROM paymentsystems WHERE id = $1 RETURNING *",
      [id]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_paymentsystem",
      `Admin (${adminUsername || "id=" + req.adminId}) ลบช่องทาง id=${id} (${
        oldPS.name_account
      }, ${oldPS.name_bank})`
    );
    res.json({
      message: "ลบช่องทางรับเงินสำเร็จ",
      paymentsystem: result.rows[0],
    });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_paymentsystem_error",
      err.message
    );
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
