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

// Storage: email -> { code, expiresAt, attemptsLeft, verifiedToken }
/** @type {Map<string, { code: string; expiresAt: number; attemptsLeft: number; verifiedToken?: string }>} */
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

// POST /api/password-reset/request
// Checks email. If user exists but is deleted -> Error. If active -> Sends code.
router.post('/request', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  
  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, error: 'Email required' });
  }

  try {
    // 1. Fetch user ID and IsDeleted status.
    // We use "IsDeleted+0" to ensure BIT fields are returned as integer (0 or 1).
    const [rows] = await pool.query(
      'SELECT Id, IsDeleted+0 AS IsDeletedVal FROM Users WHERE LOWER(Email) = ? LIMIT 1',
      [normalizedEmail]
    );
    
    const user = rows && rows[0];

    // 2. Logic based on user status
    if (user) {
      // If user exists but is marked as deleted
      if (user.IsDeletedVal === 1) {
        console.log(`[password-reset] Blocked request for deleted account: ${normalizedEmail}`);
        return res.status(403).json({ ok: false, error: 'Account is deleted' });
      }

      // If user exists and is active (Not deleted)
      const code = generateRandomString(RESET_CODE_LENGTH);
      const now = Date.now();

      passwordResetStore.set(normalizedEmail, {
        code,
        expiresAt: now + RESET_CODE_TTL_MS,
        attemptsLeft: RESET_CODE_ATTEMPTS,
      });

      console.log(`[password-reset] Code generated for ${normalizedEmail}: ${code}`); // DEBUG: Remove in production

      await sendPasswordResetCodeEmail({
        to: email, 
        code,
        expiresInMinutes: Math.floor(RESET_CODE_TTL_MS / 60000),
      });

    } else {
      // User does NOT exist in DB
      // Simulate delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log(`[password-reset] Request for non-existing email: ${normalizedEmail}`);
    }

    // Always return success if not explicitly blocked (deleted), 
    // to prevent user enumeration for non-existing emails.
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
// Verifies the code. If OK -> returns a temporary resetToken.
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

  if (entry.code !== normalizedCode) {
    entry.attemptsLeft -= 1;
    passwordResetStore.set(normalizedEmail, entry);
    return res.status(400).json({ 
      ok: false, 
      error: 'Incorrect code', 
      attemptsLeft: entry.attemptsLeft 
    });
  }

  // Code verified! Generate a secret token for the password set step.
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Invalidate code, store token
  entry.code = null; 
  entry.verifiedToken = resetToken;
  passwordResetStore.set(normalizedEmail, entry);

  return res.json({ ok: true, resetToken });
});

// POST /api/password-reset/set
// Sets new password. Requires valid resetToken.
router.post('/set', async (req, res) => {
  const { email, password, resetToken } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password || !resetToken) {
    return res.status(400).json({ ok: false, error: 'Missing data' });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password too short' });
  }

  // Check in-memory session
  const entry = passwordResetStore.get(normalizedEmail);
  
  if (!entry || isExpired(entry) || entry.verifiedToken !== resetToken) {
    return res.status(403).json({ ok: false, error: 'Invalid or expired reset session' });
  }

  try {
    // 1. Fetch User Id (Double check IsDeleted just in case)
    const [rows] = await pool.query(
      'SELECT Id FROM Users WHERE LOWER(Email) = ? AND IsDeleted+0 = 0 LIMIT 1',
      [normalizedEmail]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found or deleted' });
    }
    
    const userId = rows[0].Id;

    // 2. Hash and update
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    
    await pool.query('UPDATE Users SET PasswordHash = ? WHERE Id = ?', [hash, userId]);

    // 3. Clear session
    passwordResetStore.delete(normalizedEmail);

    return res.json({ ok: true });

  } catch (err) {
    console.error('[password-reset/set] Password update failed', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

module.exports = router;