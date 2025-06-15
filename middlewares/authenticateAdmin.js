// middlewares/authenticateAdmin.js
const jwt = require("jsonwebtoken");
require("dotenv").config();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.role_id || payload.role_id < 2) {
      return res.status(403).json({ error: "เฉพาะแอดมินเท่านั้นที่มีสิทธิ์" });
    }
    req.adminId = payload.userId || payload.id;
    req.role_id = payload.role_id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
};

module.exports = authenticateAdmin;
