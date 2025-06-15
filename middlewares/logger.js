const pool = require("../db");

const logAction = async (user_id, admin_id, action, description) => {
  try {
    // ถ้ามี user_id
    if (user_id) {
      await pool.query(
        "INSERT INTO logs (user_id, action, description) VALUES ($1, $2, $3)",
        [user_id, action, description]
      );
    }
    // ถ้ามี admin_id
    else if (admin_id) {
      await pool.query(
        "INSERT INTO logs (admin_id, action, description) VALUES ($1, $2, $3)",
        [admin_id, action, description]
      );
    }
    // ไม่ทราบว่าใครเป็นคนทำ
    else {
      await pool.query(
        "INSERT INTO logs (action, description) VALUES ($1, $2)",
        [action, `${description} (ไม่ทราบบุคคล)`]
      );
      console.warn("Log ไม่มี user_id หรือ admin_id:", { action, description });
    }
  } catch (err) {
    console.error("Error writing log:", err);
  }
};

module.exports = logAction;
