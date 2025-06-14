require("dotenv").config();
const express = require("express");
const app = express();

app.use(express.json());

// import routes แบบรวม logic ในไฟล์เดียว
const userRoutes = require("./routes/users.js");
app.use("/users", userRoutes);

const adminRoutes = require("./routes/admins.js");
app.use("/admins", adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
