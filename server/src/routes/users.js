const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const { protect } = require('../middleware/authMiddleware');

// Simple admin gate reused across admin endpoints
function ensureAdmin(req, res) {
  const role = req.user && req.user.role;

  // Deny access if not admin
  if (!role || String(role).toLowerCase() !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// GET /api/users
// Admin-only: fetch list of users for management table
router.get('/', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const sql = `
      SELECT Id, Email, FirstName, LastName, Role, CreatedAt, LastLogin, IsDeleted 
      FROM Users
      ORDER BY CreatedAt DESC, Id DESC
    `;
    const [rows] = await pool.query(sql);
    res.json(rows || []);
  } catch (err) {
    console.error('GET /api/users failed', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// POST /api/users/create
// Admin-only: create a new user
router.post('/create', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { firstName, lastName, email, password, role } = req.body || {};

  // Validation
  if (!firstName || !firstName.trim()) {
    return res.status(400).json({ error: 'First name is required' });
  }
  if (!lastName || !lastName.trim()) {
    return res.status(400).json({ error: 'Last name is required' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  // Require at least one digit or special character
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(password);
  if (!hasDigitOrSymbol) {
    return res.status(400).json({ error: 'Password must contain at least one digit or special character' });
  }

  const validRoles = ['user', 'admin'];
  const selectedRole = role && validRoles.includes(role) ? role : 'user';

  try {
    // Check if email already exists
    const [existing] = await pool.query('SELECT Id FROM Users WHERE Email = ?', [email.trim()]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password before storing
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new user record
    const sql = `
      INSERT INTO Users (Email, PasswordHash, FirstName, LastName, Role, CreatedAt, IsDeleted)
      VALUES (?, ?, ?, ?, ?, NOW(), 0)
    `;
    const [result] = await pool.query(sql, [
      email.trim(),
      passwordHash,
      firstName.trim(),
      lastName.trim(),
      selectedRole
    ]);

    res.status(201).json({ 
      ok: true, 
      userId: result.insertId,
      message: 'User created successfully' 
    });
  } catch (err) {
    console.error('POST /api/users/create failed', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST /api/users/set-status
// Admin-only: activate/deactivate a user by toggling IsDeleted
router.post('/delete-user', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { userId, isDeleted } = req.body || {};
  const uid = Number(userId);
  const flag = Number(isDeleted);

  if (!Number.isInteger(uid) || uid <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  if (flag !== 0 && flag !== 1) {
    return res.status(400).json({ error: 'Invalid isDeleted flag' });
  }

  try {
    const [result] = await pool.query('UPDATE Users SET IsDeleted = ? WHERE Id = ?', [flag, uid]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ ok: true, userId: uid, isDeleted: flag });
  } catch (err) {
    console.error('POST /api/users/delete-user failed', err);
    return res.status(500).json({ error: 'Failed to update user status' });
  }
});

// POST /api/users/change-role
// Admin-only: update a user's role
router.post('/change-role', protect, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { userId, role } = req.body || {};
  const uid = Number(userId);
  const validRoles = ['user', 'admin'];
  const nextRole = role && validRoles.includes(String(role).toLowerCase()) ? String(role).toLowerCase() : null;

  if (!Number.isInteger(uid) || uid <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  if (!nextRole) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const [result] = await pool.query('UPDATE Users SET Role = ? WHERE Id = ?', [nextRole, uid]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ ok: true, userId: uid, role: nextRole });
  } catch (err) {
    console.error('POST /api/users/change-role failed', err);
    return res.status(500).json({ error: 'Failed to change role' });
  }
});

module.exports = router;
