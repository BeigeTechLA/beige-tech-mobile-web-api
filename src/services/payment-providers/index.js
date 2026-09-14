const stripeProvider = require('./stripe.provider');
const commasProvider = require('./commas.provider');

function getPaymentProvider() {
  const provider = String(process.env.PAYMENT_PROVIDER || 'stripe').trim().toLowerCase();
  if (provider === 'stripe') return { name: provider, ...stripeProvider };
  if (provider === 'commas') return { name: provider, ...commasProvider };
  throw new Error('PAYMENT_PROVIDER must be either "stripe" or "commas"');
}

module.exports = { getPaymentProvider, commasProvider };
