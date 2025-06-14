// middlewares/authUser.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId || payload.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
};

module.exports = authenticateUser;
