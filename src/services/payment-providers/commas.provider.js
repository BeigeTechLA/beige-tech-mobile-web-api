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

function requestJson({ baseUrl, apiKey, path, method = 'POST', body = null }) {
  const url = new URL(path, baseUrl);
  const payload = body === null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
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
    if (payload) request.write(payload);
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

async function createHostedCheckoutSession({ amountCents, title, description, metadata, successUrl, type = 'onetime_non_reusable' }) {
  const { baseUrl, apiKey } = getEnvironmentConfig();
  const body = {
    product: { title, description },
    amount_cents: amountCents,
    type,
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

async function getCheckoutSession({ baseUrl, apiKey, checkoutSessionId }) {
  return requestJson({
    baseUrl,
    apiKey,
    method: 'GET',
    path: `/public-api/checkout-sessions/${encodeURIComponent(checkoutSessionId)}`
  });
}

async function getPublicProductId({ baseUrl, apiKey, title, amountCents }) {
  // The Embedded SDK uses the public product hashid shown by
  // GET /public-api/products (for example, "Pj4JA"), not the internal numeric
  // product id returned in checkout-session details.
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage) {
    const productsResponse = await requestJson({
      baseUrl,
      apiKey,
      method: 'GET',
      path: `/public-api/products?page=${page}&per_page=100`
    });
    const productPage = productsResponse?.data;
    const products = productPage?.data;
    if (!Array.isArray(products)) {
      throw new Error('Commas products response did not include a product list');
    }

    const product = products.find((item) =>
      item?.title === title && Math.round(Number(item.price) * 100) === amountCents
    );
    if (product?.id) return String(product.id);

    lastPage = Number(productPage?.last_page) || page;
    page += 1;
  }

  throw new Error('Could not resolve the public Commas product ID for Embedded Checkout');
}

/**
 * Embedded Checkout needs a Commas product id plus a server-created session
 * secret. A checkout session creates the priced product from our authoritative
 * booking amount; its product id is then used only by the Commas iframe SDK.
 */
async function createEmbeddedCheckoutSession({ amountCents, title, description, metadata, successUrl }) {
  if (!process.env.COMMAS_CREATOR_ID) {
    throw new Error('Missing COMMAS_CREATOR_ID required by the Commas Embedded Checkout SDK');
  }
  const { baseUrl, apiKey } = getEnvironmentConfig();
  const checkoutSession = await createHostedCheckoutSession({
    amountCents,
    title,
    description,
    metadata,
    // This setup session supplies the dynamically priced Commas product only;
    // do not configure a hosted redirect for the embedded UI.
    successUrl: null,
    type: 'onetime_reusable'
  });
  const details = await getCheckoutSession({
    baseUrl,
    apiKey,
    checkoutSessionId: checkoutSession.checkoutSessionId
  });
  const numericProductId = details?.data?.product?.id;
  if (!numericProductId) {
    throw new Error('Commas checkout session response did not include product.id for Embedded Checkout');
  }
  const productId = await getPublicProductId({ baseUrl, apiKey, title, amountCents });

  const embeddedResponse = await requestJson({
    baseUrl,
    apiKey,
    path: '/public-api/checkout-sessions/embedded',
    body: {
      creator_id: process.env.COMMAS_CREATOR_ID || undefined,
      product_id: productId,
      metadata
    }
  });
  const checkoutSessionSecret = embeddedResponse?.data?.checkout_session_secret;
  if (!checkoutSessionSecret) {
    throw new Error('Commas Embedded Checkout response did not include checkout_session_secret');
  }
  return {
    provider: 'commas',
    checkoutMode: 'embedded',
    checkoutSessionId: checkoutSession.checkoutSessionId,
    productId,
    creatorId: process.env.COMMAS_CREATOR_ID,
    checkoutSessionSecret,
    environment: (process.env.NODE_ENV || 'development') === 'production' ? 'production' : 'sandbox'
  };
}

async function createBookingCheckout(input) {
  const mode = String(process.env.COMMAS_CHECKOUT_MODE || 'hosted').trim().toLowerCase();
  if (mode === 'hosted') {
    return { ...(await createHostedCheckoutSession(input)), checkoutMode: 'hosted' };
  }
  if (mode === 'embedded') return createEmbeddedCheckoutSession(input);
  throw new Error('COMMAS_CHECKOUT_MODE must be either "hosted" or "embedded"');
}

function parseVerifiedWebhook(rawBody) {
  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = {
  createHostedCheckoutSession,
  createEmbeddedCheckoutSession,
  createBookingCheckout,
  verifyWebhookSignature,
  parseVerifiedWebhook
};
