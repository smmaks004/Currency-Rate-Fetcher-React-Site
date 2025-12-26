const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { sendPasswordResetCodeEmail } = require('../utils/mailtrapMailer');

// -----------------------------
// Password reset (in-memory storage)
// -----------------------------
const RESET_CODE_LENGTH = 6;
const RESET_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESET_CODE_ATTEMPTS = 5;
const RESET_CODE_SECRET = process.env.RESET_CODE_SECRET;

function computeCodeHash(code) {
  if (!code) return null;
  return crypto.createHmac('sha256', RESET_CODE_SECRET).update(String(code)).digest('hex');
}

const passwordResetStore = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, chars.length);
    result += chars[idx];
  }
  return result;
}

function isExpired(entry) {
  return !entry || Date.now() > entry.expiresAt;
}

// -----------------------------
// Routes
// -----------------------------

// POST /api/password-reset/request
router.post('/request', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, error: 'Email required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT Id, IsDeleted+0 AS IsDeletedVal FROM Users WHERE LOWER(Email) = ? LIMIT 1',
      [normalizedEmail]
    );

    const user = rows && rows[0];

    if (user) {
      if (user.IsDeletedVal === 1) {
        console.log(`[password-reset] Blocked request for deleted account: ${normalizedEmail}`);
        return res.status(403).json({ ok: false, error: 'Account is deleted' });
      }

      const code = generateRandomString(RESET_CODE_LENGTH);
      const codeHash = computeCodeHash(code);
      const now = Date.now();

      passwordResetStore.set(normalizedEmail, {
        codeHash,
        expiresAt: now + RESET_CODE_TTL_MS,
        attemptsLeft: RESET_CODE_ATTEMPTS,
      });

      await sendPasswordResetCodeEmail({
        to: email,
        code,
        expiresInMinutes: Math.floor(RESET_CODE_TTL_MS / 60000),
      });

    } else {
      // Simulate delay for non-existent emails
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return res.json({
      ok: true,
      message: 'If this email exists and is active, a code has been sent.',
      expiresInSeconds: Math.floor(RESET_CODE_TTL_MS / 1000)
    });

  } catch (e) {
    console.error('[password-reset] Error processing request:', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/password-reset/verify
router.post('/verify', async (req, res) => {
  const { email, code } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code || '').trim().toUpperCase();

  if (!normalizedEmail || !normalizedCode) {
    return res.status(400).json({ ok: false, error: 'Email and code required' });
  }

  const entry = passwordResetStore.get(normalizedEmail);

  if (!entry || isExpired(entry)) {
    passwordResetStore.delete(normalizedEmail);
    return res.status(400).json({ ok: false, error: 'Code expired or invalid' });
  }

  if (entry.attemptsLeft <= 0) {
    passwordResetStore.delete(normalizedEmail);
    return res.status(429).json({ ok: false, error: 'Too many attempts' });
  }

  const providedHash = computeCodeHash(normalizedCode);
  if (entry.codeHash !== providedHash) {
    entry.attemptsLeft -= 1;
    passwordResetStore.set(normalizedEmail, entry);
    return res.status(400).json({
      ok: false,
      error: 'Incorrect code',
      attemptsLeft: entry.attemptsLeft,
    });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  entry.codeHash = null;
  entry.verifiedToken = resetToken;
  passwordResetStore.set(normalizedEmail, entry);

  return res.json({ ok: true, resetToken });
});

// POST /api/password-reset/set
router.post('/set', async (req, res) => {
  const { email, password, resetToken } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password || !resetToken) {
    return res.status(400).json({ ok: false, error: 'Missing data' });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password too short' });
  }

  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/.test(password);
  if (!hasDigitOrSymbol) {
    return res.status(400).json({ ok: false, error: 'Password must contain at least one digit or special character' });
  }

  const entry = passwordResetStore.get(normalizedEmail);

  if (!entry || isExpired(entry) || entry.verifiedToken !== resetToken) {
    return res.status(403).json({ ok: false, error: 'Invalid or expired reset session' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT Id FROM Users WHERE LOWER(Email) = ? AND IsDeleted+0 = 0 LIMIT 1',
      [normalizedEmail]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found or deleted' });
    }

    const userId = rows[0].Id;
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    await pool.query('UPDATE Users SET PasswordHash = ? WHERE Id = ?', [hash, userId]);

    passwordResetStore.delete(normalizedEmail);

    return res.json({ ok: true });

  } catch (err) {
    console.error('[password-reset/set] Password update failed', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

module.exports = router;
