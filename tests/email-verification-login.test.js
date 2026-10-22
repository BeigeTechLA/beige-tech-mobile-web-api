const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const emailServicePath = require.resolve('../src/utils/emailService');
const emailService = { sendVerificationOTP: async () => ({ success: true }) };
require.cache[emailServicePath] = { id: emailServicePath, filename: emailServicePath,
  loaded: true, exports: emailService };
const db = require('../src/models');
const auth = require('../src/controllers/auth.controller');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('password login requires email verification after validating the password', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = { id: 901, email: 'new@example.com', password_hash: passwordHash,
    is_active: 1, email_verified: 0, verification_code: '123456',
    otp_expiry: new Date(Date.now() + 10 * 60 * 1000), userType: { user_role: 'client' } };
  mock.method(db.users, 'findOne', async () => user);
  mock.method(db.clients, 'findOne', async () => null);
  mock.method(db.crew_members, 'findOne', async () => null);
  try {
    const wrongPassword = response();
    await auth.login({ body: { email: user.email, password: 'wrong-password' } }, wrongPassword);
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(wrongPassword.body.code, undefined);

    const unverified = response();
    await auth.login({ body: { email: user.email, password: 'correct-password' } }, unverified);
    assert.equal(unverified.statusCode, 403);
    assert.equal(unverified.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(unverified.body.otp_sent, false);
    assert.equal(unverified.body.token, undefined);
  } finally {
    mock.restoreAll();
  }
});

test('expired signup code is replaced and emailed on a valid password login', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = { id: 902, name: 'New User', email: 'expired@example.com',
    password_hash: passwordHash, is_active: 1, email_verified: 0,
    verification_code: '123456', otp_expiry: new Date(Date.now() - 1000) };
  const updates = [];
  const emails = [];
  mock.method(db.users, 'findOne', async () => user);
  mock.method(db.users, 'update', async (...args) => { updates.push(args); return [1]; });
  mock.method(db.clients, 'findOne', async () => null);
  mock.method(db.crew_members, 'findOne', async () => null);
  mock.method(emailService, 'sendVerificationOTP', async (...args) => {
    emails.push(args); return { success: true };
  });
  try {
    const res = response();
    await auth.login({ body: { email: user.email, password: 'correct-password' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(res.body.otp_sent, true);
    assert.equal(res.body.retry_after_seconds, 60);
    assert.equal(res.body.token, undefined);
    assert.equal(updates.length, 1);
    assert.equal(emails.length, 1);
    assert.equal(emails[0][0].email, user.email);
    assert.equal(emails[0][1], updates[0][0].verification_code);
  } finally {
    mock.restoreAll();
  }
});

test('failed email delivery leaves the account able to request another code', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = { id: 903, name: 'New User', email: 'retry@example.com',
    password_hash: passwordHash, is_active: 1, email_verified: 0,
    verification_code: null, otp_expiry: new Date(Date.now() - 1000) };
  const updates = [];
  mock.method(db.users, 'findOne', async () => user);
  mock.method(db.users, 'update', async (...args) => { updates.push(args); return [1]; });
  mock.method(db.clients, 'findOne', async () => null);
  mock.method(db.crew_members, 'findOne', async () => null);
  mock.method(emailService, 'sendVerificationOTP', async () => ({ success: false, error: 'delivery failed' }));
  try {
    const res = response();
    await auth.login({ body: { email: user.email, password: 'correct-password' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(res.body.otp_sent, false);
    assert.equal(res.body.retry_after_seconds, 0);
    assert.equal(updates.length, 2);
    assert.equal(updates[1][0].verification_code, null);
  } finally {
    mock.restoreAll();
  }
});

test('booking quick register does not sign in an existing account', async () => {
  mock.method(db.users, 'scope', () => ({ findAll: async () => [{ email: 'new@example.com' }] }));
  try {
    const res = response();
    await auth.quickRegister({ body: { name: 'New User', email: 'new@example.com', password: 'secret123' } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'EMAIL_EXISTS');
    assert.equal(res.body.token, undefined);
  } finally {
    mock.restoreAll();
  }
});

test('client signup reports the exact email and phone conflicts', async () => {
  let records = [];
  mock.method(db.users, 'scope', () => ({ findAll: async () => records }));
  try {
    const cases = [
      { records: [{ phone_number: '+15550001111' }], email: 'new@example.com',
        code: 'PHONE_EXISTS', message: 'Phone number already exists.' },
      { records: [{ email: 'new@example.com' }], email: 'new@example.com',
        code: 'EMAIL_EXISTS', message: 'Email already exists.' },
      { records: [{ email: 'new@example.com', phone_number: '+15550001111' }], email: 'new@example.com',
        code: 'EMAIL_AND_PHONE_EXISTS', message: 'Email and phone number already exist.' }
    ];
    for (const scenario of cases) {
      records = scenario.records;
      const res = response();
      await auth.register({ body: { name: 'New User', email: scenario.email,
        phone_number: '+15550001111', password: 'secret123', userType: 3 } }, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, scenario.code);
      assert.equal(res.body.message, scenario.message);
    }
  } finally {
    mock.restoreAll();
  }
});

test('a concurrent signup collision still returns a field-specific conflict', async () => {
  let lookups = 0;
  mock.method(db.users, 'scope', () => ({ findAll: async () => {
    lookups++;
    return lookups === 1 ? [] : [{ phone_number: '+15550001111' }];
  } }));
  mock.method(db.users, 'create', async () => {
    const error = new Error('duplicate');
    error.name = 'SequelizeUniqueConstraintError';
    throw error;
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = response();
    await auth.register({ body: { name: 'New User', email: 'new@example.com',
      phone_number: '+15550001111', password: 'secret123', userType: 3 } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'PHONE_EXISTS');
  } finally {
    console.error = originalError;
    mock.restoreAll();
  }
});

test('phone OTP login cannot bypass pending email verification', async () => {
  mock.method(db.users, 'findOne', async () => ({
    id: 901, email: 'new@example.com', email_verified: 0
  }));
  try {
    const res = response();
    await auth.login({ body: { mobile: '+15551234567' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(res.body.otp, undefined);
  } finally {
    mock.restoreAll();
  }
});
