const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();
const authenticateUser = require("../middlewares/authUser");

// === [POST] แจ้งชำระเงิน ===
router.post("/:orderId", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const order_id = req.params.orderId;
  const { transfer_date, transfer_time } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. เช็คสิทธิ์
    const orderRes = await client.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [order_id, user_id]
    );
    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "ไม่พบ order หรือไม่มีสิทธิ์" });
    }
    const order = orderRes.rows[0];
    if (order.status !== "pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "ไม่สามารถแจ้งชำระเงินสำหรับออเดอร์นี้ได้" });
    }

    // 2. ห้ามแจ้งซ้ำ
    if (order.payment_id) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "แจ้งชำระเงินไปแล้ว กรุณารอการตรวจสอบ" });
    }

    // 3. validate
    if (!transfer_date || !transfer_time) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "กรุณาระบุวันและเวลาโอน" });
    }

    // 4. บันทึกลงตาราง payments
    const payResult = await client.query(
      `INSERT INTO payments (order_id, transfer_date, transfer_time)
         VALUES ($1, $2, $3) RETURNING id`,
      [order_id, transfer_date, transfer_time]
    );
    const payment_id = payResult.rows[0].id;

    // 5. อัปเดตตาราง orders
    await client.query(
      "UPDATE orders SET status = 'paid', payment_id = $1, updated_at = NOW() WHERE id = $2",
      [payment_id, order_id]
    );

    await client.query("COMMIT");

    res.json({
      message: "แจ้งชำระเงินสำเร็จ",
      payment_id: payment_id,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "เซิร์ฟเวอร์ผิดพลาด" });
  } finally {
    client.release();
  }
});

module.exports = router;
