const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const bcrypt = require("bcrypt");
const SALT_ROUNDS = 10;

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const logAction = require("../middlewares/logger");

const authenticateUser = require("../middlewares/authUser");

// GET /users
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /users/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /users (สมัครสมาชิก)
router.post("/", async (req, res) => {
  const { firstname, lastname, email, phone, username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      "INSERT INTO users (firstname, lastname, email, phone, username, password, role_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [firstname, lastname, email, phone, username, hashedPassword, 1]
    );
    await logAction(
      result.rows[0].username,
      null,
      "register",
      `User registered: ${username}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Email หรือ Username นี้ถูกใช้งานแล้ว" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /users/login (เข้าสู่ระบบ)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rowCount === 0) {
      await logAction(
        null,
        null,
        "login_failed",
        `User login failed: ${username}`
      );
      return res
        .status(401)
        .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await logAction(
        null,
        null,
        "login_failed",
        `User login failed: ${username}`
      );
      return res
        .status(401)
        .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const payload = {
      userId: user.id,
      username: user.username,
      role_id: user.role_id,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });

    await logAction(
      user.username,
      null,
      "login",
      `User logged in: ${username}`
    );

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: {
        id: user.id,
        username: user.username,
        role_id: user.role_id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      },
    });
  } catch (err) {
    await logAction(null, null, "login_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /users/:id (แก้ไขข้อมูลผู้ใช้งาน)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { firstname, lastname, email, username, password, phone } = req.body;
  try {
    // hash password เฉพาะกรณีมีการส่ง password ใหม่มาด้วย
    let updatePassword = password;
    if (password) {
      updatePassword = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const result = await pool.query(
      "UPDATE users SET firstname=$1, lastname=$2, email=$3, username=$4, password=$5, phone=$6 WHERE id=$7 RETURNING *",
      [firstname, lastname, email, username, updatePassword, phone, id]
    );
    if (result.rowCount === 0) {
      await logAction(
        null,
        null,
        "update_failed",
        `User not found for update: id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    await logAction(
      result.rows[0].username,
      null,
      "update",
      `User updated: ${username}`
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Email หรือ Username นี้ถูกใช้งานแล้ว" });
    } else {
      await logAction(null, null, "update_error", err.message);
      res.status(500).json({ error: err.message });
    }
  }
});

// DELETE /users/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      await logAction(
        null,
        null,
        "delete_failed",
        `User not found for delete: id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }
    await logAction(
      result.rows[0].username,
      null,
      "delete",
      `User deleted: id=${id}`
    );
    res.json({ message: "ลบผู้ใช้งานสำเร็จ", user: result.rows[0] });
  } catch (err) {
    await logAction(null, null, "delete_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /users/me/info (ยืนยันตัวตนด้วย token)
router.get("/me/info", authenticateUser, async (req, res) => {
  const id = req.userId; // ได้จาก token
  try {
    // 1. ข้อมูลส่วนตัว
    const userResult = await pool.query(
      "SELECT id, firstname, lastname, email, phone, username, profile_image FROM users WHERE id = $1",
      [id]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้งานนี้" });
    }

    // 2. ตะกร้าสินค้า
    const cartResult = await pool.query(
      `SELECT c.id as cart_id, c.total_price, c.total_amount, ci.id as cart_item_id, 
              p.id as product_id, p.name as product_name, p.price, ci.amount
         FROM carts c
         LEFT JOIN cartitems ci ON c.id = ci.cart_id
         LEFT JOIN products p ON ci.product_id = p.id
         WHERE c.user_id = $1`,
      [id]
    );

    // 3. สินค้าที่ถูกใจ (wishlist)
    const wishlistResult = await pool.query(
      `SELECT w.id as wishlist_id, p.id as product_id, p.name as product_name, p.price
         FROM wishlists w
         LEFT JOIN products p ON w.product_id = p.id
         WHERE w.user_id = $1`,
      [id]
    );

    // 4. รายการสั่งซื้อ (orders)
    const orderResult = await pool.query(
      `SELECT o.id as order_id, o.status, o.total_price, o.created_at,
              oi.product_id, oi.product_name, oi.product_price, oi.product_amount
         FROM orders o
         LEFT JOIN orderitems oi ON o.id = oi.order_id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC`,
      [id]
    );

    // Group cart items
    let cart = null;
    if (cartResult.rows.length > 0) {
      cart = {
        cart_id: cartResult.rows[0].cart_id,
        total_price: cartResult.rows[0].total_price,
        total_amount: cartResult.rows[0].total_amount,
        items: cartResult.rows
          .filter((row) => row.product_id)
          .map((row) => ({
            cart_item_id: row.cart_item_id,
            product_id: row.product_id,
            product_name: row.product_name,
            price: row.price,
            amount: row.amount,
          })),
      };
    }

    // Group wishlists
    const wishlists = wishlistResult.rows.map((row) => ({
      wishlist_id: row.wishlist_id,
      product_id: row.product_id,
      product_name: row.product_name,
      price: row.price,
    }));

    // Group orders (รวมสินค้าแต่ละ order เป็น array)
    const ordersMap = {};
    orderResult.rows.forEach((row) => {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          order_id: row.order_id,
          status: row.status,
          total_price: row.total_price,
          created_at: row.created_at,
          items: [],
        };
      }
      if (row.product_id) {
        ordersMap[row.order_id].items.push({
          product_id: row.product_id,
          product_name: row.product_name,
          price: row.product_price,
          amount: row.product_amount,
        });
      }
    });
    const orders = Object.values(ordersMap);

    await logAction(
      userResult.rows[0].username,
      null,
      "get_user_info",
      "User viewed personal info"
    );

    res.json({
      user: userResult.rows[0],
      cart: cart,
      wishlists: wishlists,
      orders: orders,
    });
  } catch (err) {
    await logAction(null, null, "get_user_info_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
