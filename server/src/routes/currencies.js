const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Get all currencies
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT Id, CurrencyCode FROM Currencies'); // Fetch currency list
    // console.log("1 - "+rows);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
