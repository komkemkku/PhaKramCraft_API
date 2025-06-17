const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const authenticateSuperAdmin = require("../middlewares/auth"); // ตรวจสอบ super admin
const logAction = require("../middlewares/logger");
const bcrypt = require("bcrypt");

// helper ดึง username จาก id
const getAdminUsername = async (adminId) => {
  if (!adminId) return null;
  const res = await pool.query("SELECT username FROM admins WHERE id = $1", [
    adminId,
  ]);
  return res.rows.length > 0 ? res.rows[0].username : null;
};

// GET /admins : ดูแอดมินทั้งหมด (เฉพาะ super admin)
router.get("/", authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, username, role_id FROM admins ORDER BY id DESC"
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "get_admins",
      `Super Admin (${adminUsername || "id=" + req.adminId}) ดูรายชื่อแอดมิน`
    );
    res.json(result.rows);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "get_admins_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /admins : เพิ่มแอดมินใหม่ (role_id = 3 อัตโนมัติ)
router.post("/", authenticateSuperAdmin, async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res
      .status(400)
      .json({ error: "กรุณาระบุชื่อ, username และรหัสผ่าน" });
  }
  try {
    // 1. hash password ก่อนบันทึก
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      "INSERT INTO admins (name, username, password, role_id) VALUES ($1, $2, $3, 3) RETURNING id, name, username, role_id",
      [name, username, hashedPassword]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_admin",
      `Super Admin (${
        adminUsername || "id=" + req.adminId
      }) เพิ่มแอดมินใหม่ username=${username}, name=${name}, id=${
        result.rows[0].id
      }`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "create_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admins/:id : แก้ไขข้อมูลแอดมิน
router.patch("/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, username, password } = req.body;
  try {
    const oldResult = await pool.query("SELECT * FROM admins WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "update_admin_failed",
        `ไม่พบแอดมิน id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    const oldAdmin = oldResult.rows[0];

    // hash password ถ้ามีการส่ง password ใหม่มา
    let newPassword = oldAdmin.password;
    if (password) {
      const saltRounds = 10;
      newPassword = await bcrypt.hash(password, saltRounds);
    }

    const result = await pool.query(
      "UPDATE admins SET name = $1, username = $2, password = $3 WHERE id = $4 RETURNING id, name, username, role_id",
      [name || oldAdmin.name, username || oldAdmin.username, newPassword, id]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_admin",
      `Super Admin (${
        adminUsername || "id=" + req.adminId
      }) แก้ไขแอดมิน id=${id} (${oldAdmin.username}/${oldAdmin.name} => ${
        username || oldAdmin.username
      }/${name || oldAdmin.name})`
    );
    res.json({ message: "อัปเดตข้อมูลสำเร็จ", user: result.rows[0] });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "update_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admins/:id : ลบผู้ดูแลระบบ
router.delete("/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const oldResult = await pool.query("SELECT * FROM admins WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "delete_admin_failed",
        `ไม่พบแอดมิน id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    const oldAdmin = oldResult.rows[0];
    const result = await pool.query(
      "DELETE FROM admins WHERE id = $1 RETURNING id, name, username, role_id",
      [id]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_admin",
      `Super Admin (${
        adminUsername || "id=" + req.adminId
      }) ลบแอดมิน id=${id}, username=${oldAdmin.username}, name=${
        oldAdmin.name
      }`
    );
    res.json({ message: "ลบผู้ดูแลระบบสำเร็จ", user: result.rows[0] });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "delete_admin_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM admins WHERE username = $1",
      [username]
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

    // ตรวจสอบรหัสผ่าน hash ด้วย bcrypt
    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
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

    const payload = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role_id: admin.role_id,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
    await logAction(
      null,
      admin.username,
      "login",
      `แอดมินล็อกอิน: ${username}`
    );
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      admin: {
        id: admin.id,
        name: admin.name,
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
