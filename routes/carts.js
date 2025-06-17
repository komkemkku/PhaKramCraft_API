const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateUser = require("../middlewares/authUser");

// Helper: คำนวณราคารวม/จำนวนทั้งหมดใหม่
async function updateCartSummary(cart_id) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount),0) as total_amount
          , COALESCE(SUM(amount * p.price),0) as total_price
     FROM cartitems ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.cart_id = $1`,
    [cart_id]
  );
  const { total_amount, total_price } = result.rows[0];
  await pool.query(
    "UPDATE carts SET total_amount = $1, total_price = $2, updated_at = NOW() WHERE id = $3",
    [total_amount, total_price, cart_id]
  );
  return { total_amount: +total_amount, total_price: +total_price };
}

// Helper: เช็คและลบ cart ถ้าไม่มีสินค้าเหลือ
async function removeCartIfEmpty(cart_id) {
  const check = await pool.query(
    "SELECT COUNT(*) FROM cartitems WHERE cart_id = $1",
    [cart_id]
  );
  if (parseInt(check.rows[0].count, 10) === 0) {
    // ถ้าไม่มีสินค้าเหลือ เปลี่ยนสถานะ cart เป็น checkedout (หรือจะลบ cart ก็ได้)
    await pool.query("UPDATE carts SET status = 'checkedout' WHERE id = $1", [
      cart_id,
    ]);
    // ถ้าอยากลบ cart ทิ้งให้ uncomment บรรทัดนี้:
    // await pool.query("DELETE FROM carts WHERE id = $1", [cart_id]);
    return true;
  }
  return false;
}

// GET /carts : ตะกร้าปัจจุบัน
router.get("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  // ดึงเฉพาะ cart ที่ status = 'active'
  const cartRes = await pool.query(
    "SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [user_id]
  );
  if (cartRes.rowCount === 0) return res.json({ cart: null });
  const cart = cartRes.rows[0];
  // ดึง cartitems + รายละเอียดสินค้า
  const itemsRes = await pool.query(
    `SELECT ci.*, p.name, p.price, p.img
     FROM cartitems ci
     LEFT JOIN products p ON ci.product_id = p.id
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cart.id]
  );
  cart.cartitems = itemsRes.rows;
  res.json({ cart });
});

// POST /carts/add : เพิ่มสินค้าลงตะกร้า (สร้าง cart อัตโนมัติ)
router.post("/add", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { product_id, amount = 1 } = req.body;
  if (!product_id || amount < 1)
    return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
  // หา cart ที่ยัง active
  let cart = await pool.query(
    "SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [user_id]
  );
  let cart_id;
  if (cart.rowCount === 0) {
    // ยังไม่มี cart ให้สร้างใหม่
    const newCart = await pool.query(
      "INSERT INTO carts (user_id, total_price, total_amount, status, created_at, updated_at) VALUES ($1, 0, 0, 'active', NOW(), NOW()) RETURNING *",
      [user_id]
    );
    cart_id = newCart.rows[0].id;
  } else {
    cart_id = cart.rows[0].id;
  }
  // เช็คว่ามีสินค้านี้ใน cartitem อยู่แล้วไหม
  const existed = await pool.query(
    "SELECT * FROM cartitems WHERE cart_id = $1 AND product_id = $2",
    [cart_id, product_id]
  );
  let cartitem;
  if (existed.rowCount > 0) {
    // ถ้ามีอยู่แล้ว บวกจำนวน
    cartitem = await pool.query(
      "UPDATE cartitems SET amount = amount + $1, selected = true, updated_at = NOW() WHERE id = $2 RETURNING *",
      [amount, existed.rows[0].id]
    );
  } else {
    // เพิ่มใหม่
    cartitem = await pool.query(
      "INSERT INTO cartitems (cart_id, product_id, amount, selected, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW()) RETURNING *",
      [cart_id, product_id, amount]
    );
  }
  await updateCartSummary(cart_id);
  res.json({ cartitem: cartitem.rows[0] });
});

// PUT /carts/item/:id : แก้ไขจำนวน/เลือกจ่าย
router.put("/item/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const itemId = req.params.id;
  const { amount, selected } = req.body;
  // หาว่าเป็นของ user เองไหม
  const cartitemRes = await pool.query(
    `SELECT ci.*, c.user_id, c.status FROM cartitems ci 
      JOIN carts c ON ci.cart_id = c.id 
      WHERE ci.id = $1`,
    [itemId]
  );
  if (
    cartitemRes.rowCount === 0 ||
    cartitemRes.rows[0].user_id !== user_id ||
    cartitemRes.rows[0].status !== "active"
  ) {
    return res.status(404).json({ error: "ไม่พบรายการหรือไม่มีสิทธิ์" });
  }
  const cart_id = cartitemRes.rows[0].cart_id;

  // ลบถ้า amount < 1
  if (amount !== undefined && amount < 1) {
    await pool.query("DELETE FROM cartitems WHERE id = $1", [itemId]);
    await updateCartSummary(cart_id);
    await removeCartIfEmpty(cart_id);
    return res.json({ message: "ลบสินค้าเรียบร้อย" });
  }

  // กรณีอัปเดตทั้ง amount และ selected
  if (amount !== undefined && selected !== undefined) {
    const updated = await pool.query(
      "UPDATE cartitems SET amount = $1, selected = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      [amount, selected, itemId]
    );
    await updateCartSummary(cart_id);
    return res.json({ cartitem: updated.rows[0] });
  }

  // กรณีอัปเดตเฉพาะ selected
  if (amount === undefined && selected !== undefined) {
    const updated = await pool.query(
      "UPDATE cartitems SET selected = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [selected, itemId]
    );
    return res.json({ cartitem: updated.rows[0] });
  }

  // กรณีอัปเดตแค่ amount
  if (amount !== undefined) {
    const updated = await pool.query(
      "UPDATE cartitems SET amount = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [amount, itemId]
    );
    await updateCartSummary(cart_id);
    return res.json({ cartitem: updated.rows[0] });
  }

  // ไม่มี field อะไรให้เปลี่ยน
  return res.json({ message: "no changes" });
});

// DELETE /carts/item/:id : ลบสินค้าออกจาก cartitem
router.delete("/item/:id", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const itemId = req.params.id;
  // หาว่าเป็นของ user เองไหม
  const cartitemRes = await pool.query(
    `SELECT ci.*, c.user_id, c.status FROM cartitems ci 
      JOIN carts c ON ci.cart_id = c.id 
      WHERE ci.id = $1`,
    [itemId]
  );
  if (
    cartitemRes.rowCount === 0 ||
    cartitemRes.rows[0].user_id !== user_id ||
    cartitemRes.rows[0].status !== "active"
  ) {
    return res.status(404).json({ error: "ไม่พบรายการหรือไม่มีสิทธิ์" });
  }
  const cart_id = cartitemRes.rows[0].cart_id;
  await pool.query("DELETE FROM cartitems WHERE id = $1", [itemId]);
  await updateCartSummary(cart_id);
  await removeCartIfEmpty(cart_id);
  return res.json({ message: "ลบสินค้าเรียบร้อย" });
});

module.exports = router;
