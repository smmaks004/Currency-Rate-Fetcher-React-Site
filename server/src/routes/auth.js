const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET

// Fail fast if secret is missing to avoid signing with "undefined"
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Define it in environment/config before starting the server.');
}

// Sign token
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // token lifetime — 1 day
}

// POST /api/auth/login
// This endpoint is used only once, when the user try to enter in system
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    const [rows] = await pool.query('SELECT Id, Email, PasswordHash, FirstName, LastName, Role FROM Users WHERE Email = ?', [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // Enforce bcrypt: reject non-bcrypt hashes to avoid plaintext acceptance
    const hash = user.PasswordHash || '';
    const isBcryptHash = typeof hash === 'string' && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'));
    if (!isBcryptHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last login
    try {
      await pool.query('UPDATE Users SET LastLogin = NOW() WHERE Id = ?', [user.Id]);
    } catch (e) {
      console.error('Failed to update last login', e);
    }

    // Sign JWT and set as httpOnly cookie
    const token = signToken({ 
      id: user.Id, 
      email: user.Email , 
      /**/role: user.Role,
      firstName: user.FirstName,
      lastName: user.LastName
    });
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day
      path: '/'
    };
    res.cookie('token', token, cookieOptions);

    // Return safe user object
    return res.json({ Id: user.Id, Email: user.Email, FirstName: user.FirstName, LastName: user.LastName, Role: user.Role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});


// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});


// GET /api/auth/me
// This endpoint is used continuously to recognize user identity.
router.get('/me', async (req, res) => {
  /* OLD  */
  // try {
  //   const userId = req.user && req.user.id;
  //   if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  //   const [rows] = await pool.query('SELECT Id, Email, FirstName, LastName FROM Users WHERE Id = ?', [userId]);
  //   if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });

  //   const u = rows[0];
  //   res.json({ Id: u.Id, Email: u.Email, FirstName: u.FirstName, LastName: u.LastName });
  // } catch (err) {
  //   console.error('GET /api/auth/me failed', err);
  //   res.status(500).json({ error: 'DB error' });
  // }

/* New version DOWN */
  try {
    const token = req.cookies && req.cookies.token;
    if (!token) {
      // No token: return 200 with null (client will treat as unauthenticated)
      return res.json(null);
    }

    try {
      const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);

      // Return user info directly from the token payload
      return res.json({
        Id: decoded.id,
        Email: decoded.email,
        FirstName: decoded.firstName,
        LastName: decoded.lastName,
        Role: decoded.role,
      });
    } catch (err) {
      // Invalid/expired token: treat as unauthenticated (do not return 401)
      return res.json(null);
    }

  } catch (err) {
    console.error('GET /api/auth/me failed', err);
    res.status(500).json({ error: 'Server error' });
  }


});





// POST /api/auth/change-password
// Protected: change current user's password (hashes using bcrypt)
router.post('/change-password', protect, async (req, res) => {
  const { password } = req.body || {};
  const userId = req.user && req.user.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    await pool.query('UPDATE Users SET PasswordHash = ? WHERE Id = ?', [hash, userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/change-password failed', err);
    res.status(500).json({ error: 'Password update failed' });
  }
});

module.exports = router;