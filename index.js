require("dotenv").config();
const express = require("express");
const app = express();

const cors = require("cors");
app.use(cors());

app.use(express.json());

// import routes แบบรวม logic ในไฟล์เดียว
const userRoutes = require("./routes/users.js");
app.use("/users", userRoutes);

const adminRoutes = require("./routes/admins.js");
app.use("/admins", adminRoutes);

const productRoutes = require("./routes/products.js");
app.use("/products", productRoutes);

const categoriesRoutes = require("./routes/categories.js");
app.use("/categories", categoriesRoutes);

const ownersRoutes = require("./routes/owners.js");
app.use("/owners", ownersRoutes);

const paymentsystemsRoutes = require("./routes/paymentsystems.js");
app.use("/paymentsystems", paymentsystemsRoutes);

const addressesRouter = require("./routes/addresses");
app.use("/addresses", addressesRouter);

const wishlistRoutes = require("./routes/wishlists.js");
app.use("/wishlists", wishlistRoutes);

const logRoutes = require("./routes/logs.js");
app.use("/logs", logRoutes);

const cartRoutes = require("./routes/carts.js");
app.use("/carts", cartRoutes);

const checkoutRoutes = require("./routes/checkouts.js");
app.use("/checkouts", checkoutRoutes);

const orderUserRoutes = require("./routes/orderUsers.js");
app.use("/orderUsers", orderUserRoutes);

const orderpayRoutes = require("./routes/orderpayments.js");
app.use("/order-payments", orderpayRoutes);

const notificationRoutes = require("./routes/notifications");
app.use("/notifications", notificationRoutes);

const adminorderRoutes = require("./routes/admin-orders.js");
app.use("/adminorders", adminorderRoutes);

const dashboardRoutes = require("./routes/dashboard.js");
app.use("/dashboard", dashboardRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
