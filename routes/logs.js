const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /logs?search=xxx&action=add&date=2024-06-15&page=1&limit=10
router.get("/", async (req, res) => {
  let { search = "", action = "", date = "", page = 1, limit = 10 } = req.query;
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  const offset = (page - 1) * limit;

  let filters = [];
  let params = [];
  let idx = 1;

  if (search) {
    filters.push(
      `(username ILIKE $${idx} OR adminname ILIKE $${idx} OR description ILIKE $${idx})`
    );
    params.push(`%${search}%`);
    idx++;
  }
  if (action) {
    filters.push(`action = $${idx}`);
    params.push(action);
    idx++;
  }
  if (date) {
    filters.push(`DATE(created_at) = $${idx}`);
    params.push(date);
    idx++;
  }

  let where = filters.length ? "WHERE " + filters.join(" AND ") : "";
  try {
    // ดึงข้อมูล logs + นับ total
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM logs ${where}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count, 10);

    const logsResult = await pool.query(
      `
      SELECT 
        id,
        COALESCE(username, adminname, '-') AS user,
        action,
        description AS detail,
        to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS datetime
      FROM logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );
    res.json({
      logs: logsResult.rows,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
