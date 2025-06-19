const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateUser = require("../middlewares/authUser");

// **สำคัญ!** ในไฟล์ app.js หรือ main server ต้องมี
// app.use(express.urlencoded({ extended: true }));
// หรือ app.use(express.json());

router.post("/:orderId", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const order_id = req.params.orderId;
  const { transfer_date, transfer_time } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ตรวจสอบ order
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
    if (order.payment_id) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "แจ้งชำระเงินไปแล้ว กรุณารอการตรวจสอบ" });
    }
    if (!transfer_date || !transfer_time) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "กรุณาระบุวันและเวลาโอน" });
    }

    // INSERT ลง order_payments (ระบุ slip_url เป็นค่า default เช่น "no-slip")
    const payResult = await client.query(
      `INSERT INTO order_payments (order_id, slip_url, transfer_date, transfer_time)
         VALUES ($1, $2, $3, $4) RETURNING id`,
      [order_id, "no-slip", transfer_date, transfer_time]
    );
    const payment_id = payResult.rows[0].id;

    // UPDATE orders
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
    console.error("Payment error: ", err);
    res.status(500).json({ error: "เซิร์ฟเวอร์ผิดพลาด", detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
