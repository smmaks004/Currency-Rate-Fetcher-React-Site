const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { protect } = require('../middleware/authMiddleware');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// Sign token
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

// POST /update-profile
// Protected: update user's first/last name and email. Re-issues JWT cookie with updated payload.
router.post('/update-profile', protect, async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  const userId = req.user && req.user.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const newEmail = typeof email === 'string' ? email.trim() : null;

    if (newEmail) {
      const [existingRows] = await pool.query('SELECT Id FROM Users WHERE Email = ?', [newEmail]);
      if (existingRows && existingRows.length > 0 && existingRows[0].Id !== userId) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    await pool.query('UPDATE Users SET FirstName = ?, LastName = ?, Email = ? WHERE Id = ?', [firstName || null, lastName || null, newEmail || null, userId]);

    // Read back updated user
    const [rows] = await pool.query('SELECT Id, Email, FirstName, LastName, Role FROM Users WHERE Id = ?', [userId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];

    // Re-sign token with updated payload and set cookie
    const token = signToken({ id: u.Id, email: u.Email, role: u.Role, firstName: u.FirstName, lastName: u.LastName });
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1 * 24 * 60 * 60 * 1000,
      path: '/'
    };
    res.cookie('token', token, cookieOptions);

    return res.json({ Id: u.Id, Email: u.Email, FirstName: u.FirstName, LastName: u.LastName, Role: u.Role });
  } catch (err) {
    console.error('POST /update-profile failed', err);

    res.status(500).json({ error: 'Update failed' });
  }
});


// Simple admin gate, relies on protect middleware attaching req.user.role
function ensureAdmin(req, res) {
  const role = req.user && req.user.role;
  if (!role || String(role).toLowerCase() !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// POST /update-ecbRate
// Update existing currency rate's ECB rate (admin-only)
router.post('/update-ecbRate', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { rateId, exchangeRate } = req.body || {};
  const rid = Number(rateId);
  const rateNum = Number(exchangeRate);
  if (!Number.isFinite(rid) || rid <= 0 || !Number.isFinite(rateNum) || rateNum <= 0) {
    return res.status(400).json({ error: 'Invalid payload: require positive rateId and exchangeRate' });
  }

  try {
    const sql = `UPDATE CurrencyRates SET ExchangeRate = ? WHERE Id = ?`;
    const [result] = await pool.query(sql, [rateNum, rid]);
    if (!result || result.affectedRows === 0) return res.status(404).json({ error: 'Rate record not found' });
    
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /update-ecbRate failed', err);

    return res.status(500).json({ error: 'DB error' });
  }
});


// POST /update-createCurrency
// Create a new currency (admin-only)
router.post('/update-createCurrency', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { currencyCode } = req.body || {};
  if (typeof currencyCode !== 'string') {
    return res.status(400).json({ error: 'Invalid currency code' });
  }
  const code = currencyCode.trim().toUpperCase();
  if (!code || code.length !== 3) return res.status(400).json({ error: 'Invalid currency code' });

  try {
    // Check if currency already exists
    const [existingRows] = await pool.query('SELECT Id FROM Currencies WHERE CurrencyCode = ?', [code]);
    if (existingRows && existingRows.length > 0) {
      return res.status(400).json({ error: 'Currency code already exists' });
    }
    // Insert new currency
    const [result] = await pool.query('INSERT INTO Currencies (CurrencyCode) VALUES (?)', [code]);
    if (!result || result.affectedRows === 0) {
      return res.status(500).json({ error: 'Insert failed' });
    }
    return res.json({ success: true, currencyId: result.insertId });
  } catch (err) {
    console.error('POST /update-createCurrency failed', err);
    
    return res.status(500).json({ error: 'DB error' });
  }
});





module.exports = router;
