const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { protect } = require('../middleware/authMiddleware');

// GET /api/margins
// Returns margin records with author info. Auth required to keep audit data private.
router.get('/', protect, async (req, res) => {
  const { active } = req.query || {};
  const filters = [];
  const params = [];

  if (String(active).toLowerCase() === 'true') {

    // Only margins that are currently effective
    filters.push('(m.StartDate IS NULL OR m.StartDate <= CURRENT_DATE())');
    filters.push('(m.EndDate IS NULL OR m.EndDate >= CURRENT_DATE())');
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const sql = `
      SELECT 
        m.Id,
        m.MarginValue,
        m.StartDate,
        m.EndDate,
        m.UserId,
        u.Email AS UserEmail,
        u.FirstName AS UserFirstName,
        u.LastName AS UserLastName
      FROM Margins m
      LEFT JOIN Users u ON u.Id = m.UserId
      ${whereSql}
      ORDER BY m.StartDate DESC, m.EndDate DESC, m.Id DESC
    `;

    const [rows] = await pool.query(sql, params);

    
    return res.json(rows || []);
  } catch (err) {
    console.error('GET /api/margins failed', err);

    return res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
