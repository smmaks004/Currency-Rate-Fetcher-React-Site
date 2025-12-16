// mysql2 + promise
const mysql = require('mysql2/promise');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

let pool = null;

const getAiReadOnlyPool = () => {
  if (pool) return pool;

  const user = (process.env.DB_AI_RO_USER || '').trim();
  const password = (process.env.DB_AI_RO_PASS || '').trim();

  if (!user || !password) {
    throw new Error('AI read-only DB credentials are not configured. Set DB_AI_RO_USER and DB_AI_RO_PASS in server/.env');
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user,
    password,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    port: process.env.DB_PORT || 3306
  });

  return pool;
};

module.exports = { getAiReadOnlyPool };
