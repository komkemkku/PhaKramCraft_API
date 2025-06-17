const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateUser = require("../middlewares/authUser");

// GET /notifications - ดึงแจ้งเตือนล่าสุด (30 รายการ)
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const notiRes = await pool.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30",
    [user_id]
  );
  res.json({ notifications: notiRes.rows });
});

// PATCH /notifications/:id/read - อ่านแจ้งเตือน
router.patch("/:id/read", authenticateUser, async (req, res) => {
  const noti_id = req.params.id;
  const user_id = req.userId;
  await pool.query(
    "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
    [noti_id, user_id]
  );
  res.json({ message: "อ่านแจ้งเตือนแล้ว" });
});

// PATCH /notifications/read-all - อ่านทั้งหมด
router.patch("/read-all", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  await pool.query(
    "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
    [user_id]
  );
  res.json({ message: "อ่านแจ้งเตือนทั้งหมดแล้ว" });
});

module.exports = router;
