const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); ///
const pool = require('../db/pool');

// CHECK
// Add a small endpoint to let the frontend verify the cookie-based auth
router.get('/auth-check', protect, (req, res) => {
    // If this handler runs, the cookie token was valid
    res.json({ 
        authorized: true, 
        user: { id: req.user.id, email: req.user.email } 
    });
});

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