const jwt = require('jsonwebtoken');
const pool = require('../db/pool'); // Import pool for database check

const JWT_SECRET = process.env.JWT_SECRET;

/*
Middleware to verify JWT stored in the 'token' cookie
Checks DB to ensure user is not deleted
*/
const protect = async (req, res, next) => { // Make function async
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No authorization token provided.' });
    }

    try {
        // Verify the token signature
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check the current status in the DB
        // Use "IsDeleted+0" to ensure MySQL returns a number, not a Buffer
        const sql = 'SELECT Id, Role, IsDeleted+0 as IsDeleted FROM Users WHERE Id = ?';
        const [rows] = await pool.query(sql, [decoded.id]);

        // If user not found or deleted - deny access
        if (!rows.length || rows[0].IsDeleted == 1) {
             return res.status(401).json({ error: 'Account deactivated or user not found' });
        }

        // All good — attach user data (can take fresh from DB or from token)
        req.user = decoded; 
        
        next(); 
    } catch (err) {
        // If token is expired or invalid
        return res.status(401).json({ error: 'Access denied. Invalid token.' });
    }
};

module.exports = { protect };