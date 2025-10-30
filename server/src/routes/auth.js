const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

// POST /api/auth/login
// body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const [rows] = await pool.query('SELECT Id, Email, PasswordHash, FirstName, LastName FROM Users WHERE Email = ?', [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // Special-case bypass for development testing: allow login for this email without checking password.
    const BYPASS_EMAIL = 'smmaks2004@gmail.com';
    let ok = false;
    if (email && email.toLowerCase() === BYPASS_EMAIL) {
      console.warn('Auth bypass used for', email);
      ok = true;
    } else {
      const hash = user.PasswordHash || '';
      // If hash looks like a bcrypt hash, use bcrypt compare, otherwise compare plaintext (fallback)
      if (typeof hash === 'string' && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'))) {
        ok = await bcrypt.compare(password || '', hash);
      } else {
        // fallback insecure compare
        ok = password === hash;
      }
    }

    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // update last login (best-effort)
    try {
      await pool.query('UPDATE Users SET LastLogin = NOW() WHERE Id = ?', [user.Id]);
    } catch (e) {
      console.error('Failed to update last login', e);
    }

    // return safe user object
    return res.json({ Id: user.Id, Email: user.Email, FirstName: user.FirstName, LastName: user.LastName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
