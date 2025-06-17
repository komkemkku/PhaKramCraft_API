const express = require("express");
const router = express.Router();
const pool = require("../db");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
require("dotenv").config();
const authenticateUser = require("../middlewares/authUser");

// ตรวจสอบว่ามีโฟลเดอร์ uploads/slips หรือยัง ถ้าไม่มีให้สร้าง
const slipUploadDir = path.join(__dirname, "..", "uploads", "slips");
if (!fs.existsSync(slipUploadDir)) {
  fs.mkdirSync(slipUploadDir, { recursive: true });
}

// ตั้งค่า multer สำหรับอัปโหลดสลิป
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, slipUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `slip_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// === [POST] แจ้งชำระเงิน ===
router.post(
  "/:orderId",
  authenticateUser,
  upload.single("slip"),
  async (req, res) => {
    const user_id = req.userId;
    const order_id = req.params.orderId;
    const { transfer_date, transfer_time } = req.body;

    try {
      // 1. เช็คสิทธิ์
      const orderRes = await pool.query(
        "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
        [order_id, user_id]
      );
      if (orderRes.rowCount === 0) {
        return res.status(404).json({ error: "ไม่พบ order หรือไม่มีสิทธิ์" });
      }
      const order = orderRes.rows[0];
      if (order.status !== "pending") {
        return res
          .status(400)
          .json({ error: "ไม่สามารถแจ้งชำระเงินสำหรับออเดอร์นี้ได้" });
      }

      // 2. ห้ามแจ้งซ้ำ
      const paymentRes = await pool.query(
        "SELECT * FROM order_payments WHERE order_id = $1",
        [order_id]
      );
      if (paymentRes.rowCount > 0) {
        return res
          .status(400)
          .json({ error: "แจ้งชำระเงินไปแล้ว กรุณารอการตรวจสอบ" });
      }

      // 3. validate
      if (!req.file) {
        return res.status(400).json({ error: "กรุณาอัปโหลดสลิป" });
      }
      if (!transfer_date || !transfer_time) {
        return res.status(400).json({ error: "กรุณาระบุวันและเวลาโอน" });
      }

      // 4. SAVE ลง order_payments และดึง payment_id
      const slipRelativePath = "/uploads/slips/" + path.basename(req.file.path);

      const payResult = await pool.query(
        `INSERT INTO order_payments (order_id, slip_url, transfer_date, transfer_time)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [order_id, slipRelativePath, transfer_date, transfer_time]
      );
      const payment_id = payResult.rows[0].id;

      // 5. อัปเดตสถานะ order และเก็บ payment_id
      await pool.query(
        "UPDATE orders SET status = 'paid', payment_id = $1, updated_at = NOW() WHERE id = $2",
        [payment_id, order_id]
      );

      // // 6. แจ้งเตือนผู้ใช้ (ลบออกหรือคอมเมนต์)
      // await pool.query(
      //   `INSERT INTO notifications (user_id, order_id, message, is_read, created_at)
      //    VALUES ($1, $2, $3, false, NOW())`,
      //   [user_id, order_id, `คุณได้แจ้งชำระเงินสำหรับคำสั่งซื้อ #${order_id}`]
      // );

      res.json({
        message: "แจ้งชำระเงินสำเร็จ",
        slip_url: slipRelativePath,
        payment_id: payment_id,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "เซิร์ฟเวอร์ผิดพลาด" });
    }
  }
);

module.exports = router;
