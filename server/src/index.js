const express = require('express');
const cors = require('cors');
require('dotenv').config();

const currenciesRouter = require('./routes/currencies');
const ratesRouter = require('./routes/rates');
const authRouter = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/currencies', currenciesRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/auth', authRouter);

// Lightweight health check for debugging CORS / network issues
app.get('/api/health', (req, res) => {
	res.json({ ok: true, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
