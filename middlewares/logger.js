const pool = require("../db");

/**
 * logAction
 * @param {string} username - ชื่อผู้ใช้ทั่วไป
 * @param {string} adminname - ชื่อแอดมิน
 * @param {string} action
 * @param {string} description
 */
const logAction = async (username, adminname, action, description) => {
  try {
    if (username) {
      await pool.query(
        "INSERT INTO logs (username, action, description) VALUES ($1, $2, $3)",
        [username, action, description]
      );
    } else if (adminname) {
      await pool.query(
        "INSERT INTO logs (adminname, action, description) VALUES ($1, $2, $3)",
        [adminname, action, description]
      );
    } else {
      await pool.query(
        "INSERT INTO logs (action, description) VALUES ($1, $2)",
        [action, `${description} (ไม่ทราบบุคคล)`]
      );
      console.warn("Log ไม่มี username หรือ adminname:", {
        action,
        description,
      });
    }
  } catch (err) {
    console.error("Error writing log:", err);
  }
};

module.exports = logAction;
