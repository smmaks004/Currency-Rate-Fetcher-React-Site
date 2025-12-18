const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const currenciesRouter = require('./routes/currencies');
const ratesRouter = require('./routes/rates');
const authRouter = require('./routes/auth');
const updateRouter = require('./routes/update');
const marginsRouter = require('./routes/margins');
const usersRouter = require('./routes/users');
const aiRouter = require('./routes/ai');
const payments = require('./routes/payments');

const passwordResetRouter = require('./routes/passwordReset'); ////

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(cookieParser());

// Stripe webhook must receive the raw request body (do this BEFORE express.json())
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), payments.handleStripeWebhook);

app.use(express.json());


app.use('/api/currencies', currenciesRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/auth', authRouter);
app.use('/api/update', updateRouter);
app.use('/api/margins', marginsRouter);
app.use('/api/users', usersRouter);
app.use('/api/ai', aiRouter);

app.use('/api/password-reset', passwordResetRouter);

app.use('/api/payments', payments.router);

// Lightweight health check for debugging CORS / network issues
app.get('/api/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
