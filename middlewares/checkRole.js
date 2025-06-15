// middlewares/checkRole.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// ดึง user หรือ admin จาก token, ใส่ req.userId หรือ req.adminId
const checkRole = (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    // ไม่ได้ login
    return next();
  }
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role_id === 1) {
      req.userId = payload.userId; // user
    } else if (payload.role_id === 2 || payload.role_id === 3) {
      req.adminId = payload.userId; // admin/superadmin
    }
    next();
  } catch (err) {
    // Token ไม่ถูกต้อง/หมดอายุ ก็ถือว่าเป็น guest
    next();
  }
};

module.exports = checkRole;
