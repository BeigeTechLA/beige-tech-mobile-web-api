const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bcrypt = require('bcrypt');

const source = fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8');
const start = source.indexOf('exports.changeExpiredPassword =');
const handler = source.slice(start, source.indexOf('\n/**', start));
const oldPassword = 'Old-Test-Password-123!';
const newPassword = 'New-Test-Password-456!';
const hash = bcrypt.hashSync(oldPassword, 4);

async function run(body, overrides = {}) {
  const changes = [];
  const user = {
    password_hash: hash, permissions_version: 3,
    password_expiry_otp_verified_at: new Date(),
    ...overrides,
    update: async (values) => { changes.push(values); }
  };
  const context = { exports: {}, bcrypt, Date, getPasswordExpiryUser: async () => user, console };
  vm.runInNewContext(handler, context);
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await context.exports.changeExpiredPassword({ body }, res);
  return { res, changes };
}
const validBody = { currentPassword: oldPassword, newPassword, confirmPassword: newPassword };

test('requires a current password and rejects non-string password fields without writes', async () => {
  for (const body of [
    { newPassword, confirmPassword: newPassword }, { ...validBody, currentPassword: '' },
    { ...validBody, currentPassword: 123 }, { ...validBody, newPassword: [] },
    { ...validBody, confirmPassword: null }, { ...validBody, newPassword: 'short', confirmPassword: 'short' }
  ]) {
    const { res, changes } = await run(body);
    assert.equal(res.statusCode, 400); assert.equal(changes.length, 0);
  }
});

test('incorrect current password is rejected even with matching new passwords and verified OTP', async () => {
  const { res, changes } = await run({ ...validBody, currentPassword: 'Wrong-Password' });
  assert.equal(res.statusCode, 400); assert.match(res.body.message, /current password is incorrect/);
  assert.equal(changes.length, 0);
});

test('same current password cannot be reused', async () => {
  const { res, changes } = await run({ currentPassword: oldPassword, newPassword: oldPassword, confirmPassword: oldPassword });
  assert.equal(res.statusCode, 400); assert.match(res.body.message, /must be different/); assert.equal(changes.length, 0);
});

test('bcrypt-equivalent passwords cannot bypass reuse validation', async () => {
  const prefix = 'x'.repeat(72);
  const sameHash = bcrypt.hashSync(prefix, 4);
  const { res, changes } = await run({ currentPassword: prefix, newPassword: `${prefix}a`, confirmPassword: `${prefix}a` }, { password_hash: sameHash });
  assert.equal(res.statusCode, 400); assert.match(res.body.message, /must be different/); assert.equal(changes.length, 0);
});

test('mismatched confirmation and accounts without an existing password cannot change password', async () => {
  const mismatch = await run({ ...validBody, confirmPassword: 'Other-Password' });
  assert.equal(mismatch.res.statusCode, 400); assert.equal(mismatch.changes.length, 0);
  const noPassword = await run(validBody, { password_hash: null });
  assert.equal(noPassword.res.statusCode, 400); assert.equal(noPassword.changes.length, 0);
});

test('email OTP verification remains required and times out after ten minutes', async () => {
  for (const verified of [null, new Date(Date.now() - 11 * 60000)]) {
    const { res, changes } = await run(validBody, { password_expiry_otp_verified_at: verified });
    assert.equal(res.statusCode, 403); assert.equal(changes.length, 0);
  }
});

test('valid change hashes the new password, resets expiry/OTP, and invalidates old token versions', async () => {
  const before = Date.now();
  const { res, changes } = await run(validBody);
  assert.equal(res.statusCode, 200); assert.equal(res.body.force_logout, true); assert.equal(changes.length, 1);
  const changed = changes[0];
  assert.equal(await bcrypt.compare(newPassword, changed.password_hash), true);
  assert.equal(await bcrypt.compare(oldPassword, changed.password_hash), false);
  assert.equal(changed.permissions_version, 4);
  assert.ok(changed.password_changed_at.getTime() >= before);
  assert.equal(changed.password_expiry_otp_verified_at, null); assert.equal(changed.password_expiry_otp_hash, null);
  assert.equal(changed.password_expiry_otp_expires_at, null); assert.equal(changed.password_expiry_otp_attempts, 0);
});
