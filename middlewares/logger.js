const pool = require("../db");

const logAction = async (user_id, admin_id, action, description) => {
  try {
    if (user_id) {
      await pool.query(
        "INSERT INTO logs (user_id, action, description) VALUES ($1, $2, $3)",
        [user_id, action, description]
      );
    } else if (admin_id) {
      await pool.query(
        "INSERT INTO logs (admin_id, action, description) VALUES ($1, $2, $3)",
        [admin_id, action, description]
      );
    } else {
      // ถ้าไม่รู้ว่าใครทำ ไม่ต้อง log
      console.warn("No user_id or admin_id for log:", { action, description });
    }
  } catch (err) {
    console.error("Error writing log:", err);
  }
};

module.exports = logAction;
