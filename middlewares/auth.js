const jwt = require("jsonwebtoken");
const pool = require("../db");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Middleware สำหรับตรวจสอบ super admin
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "กรุณาเข้าสู่ระบบ (No token provided)" });
    }
    const token = authHeader.split(" ")[1];

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
    }

    const userId = payload.userId || payload.id;
    if (!userId) {
      return res.status(401).json({ error: "Token ไม่สมบูรณ์" });
    }

    // ดึง role_id ของ user จากฐานข้อมูล
    const result = await pool.query(
      "SELECT role_id FROM admins WHERE id = $1",
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้" });
    }
    if (result.rows[0].role_id !== 3) {
      return res
        .status(403)
        .json({ error: "เฉพาะ super admin เท่านั้นที่อนุญาต" });
    }

    req.adminId = userId;
    req.role_id = result.rows[0].role_id;
    next();
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
};

module.exports = authenticateSuperAdmin;
