const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function response() {
  return { statusCode: 200, headers: {}, status(value) { this.statusCode = value; return this; },
    set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
}

function handlers(service) {
  const source = fs.readFileSync(path.join(root, 'src/controllers/auth.controller.js'), 'utf8');
  const start = source.indexOf('const passwordResetHandler =');
  const context = { exports: {}, passwordResetService: service,
    buildAuthenticatedUserResponse: async () => ({ token: 'new-token' }), console };
  vm.runInNewContext(source.slice(start, source.indexOf('\n/**', start)), context);
  return context.exports;
}

test('expiry handlers use authenticated identity, not body-supplied user/email; cooldown includes Retry-After', async () => {
  let args;
  const handler = handlers({ request: async (...values) => {
    args = values; return { status: 429, success: false, code: 'OTP_BLOCKED', retry_after_seconds: 900 };
  } }).requestPasswordExpiryOtp;
  const res = response();
  await handler({ user: { userId: 288 }, body: { user_id: 123, email: 'other@example.com' } }, res);
  assert.equal(args[0].id, 288); assert.equal(args[0].email, undefined); assert.equal(args[1], 'expiry');
  assert.equal(res.statusCode, 429); assert.equal(res.headers['Retry-After'], '900');
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.body.status, undefined);
});

test('forgot routes validate and normalize email without requiring an authenticated session', async () => {
  let calls = 0;
  const handler = handlers({ request: async (identity, purpose) => {
    calls++; assert.equal(identity.email, 'test@example.com'); assert.equal(purpose, 'forgot');
    return { success: true };
  } }).requestForgotPasswordOtp;
  for (const email of [null, {}, '', 'not-an-email']) {
    const res = response(); await handler({ body: { email } }, res); assert.equal(res.statusCode, 400);
  }
  const res = response(); await handler({ body: { email: ' TEST@EXAMPLE.COM ' } }, res);
  assert.equal(calls, 1); assert.equal(res.statusCode, 200);
});

test('both mandatory and optional alternate middleware enforce password expiry before granting access', async () => {
  const source = fs.readFileSync(path.join(root, 'src/middleware/auth.middleware.js'), 'utf8');
  let checks = 0;
  const context = { exports: {}, process: { env: { JWT_SECRET: 'test-only' } }, console,
    require: (name) => name === 'jsonwebtoken' ? { verify: () => ({ userId: 288 }) } : {
      validatePermissionVersion: async () => ({ userType: { is_internal_member: 1 } }),
      rejectExpiredPassword: async (_req, res) => { checks++; res.status(403).json({ code: 'PASSWORD_EXPIRED' }); return true; }
    }
  };
  vm.runInNewContext(source, context);
  for (const handler of [context.exports.authenticate, context.exports.optionalAuth]) {
    const res = response(); let continued = false;
    await handler({ headers: { authorization: 'Bearer mock' } }, res, () => { continued = true; });
    assert.equal(continued, false); assert.equal(res.statusCode, 403); assert.equal(res.body.code, 'PASSWORD_EXPIRED');
  }
  assert.equal(checks, 2);
});
