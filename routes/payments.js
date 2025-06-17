const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /paymentsystems : ดึงทุกช่องทางที่ is_active = true
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, qrcode, name_account, name_bank, number_account, name_branch FROM paymentsystems WHERE is_active = true ORDER BY id ASC"
    );
    res.json({ paymentSystems: result.rows });
  } catch (e) {
    res.status(500).json({ error: "ไม่สามารถดึงช่องทางการชำระเงิน" });
  }
});

module.exports = router;
