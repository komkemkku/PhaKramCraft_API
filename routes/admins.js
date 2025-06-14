const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const authenticateSuperAdmin = require("../middlewares/auth");
const logAction = require("../middlewares/logger");

// GET /admins : ดูรายชื่อแอดมินทั้งหมด (เฉพาะ super admin)
router.get("/", authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM admins");
    await logAction(
      null, // user_id
      req.adminId, // admin_id
      "get_admins",
      `Super Admin (id=${req.adminId}) ดูรายชื่อแอดมิน`
    );
    res.json(result.rows);
  } catch (err) {
    await logAction(null, req.adminId, "get_admins_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admins : เพิ่มผู้ดูแลระบบใหม่ (role_id = 2)
router.post("/", authenticateSuperAdmin, async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO admins (username, password, role_id) VALUES ($1, $2, $3) RETURNING *",
      [username, password, 2]
    );
    await logAction(
      null,
      req.adminId,
      "create_admin",
      `Super Admin (id=${req.adminId}) เพิ่มแอดมินใหม่ username=${username}, id=${result.rows[0].id}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "create_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admins/:id : แก้ไขข้อมูลผู้ดูแลระบบ
router.patch("/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;
  try {
    // ดึงข้อมูลเดิมเพื่อ log (optional)
    const oldResult = await pool.query("SELECT * FROM admins WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "update_admin_failed",
        `ไม่พบแอดมิน id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    const oldAdmin = oldResult.rows[0];

    const result = await pool.query(
      "UPDATE admins SET username = $1, password = $2 WHERE id = $3 RETURNING *",
      [username, password, id]
    );

    await logAction(
      null,
      req.adminId,
      "update_admin",
      `Super Admin (id=${req.adminId}) แก้ไขแอดมิน id=${id} จาก username=${oldAdmin.username} => ${username}`
    );
    res.json({ message: "อัปเดตข้อมูลสำเร็จ", user: result.rows[0] });
  } catch (err) {
    await logAction(null, req.adminId, "update_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admins/:id : ลบผู้ดูแลระบบ
router.delete("/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // ดึงข้อมูลเดิมเพื่อ log
    const oldResult = await pool.query("SELECT * FROM admins WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "delete_admin_failed",
        `ไม่พบแอดมิน id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    const oldAdmin = oldResult.rows[0];

    const result = await pool.query(
      "DELETE FROM admins WHERE id = $1 RETURNING *",
      [id]
    );
    await logAction(
      null,
      req.adminId,
      "delete_admin",
      `Super Admin (id=${req.adminId}) ลบแอดมิน id=${id}, username=${oldAdmin.username}`
    );
    res.json({ message: "ลบผู้ดูแลระบบสำเร็จ", user: result.rows[0] });
  } catch (err) {
    await logAction(null, req.adminId, "delete_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admins/login : เข้าสู่ระบบและสร้าง JWT token (ไม่ต้องตรวจ role)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rowCount === 0) {
      await logAction(
        null,
        null,
        "login_admin_failed",
        `แอดมินล็อกอินล้มเหลว username=${username}`
      );
      return res
        .status(401)
        .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const admin = result.rows[0];
    const payload = {
      userId: admin.id,
      username: admin.username,
      role_id: admin.role_id,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
    await logAction(null, admin.id, "login", `แอดมินล็อกอิน: ${username}`);
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role_id: admin.role_id,
      },
    });
  } catch (err) {
    await logAction(null, null, "login_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
