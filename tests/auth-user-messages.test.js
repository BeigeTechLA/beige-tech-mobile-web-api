const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authenticate } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test('missing session gives a sign-in prompt without token terminology', async () => {
  const res = response();
  await authenticate({ headers: {} }, res, () => { throw new Error('unexpected access'); });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'AUTH_REQUIRED');
  assert.equal(res.body.message, 'Please sign in to continue.');
});

test('unexpected server errors do not expose implementation details', () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = response();
    errorHandler(new Error('database password leaked here'), { url: '/example', method: 'GET' }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'Something went wrong. Please try again later.');
    assert.equal(JSON.stringify(res.body).includes('database password'), false);
  } finally {
    console.error = originalError;
  }
});
