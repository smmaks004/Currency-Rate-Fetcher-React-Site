const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs'); // Password hashing library
const jwt = require('jsonwebtoken'); // JWT token library
const { protect } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET // JWT secret from environment

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set.');
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    // Add "+0" to convert BIT to regular number
    const sql = `
      SELECT Id, Email, PasswordHash, FirstName, LastName, Role, IsDeleted+0 as IsDeleted 
      FROM Users WHERE Email = ?
    `;
    const [rows] = await pool.query(sql, [email]);
    
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];

    // Check if user account is deleted
    if (user.IsDeleted == 1) {
      return res.status(403).json({ error: 'Sorry, your account has been deactivated' });
    }

    const hash = user.PasswordHash || '';
    const isBcryptHash = typeof hash === 'string' && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')); // Verify hash format
    if (!isBcryptHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password with hash
    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last login
    try {
      await pool.query('UPDATE Users SET LastLogin = NOW() WHERE Id = ?', [user.Id]); // Record login time
    } catch (e) {
      console.error('Failed to update last login', e);
    }

    // Generate JWT token
    const token = signToken({ 
      id: user.Id, 
      email: user.Email , 
      role: user.Role,
      firstName: user.FirstName,
      lastName: user.LastName
    });
    
     // Cookie settings for security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1 * 24 * 60 * 60 * 1000, 
      path: '/'
    };
    res.cookie('token', token, cookieOptions);

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
// This endpoint is used continuously to recognize user identity, also checks if user account is deleted
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies && req.cookies.token;
    if (!token) {
      return res.json(null);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.json(null);
    }

    // Query the database to ensure user is not deleted
    const sql = 'SELECT Id, Email, FirstName, LastName, Role, IsDeleted+0 as IsDeleted FROM Users WHERE Id = ?';
    const [rows] = await pool.query(sql, [decoded.id]);

    // If user not found or deleted - return null
    if (!rows || rows.length === 0 || rows[0].IsDeleted == 1) {
      // Clear cookie since user is deleted
      res.clearCookie('token', { path: '/' }); 

      return res.json(null);
    }

    const user = rows[0];
    return res.json({
      Id: user.Id,
      Email: user.Email,
      FirstName: user.FirstName,
      LastName: user.LastName,
      Role: user.Role,
    });

  } catch (err) {
    console.error('GET /api/auth/me failed', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', protect, async (req, res) => {
  const { password } = req.body || {};
  const userId = req.user && req.user.id; // Get ID from token (verified in protect middleware)
  
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds); // Hash new password
    await pool.query('UPDATE Users SET PasswordHash = ? WHERE Id = ?', [hash, userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/change-password failed', err);
    res.status(500).json({ error: 'Password update failed' });
  }
});

module.exports = router;