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

const addressRoutes = require("./routes/address.js");
app.use("/address", addressRoutes);

const wishlistRoutes = require("./routes/wishlists.js");
app.use("/wishlists", wishlistRoutes);

const logRoutes = require("./routes/logs.js");
app.use("/logs", logRoutes);

const cartRoutes = require("./routes/carts.js");
app.use("/carts", cartRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
