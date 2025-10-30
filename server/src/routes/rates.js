const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/rates/:currencyId
// Returns rows: Date, ExchangeRate, MarginValue
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid currency id' });

  try {
    const sql = `
      SELECT cr.Date as Date, cr.ExchangeRate as ExchangeRate, cr.MarginId as MarginId, m.MarginValue as MarginValue
      FROM CurrencyRates cr
      LEFT JOIN Margins m ON cr.MarginId = m.Id
      WHERE cr.ToCurrencyId = ?
      ORDER BY cr.Date ASC
    `;
    const [rows] = await pool.query(sql, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
