require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const PORT = process.env.PORT || 3000;

console.log('Postgres Pool created');
console.log(`API Server will run on port ${PORT}`);

// (code อื่นๆ ของคุณ)
