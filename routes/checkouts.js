const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateUser = require("../middlewares/authUser");

// Helper: อัปเดตราคารวม/จำนวน cart (optional, ถ้าใช้ summary)
async function updateCartSummary(client, cart_id) {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount),0) as total_amount,
            COALESCE(SUM(amount * p.price),0) as total_price
     FROM cartitems ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.cart_id = $1`,
    [cart_id]
  );
  const { total_amount, total_price } = result.rows[0];
  await client.query(
    "UPDATE carts SET total_amount = $1, total_price = $2, updated_at = NOW() WHERE id = $3",
    [total_amount, total_price, cart_id]
  );
  return { total_amount: +total_amount, total_price: +total_price };
}

// POST /checkouts
router.post("/", authenticateUser, async (req, res) => {
  const user_id = req.userId;
  const { address_id, cartitem_ids } = req.body;

  if (
    !address_id ||
    !Array.isArray(cartitem_ids) ||
    cartitem_ids.length === 0
  ) {
    return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // หา cart ปัจจุบัน (active)
    const cartRes = await client.query(
      "SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      [user_id]
    );
    if (cartRes.rowCount === 0) throw new Error("ไม่พบตะกร้าสินค้าปัจจุบัน");
    const cart = cartRes.rows[0];
    const cart_id = cart.id;

    // ดึง cartitems ที่เลือก (ต้อง belong to cart ของ user และเป็น id ที่ส่งมา)
    const cartItemsRes = await client.query(
      `SELECT ci.*, p.name AS product_name, p.price AS product_price, p.stock, p.id AS product_id
        FROM cartitems ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.cart_id = $1 AND ci.id = ANY($2::int[])`,
      [cart_id, cartitem_ids]
    );
    const cartItems = cartItemsRes.rows;
    if (!cartItems.length) throw new Error("ไม่พบสินค้าในตะกร้าที่เลือก");

    // ตรวจสอบว่ามี cartitem ที่ไม่ใช่ของ user หรือไม่มีอยู่จริง
    if (cartItems.length !== cartitem_ids.length) {
      throw new Error("รายการสินค้าไม่ถูกต้อง");
    }

    // ตรวจสอบ stock
    for (const item of cartItems) {
      if (item.stock < item.amount) {
        throw new Error(
          `Stock สินค้า "${item.product_name}" ไม่พอ (เหลือ ${item.stock})`
        );
      }
    }

    // สร้าง order
    const total_price =
      cartItems.reduce(
        (sum, item) => sum + item.product_price * item.amount,
        0
      ) + 50; // + ค่าจัดส่ง
    const total_amount = cartItems.reduce((sum, item) => sum + item.amount, 0);

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, cart_id, address_id, total_price, total_amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [user_id, cart_id, address_id, total_price, total_amount, "pending"]
    );
    const order = orderRes.rows[0];

    // คัดลอกไป orderitems + อัปเดต stock
    for (const item of cartItems) {
      await client.query(
        `INSERT INTO orderitems (order_id, product_id, product_name, product_price, product_amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          order.id,
          item.product_id,
          item.product_name,
          item.product_price,
          item.amount,
        ]
      );
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.amount, item.product_id]
      );
    }

    // ลบ cartitems ที่สั่งซื้อ
    await client.query("DELETE FROM cartitems WHERE id = ANY($1::int[])", [
      cartitem_ids,
    ]);

    // อัปเดตยอด cart (ถ้ามี summary)
    await updateCartSummary(client, cart_id);

    // ตรวจสอบว่ายังมี cartitem เหลือไหม
    const cartitemLeftRes = await client.query(
      "SELECT COUNT(*) FROM cartitems WHERE cart_id = $1",
      [cart_id]
    );
    const left = parseInt(cartitemLeftRes.rows[0].count, 10);

    if (left === 0) {
      // ไม่มีสินค้าเหลือ เปลี่ยน status cart เป็น checkedout
      await client.query(
        "UPDATE carts SET status = 'checkedout', updated_at = NOW() WHERE id = $1",
        [cart_id]
      );
      // หรือจะลบ cart ไปเลยก็ได้ (ถ้าอยากลบ)
      // await client.query("DELETE FROM carts WHERE id = $1", [cart_id]);
    }
    // ถ้ายังเหลือสินค้าใน cart, ไม่ต้องเปลี่ยน status

    await client.query("COMMIT");
    return res.json({ order_id: order.id, status: "ok" });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
