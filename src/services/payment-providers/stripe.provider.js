const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createBookingCheckout({ amountCents, metadata }) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata
  });

  return {
    provider: 'stripe',
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}

module.exports = { createBookingCheckout };
