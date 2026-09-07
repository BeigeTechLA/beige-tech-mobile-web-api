const crypto = require('crypto');
const https = require('https');

const ENVIRONMENTS = {
  development: {
    baseUrl: 'https://qa.dev-fan-basis.com',
    apiKey: () => process.env.COMMAS_SANDBOX_API_KEY
  },
  production: {
    baseUrl: 'https://www.fanbasis.com',
    apiKey: () => process.env.COMMAS_LIVE_API_KEY
  }
};

function getEnvironmentConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const environment = ENVIRONMENTS[nodeEnv];
  if (!environment) {
    throw new Error('Commas is only configured for NODE_ENV=development or NODE_ENV=production');
  }

  const apiKey = environment.apiKey();
  if (!apiKey) {
    throw new Error(`Missing Commas ${nodeEnv === 'production' ? 'live' : 'sandbox'} API key`);
  }

  return { baseUrl: environment.baseUrl, apiKey };
}

function requestJson({ baseUrl, apiKey, path, body }) {
  const url = new URL(path, baseUrl);
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': apiKey
      }
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (_) {
          return reject(new Error(`Commas returned invalid JSON (HTTP ${response.statusCode})`));
        }

        if (response.statusCode < 200 || response.statusCode >= 300 || parsed.status === 'error') {
          return reject(new Error(parsed.message || `Commas API request failed (HTTP ${response.statusCode})`));
        }
        resolve(parsed);
      });
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.COMMAS_WEBHOOK_SECRET;
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(String(signature), 'hex');
  return signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function createHostedCheckoutSession({ amountCents, title, description, metadata, successUrl }) {
  const { baseUrl, apiKey } = getEnvironmentConfig();
  const body = {
    product: { title, description },
    amount_cents: amountCents,
    // Single-buyer sessions are required for a one-time booking payment.
    type: 'onetime_non_reusable',
    metadata
  };

  if (successUrl) body.success_url = successUrl;
  if (process.env.COMMAS_WEBHOOK_URL) body.webhook_url = process.env.COMMAS_WEBHOOK_URL;

  const response = await requestJson({
    baseUrl,
    apiKey,
    path: '/public-api/checkout-sessions',
    body
  });

  if (!response?.data?.payment_link || !response?.data?.checkout_session_id) {
    throw new Error('Commas checkout session response did not include payment_link and checkout_session_id');
  }

  return {
    provider: 'commas',
    checkoutSessionId: response.data.checkout_session_id,
    checkoutSessionPublicId: response.data.id || null,
    paymentLink: response.data.payment_link
  };
}

function parseVerifiedWebhook(rawBody) {
  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = {
  createHostedCheckoutSession,
  verifyWebhookSignature,
  parseVerifiedWebhook
};
