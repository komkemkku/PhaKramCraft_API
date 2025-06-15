const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const checkRole = require("../middlewares/checkRole");
const authenticateAdmin = require("../middlewares/authenticateAdmin");
const logAction = require("../middlewares/logger");

// GET /products (user จะเห็น is_favorite, is_cart)
router.get("/", checkRole, async (req, res) => {
  const user_id = req.userId || null;
  try {
    let result;
    if (user_id) {
      // ถ้าเป็น user: แสดง is_favorite, is_cart
      // หาตะกร้าล่าสุด
      const cartRes = await pool.query(
        "SELECT id FROM carts WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
        [user_id]
      );
      const cart_id = cartRes.rows.length > 0 ? cartRes.rows[0].id : null;
      result = await pool.query(
        `
        SELECT 
          p.*,
          c.name AS category_name,
          CASE WHEN w.id IS NULL THEN false ELSE true END AS is_favorite,
          CASE WHEN ci.id IS NULL THEN false ELSE true END AS is_cart
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN wishlists w ON w.product_id = p.id AND w.user_id = $1
        LEFT JOIN cartitems ci ON ci.product_id = p.id AND ci.cart_id = $2
        ORDER BY p.id DESC
      `,
        [user_id, cart_id]
      );
    } else {
      // admin หรือ guest
      result = await pool.query(`
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.id DESC
      `);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id (user จะเห็น is_favorite, is_cart)
router.get("/:id", checkRole, async (req, res) => {
  const user_id = req.userId || null;
  const { id } = req.params;
  try {
    let result;
    if (user_id) {
      const cartRes = await pool.query(
        "SELECT id FROM carts WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
        [user_id]
      );
      const cart_id = cartRes.rows.length > 0 ? cartRes.rows[0].id : null;
      result = await pool.query(
        `
        SELECT 
          p.*,
          c.name AS category_name,
          CASE WHEN w.id IS NULL THEN false ELSE true END AS is_favorite,
          CASE WHEN ci.id IS NULL THEN false ELSE true END AS is_cart
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN wishlists w ON w.product_id = p.id AND w.user_id = $1
        LEFT JOIN cartitems ci ON ci.product_id = p.id AND ci.cart_id = $2
        WHERE p.id = $3
      `,
        [user_id, cart_id, id]
      );
    } else {
      result = await pool.query(
        `
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1
      `,
        [id]
      );
    }
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products (admin เท่านั้น)
router.post("/", authenticateAdmin, async (req, res) => {
  const {
    name,
    price,
    cost,
    description,
    stock = 0,
    is_active = true,
    category_id,
    owner_id,
  } = req.body;

  if (!name || !price || !category_id) {
    return res
      .status(400)
      .json({ error: "กรุณาระบุชื่อสินค้า, ราคา, และหมวดหมู่" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, cost, description, stock, is_active, category_id, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, price, cost, description, stock, is_active, category_id, owner_id]
    );
    await logAction(
      null,
      req.adminId,
      "create_product",
      `Admin id=${req.adminId} สร้างสินค้าใหม่ "${name}" หมวด id=${category_id}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "create_product_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /products/:id (admin เท่านั้น)
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    price,
    cost,
    description,
    stock,
    is_active,
    category_id,
    owner_id,
  } = req.body;
  try {
    const oldResult = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "update_product_failed",
        `ไม่พบสินค้า id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }
    const oldProduct = oldResult.rows[0];

    const result = await pool.query(
      `UPDATE products SET
         name=$1, price=$2, cost=$3, description=$4, stock=$5,
         is_active=$6, category_id=$7, owner_id=$8, updated_at=NOW()
       WHERE id = $9 RETURNING *`,
      [
        name,
        price,
        cost,
        description,
        stock,
        is_active,
        category_id,
        owner_id,
        id,
      ]
    );
    await logAction(
      null,
      req.adminId,
      "update_product",
      `Admin id=${req.adminId} แก้ไขสินค้า id=${id} จาก "${oldProduct.name}" => "${name}"`
    );
    res.json(result.rows[0]);
  } catch (err) {
    await logAction(null, req.adminId, "update_product_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id (admin เท่านั้น)
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const oldResult = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      await logAction(
        null,
        req.adminId,
        "delete_product_failed",
        `ไม่พบสินค้า id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }
    const oldProduct = oldResult.rows[0];

    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );
    await logAction(
      null,
      req.adminId,
      "delete_product",
      `Admin id=${req.adminId} ลบสินค้า id=${id} ชื่อ="${oldProduct.name}"`
    );
    res.json({ message: "ลบสินค้าสำเร็จ", product: result.rows[0] });
  } catch (err) {
    await logAction(null, req.adminId, "delete_product_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
