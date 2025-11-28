const jwt = require('jsonwebtoken');

// IMPORTANT: Secret key as in auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'; ////

/*
Middleware to verify JWT stored in the 'token' cookie.
If valid, attaches decoded token payload to `req.user`.
*/
const protect = (req, res, next) => {
    // 1. JWT is expected in the cookie named 'token'
    const token = req.cookies.token;

    if (!token) {
        // If no token is present, return 401 Unauthorized
        return res.status(401).json({ error: 'Access denied. No authorization token provided.' });
    }

    try {
        // 2. Verify the token using the secret key
        const decoded = jwt.verify(token, JWT_SECRET);

        // 3. Token is valid — attach decoded user data to the request.
        req.user = decoded; // In protected routes we canhave access to 'req.user.id', 'req.user.email', etc.
        
        // 4. Allow the request to continue to the next handler
        next(); 
    } catch (err) {
        // console.error('JWT Verification Error:', err.message);
        
        // If token verification failed (expired, tampered), return 401
        return res.status(401).json({ error: 'Access denied. Invalid token.' });
    }
};

module.exports = { protect };