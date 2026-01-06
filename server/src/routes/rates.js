const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); ///
const pool = require('../db/pool');

// GET /api/rates/bulk?ids=1,2,3&dateFrom=2024-01-01&dateTo=2024-12-31
// Public: returns rows for multiple currencies in one request to cut N network calls
router.get('/bulk', async (req, res) => {
  const raw = req.query.ids;
  if (!raw) return res.status(400).json({ error: 'ids query param is required' });

  // Parse currency IDs
  const ids = String(raw)
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0);

  if (!ids.length) return res.status(400).json({ error: 'No valid currency ids' });

  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
  const whereParts = ['cr.ToCurrencyId IN (?)'];
  const params = [ids];
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
    whereParts.push('cr.Date >= ?');
    params.push(dateFrom);
  }
  if (dateTo && !Number.isNaN(dateTo.getTime())) {
    whereParts.push('cr.Date <= ?');
    params.push(dateTo);
  }

  try {
    const sql = `
      SELECT cr.Id as Id, cr.ToCurrencyId as ToCurrencyId, cr.Date as Date, cr.ExchangeRate as ExchangeRate, cr.MarginId as MarginId, m.MarginValue as MarginValue
      FROM CurrencyRates cr
      LEFT JOIN Margins m ON cr.MarginId = m.Id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY cr.ToCurrencyId ASC, cr.Date ASC
    `;
    const [rows] = await pool.query(sql, params);

    // Group rows by currencyId to keep backward-compatible shape for the client
    const grouped = {};
    for (const r of rows) {
      const key = String(r.ToCurrencyId);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        Id: r.Id,
        Date: r.Date,
        ExchangeRate: r.ExchangeRate,
        MarginId: r.MarginId,
        MarginValue: r.MarginValue
      });
    }

    return res.json({ data: grouped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'DB error' });
  }
});

// CHECK
// Add a small endpoint to let the frontend verify the cookie-based auth
router.get('/auth-check', protect, (req, res) => {
    // If this handler runs, the cookie token was valid
    res.json({ 
        authorized: true, 
        user: { id: req.user.id, email: req.user.email } 
    });
});

// GET /api/rates/:currencyId
// Public route: exchange rate data is available without authentication
router.get('/:currencyId', async (req, res) => {
  // console.log(`Rates request for: ${req.params.currencyId}`);

    const id = Number(req.params.currencyId);
    if (!id) return res.status(400).json({ error: 'Invalid currency id' });

    try {
      const sql = `
        SELECT cr.Id as Id, cr.Date as Date, cr.ExchangeRate as ExchangeRate, cr.MarginId as MarginId, m.MarginValue as MarginValue
        FROM CurrencyRates cr
        LEFT JOIN Margins m ON cr.MarginId = m.Id
        WHERE cr.ToCurrencyId = ?
        ORDER BY cr.Date ASC
      `;
      const [rows] = await pool.query(sql, [id]);
      return res.json(rows);
    } catch (err) {
      console.error(err);

      return res.status(500).json({ error: 'DB error' });
    }
});

module.exports = router;