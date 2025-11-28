const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'; ////

// Special email allowed to bypass password check in development (set BYPASS_EMAIL env to enable)
const BYPASS_EMAIL = process.env.BYPASS_EMAIL || 'test_email';

// Helper: sign token
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // token lifetime — 1 day
}

// POST /api/auth/login
// body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const [rows] = await pool.query('SELECT Id, Email, PasswordHash, FirstName, LastName, Role FROM Users WHERE Email = ?', [email]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    let ok = false;
    // BYPASS_EMAIL: allow login for this email (dev) without password check
    if (email && email.toLowerCase() === BYPASS_EMAIL.toLowerCase()) {
      console.warn('Auth bypass used for', email);
      ok = true;
    } else {
      const hash = user.PasswordHash || '';
      if (typeof hash === 'string' && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'))) {
        ok = await bcrypt.compare(password || '', hash);
      } else {
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

    // sign JWT and set as httpOnly cookie
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

    // return safe user object (include Role so client gets same shape as /me)
    return res.json({ Id: user.Id, Email: user.Email, FirstName: user.FirstName, LastName: user.LastName/*, Role: user.Role*/ });
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
// returns currently authenticated user based on httpOnly cookie 'token'
router.get('/me', protect, async (req, res) => {
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
    // req.user already contains decoded token data (id, email, role) thanks to the `protect` middleware
  if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
  }

    // Return user info directly from the token payload
  res.json({
      Id: req.user.id,
      Email: req.user.email,  
      Role: req.user.role, 
      FirstName: req.user.firstName, 
      LastName: req.user.lastName    
  });

} catch (err) {
  console.error('GET /api/auth/me failed', err);
  res.status(500).json({ error: 'DB error' });
}



});

module.exports = router;