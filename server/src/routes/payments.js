const express = require('express');
const Stripe = require('stripe');

const router = express.Router();

// Load Stripe secret key from environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) { throw new Error('STRIPE_SECRET_KEY is not set.'); }

// Initialize Stripe client with the secret key
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Set of currencies that do not use decimal places
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

// Normalize a currency code to lowercase
function normalizeCurrency(code) {
  const c = String(code).toLowerCase();
  if (!/^[a-z]{3}$/.test(c)) return null;
  return c;
}

// Safely convert a value to a number
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Convert an amount to Stripe's minor units based on the currency
function toStripeMinorUnits(amount, currency) {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor);
}

// POST /api/payments/create-checkout-session
// Creates a Stripe Checkout Session for the current conversion
router.post('/create-checkout-session', async (req, res) => {
  try {
    const {
      fromCode, // Source currency code
      toCode, // Target currency code
      amountFrom, // Amount in source currency
      amountTo, // Amount in target currency
      rate, // Exchange rate used
      usedDate // Date of the exchange rate
    } = req.body || {};

    // Normalize and validate currency codes
    const from = normalizeCurrency(fromCode);
    const to = normalizeCurrency(toCode);

    // Parse and validate amounts and rate
    const amtFrom = safeNumber(amountFrom);
    const amtTo = safeNumber(amountTo);
    const usedRate = safeNumber(rate);

    if (!from || !to) {
      return res.status(400).json({ error: 'Invalid currency codes' });
    }
    if (amtFrom == null || amtFrom <= 0) {
      return res.status(400).json({ error: 'Invalid amountFrom' });
    }

    // Minimum amount check
    if (amtFrom < 10) { return res.status(400).json({ error: `Minimum amount is 10` }); }

    if (amtTo == null || amtTo <= 0) {
      return res.status(400).json({ error: 'Invalid amountTo' });
    }
    if (usedRate == null || usedRate <= 0) {
      return res.status(400).json({ error: 'Invalid rate' });
    }

    // Maximum amount check
    if (amtFrom > 1_000_000) { return res.status(400).json({ error: 'Amount too large' }); }

    // Convert amountFrom to Stripe minor units
    const unitAmount = toStripeMinorUnits(amtFrom, from);
    if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: 'Invalid unit amount after conversion' });
    }

    // Define frontend URLs for success and cancel actions
    const frontendUrl = process.env.FRONTEND_ORIGIN;
    const successUrl = `${frontendUrl}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/?stripe=cancel`;

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: from, // Source currency
            unit_amount: unitAmount, // Amount in minor units
            product_data: {
              name: `Currency exchange ${from.toUpperCase()} → ${to.toUpperCase()}`, // Description of the exchange
              description: `Pay ${amtFrom} ${from.toUpperCase()} to receive ${amtTo} ${to.toUpperCase()}`
            }
          }
        }
      ],
      metadata: {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        amountFrom: String(amtFrom),
        amountTo: String(amtTo),
        rate: String(usedRate),
        usedDate: usedDate ? String(usedDate) : ''
      }
    });

    // Respond with the session URL and ID
    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('create-checkout-session failed', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook handler (must receive raw body)
async function handleStripeWebhook(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).send('STRIPE_WEBHOOK_SECRET not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err && err.message ? err.message : err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Minimal handling
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data && event.data.object;
      console.log('Stripe checkout.session.completed', {
        id: session && session.id,
        payment_status: session && session.payment_status,
        metadata: session && session.metadata
      });
    }
  } catch (e) {
    console.error('Stripe webhook handler failed', e); // Still acknowledge to avoid retries storm for non-critical logging
  }

  res.json({ received: true });
}

module.exports = { router, handleStripeWebhook };
