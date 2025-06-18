const express = require("express");
const router = express.Router();
const pool = require("../db");
require("dotenv").config();

const checkRole = require("../middlewares/checkRole");
const authenticateAdmin = require("../middlewares/authenticateAdmin");
const logAction = require("../middlewares/logger");

// ฟังก์ชันช่วย: ดึง admin username จาก adminId
async function getAdminUsername(adminId) {
  if (!adminId) return null;
  const result = await pool.query("SELECT username FROM admins WHERE id = $1", [
    adminId,
  ]);
  return result.rows.length > 0 ? result.rows[0].username : null;
}

// GET /products (user จะเห็น is_favorite, is_cart)
router.get("/", checkRole, async (req, res) => {
  const user_id = req.userId || null;
  try {
    let result;
    if (user_id) {
      // ถ้าเป็น user: แสดง is_favorite, is_cart
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
    img, // <<-- ฟิลด์ลิงก์รูปเดียว
  } = req.body;

  if (!name || !price || !category_id) {
    return res
      .status(400)
      .json({ error: "กรุณาระบุชื่อสินค้า, ราคา, และหมวดหมู่" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, cost, description, stock, is_active, category_id, owner_id, img)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name,
        price,
        cost,
        description,
        stock,
        is_active,
        category_id,
        owner_id,
        img,
      ]
    );
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "create_product",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) สร้างสินค้าใหม่ "${name}" หมวด id=${category_id}`
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "create_product_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /products/:id (admin เท่านั้น)
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  // ดึงฟิลด์ทั้งหมดที่รับมา
  const {
    name,
    price,
    cost,
    description,
    stock,
    is_active,
    category_id,
    owner_id,
    img, // <<-- ฟิลด์ลิงก์รูปเดียว
  } = req.body;
  try {
    const oldResult = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);
    if (oldResult.rowCount === 0) {
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
        "update_product_failed",
        `ไม่พบสินค้า id=${id}`
      );
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }
    const oldProduct = oldResult.rows[0];

    // เตรียม setFields/params เฉพาะ field ที่ส่งมา
    const setFields = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) {
      setFields.push(`name=$${idx++}`);
      params.push(name);
    }
    if (price !== undefined) {
      setFields.push(`price=$${idx++}`);
      params.push(price);
    }
    if (cost !== undefined) {
      setFields.push(`cost=$${idx++}`);
      params.push(cost);
    }
    if (description !== undefined) {
      setFields.push(`description=$${idx++}`);
      params.push(description);
    }
    if (stock !== undefined) {
      setFields.push(`stock=$${idx++}`);
      params.push(stock);
    }
    if (is_active !== undefined) {
      setFields.push(`is_active=$${idx++}`);
      params.push(is_active);
    }
    if (category_id !== undefined) {
      setFields.push(`category_id=$${idx++}`);
      params.push(category_id);
    }
    if (owner_id !== undefined) {
      setFields.push(`owner_id=$${idx++}`);
      params.push(owner_id);
    }
    if (img !== undefined) {
      // <<-- อัปเดต img ถ้ามี
      setFields.push(`img=$${idx++}`);
      params.push(img);
    }
    setFields.push(`updated_at=NOW()`);

    const q = `UPDATE products SET ${setFields.join(
      ", "
    )} WHERE id = $${idx} RETURNING *`;
    params.push(id);

    const result = await pool.query(q, params);

    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "update_product",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) แก้ไขสินค้า id=${id} จาก "${oldProduct.name}" => "${
        name || oldProduct.name
      }"`
    );
    res.json(result.rows[0]);
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "update_product_error", err.message);
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
      const adminUsername = await getAdminUsername(req.adminId);
      await logAction(
        null,
        adminUsername,
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
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(
      null,
      adminUsername,
      "delete_product",
      `Admin (${
        adminUsername || "id=" + req.adminId
      }) ลบสินค้า id=${id} ชื่อ="${oldProduct.name}"`
    );
    res.json({ message: "ลบสินค้าสำเร็จ", product: result.rows[0] });
  } catch (err) {
    const adminUsername = await getAdminUsername(req.adminId);
    await logAction(null, adminUsername, "delete_product_error", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
