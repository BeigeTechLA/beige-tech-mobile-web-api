const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const createService = require('../src/services/password-reset.service');

const oldPassword = 'Old-Test-Password-123!';
const newPassword = 'New-Test-Password-456!';
const hash = bcrypt.hashSync(oldPassword, 4);
const identity = { id: 288 };

function fixture(overrides = {}) {
  let time = Date.now();
  const sent = [];
  const history = [{ user_id: 288, session_version: 3, logged_out_at: null }];
  const sessions = [{ user_id: 288, permissions_version: 3, revoked_at: null }];
  const row = { id: 288, email: 'test@example.com', is_active: 1,
    password_hash: hash, permissions_version: 3, userType: { is_internal_member: 1 },
    password_expiry_otp_attempts: 0, ...overrides };
  row.update = async (values, options) => {
    assert.ok(options.transaction);
    Object.assign(row, values);
  };
  let tail = Promise.resolve();
  const db = {
    user_type: {},
    user_sessions: { update: async (values, options) => {
      assert.ok(options.transaction);
      for (const entry of sessions) if (entry.user_id === options.where.user_id && entry.revoked_at === null) Object.assign(entry, values);
    } },
    users: { findOne: async ({ where, transaction, lock }) => {
      assert.ok(transaction); assert.equal(lock, 'UPDATE');
      return row.is_active === where.is_active && (!where.id || where.id === row.id) &&
        (!where.email || where.email === row.email) ? row : null;
    } },
    user_login_history: { update: async (values, options) => {
      assert.ok(options.transaction);
      for (const entry of history) if (entry.user_id === options.where.user_id && entry.logged_out_at === null) Object.assign(entry, values);
    } },
    sequelize: { transaction: (callback) => {
      const run = tail.then(async () => {
        const snapshot = { ...row };
        const previousHistory = history.map((item) => ({ ...item }));
        const previousSessions = sessions.map((item) => ({ ...item }));
        try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
        catch (error) {
          Object.assign(row, snapshot);
          history.splice(0, history.length, ...previousHistory);
          sessions.splice(0, sessions.length, ...previousSessions);
          throw error;
        }
      });
      tail = run.catch(() => {});
      return run;
    } }
  };
  const service = createService({ db, now: () => time,
    passwordExpiryService: { getExpiryStatus: async (_user, internal) => ({ expired: internal && overrides.expired !== false }) },
    emailService: { sendPasswordExpiryOTP: async (_user, otp) => {
      sent.push(otp); return { success: overrides.emailFailure !== true };
    } }
  });
  const issue = async (user, transaction) => {
    assert.ok(transaction);
    history.push({ user_id: user.id, session_version: user.permissions_version, logged_out_at: null });
    sessions.push({ user_id: user.id, permissions_version: user.permissions_version, revoked_at: null });
    return { token: 'new-device-token', user: { id: user.id, permissions_version: user.permissions_version }, permissions: {} };
  };
  const advance = (milliseconds) => { time += milliseconds; };
  const verified = async (purpose = 'expiry') => {
    assert.equal((await service.request(identity, purpose)).success, true);
    const result = await service.verify(identity, purpose, sent.at(-1));
    assert.equal(result.success, true);
    return { currentPassword: oldPassword, newPassword, confirmPassword: newPassword, resetProof: result.resetProof };
  };
  return { service, row, sent, history, sessions, issue, advance, verified };
}

test('request sends six-digit branded email code and enforces exact resend cooldown', async () => {
  const f = fixture();
  const response = await f.service.request(identity, 'expiry');
  assert.equal(response.retry_after_seconds, 60);
  assert.match(f.sent[0], /^\d{6}$/);
  assert.notEqual(f.row.password_expiry_otp_hash, f.sent[0]);
  assert.equal(await bcrypt.compare(f.sent[0], f.row.password_expiry_otp_hash), true);
  assert.equal((await f.service.request(identity, 'expiry')).status, 429);
  f.advance(31000);
  assert.equal((await f.service.request(identity, 'expiry')).retry_after_seconds, 29);
  f.advance(29000);
  assert.equal((await f.service.request(identity, 'expiry')).success, true);
  assert.equal(f.sent.length, 2);
});

test('non-expired/non-internal/inactive accounts cannot request expiry reset; unknown recovery email is generic', async () => {
  for (const overrides of [{ expired: false }, { userType: { is_internal_member: 0 } }, { is_active: 0 }]) {
    const f = fixture(overrides);
    assert.equal((await f.service.request(identity, 'expiry')).status, 403);
    assert.equal(f.sent.length, 0);
  }
  const f = fixture();
  const missing = await f.service.request({ email: 'unknown@example.com' }, 'forgot');
  assert.equal(missing.success, true); assert.match(missing.message, /If an active account/);
  assert.equal(f.sent.length, 0);
});

test('email delivery failure does not replace an OTP or start a cooldown', async () => {
  const f = fixture({ emailFailure: true });
  assert.equal((await f.service.request(identity, 'expiry')).status, 503);
  assert.equal(f.row.password_reset_sent_at, undefined);
});

test('wrong codes allow retry; fifth failure blocks verify and resend for 15 minutes, across both purposes', async () => {
  const f = fixture();
  await f.service.request(identity, 'expiry');
  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = await f.service.verify(identity, 'expiry', '000000');
    assert.equal(result.status, 400); assert.equal(result.attempts_remaining, 5 - attempt);
  }
  f.advance(60000);
  await f.service.request(identity, 'expiry');
  assert.equal(f.row.password_expiry_otp_attempts, 4);
  const locked = await f.service.verify(identity, 'expiry', '000000');
  assert.equal(locked.status, 429); assert.equal(locked.retry_after_seconds, 900);
  assert.equal((await f.service.request(identity, 'forgot')).code, 'OTP_BLOCKED');
  assert.equal((await f.service.verify(identity, 'expiry', f.sent.at(-1))).code, 'OTP_BLOCKED');
  f.advance(900000);
  assert.equal((await f.service.request(identity, 'expiry')).success, true);
  assert.equal(f.row.password_expiry_otp_attempts, 0);
  assert.equal((await f.service.verify(identity, 'expiry', f.sent.at(-1))).success, true);
});

test('concurrent verification failures cannot lose increments', async () => {
  const f = fixture();
  await f.service.request(identity, 'expiry');
  const results = await Promise.all(Array.from({ length: 6 }, () => f.service.verify(identity, 'expiry', '000000')));
  assert.equal(f.row.password_expiry_otp_attempts, 5);
  assert.equal(results.filter((r) => r.status === 429).length, 2);
});

test('expired OTP can be resent and wrong-purpose OTP cannot authorize another flow', async () => {
  const f = fixture();
  await f.service.request(identity, 'expiry');
  assert.equal((await f.service.verify(identity, 'forgot', f.sent[0])).code, 'OTP_EXPIRED');
  f.advance(600000);
  assert.equal((await f.service.verify(identity, 'expiry', f.sent[0])).code, 'OTP_EXPIRED');
  assert.equal((await f.service.request(identity, 'expiry')).success, true);
  assert.equal((await f.service.verify(identity, 'expiry', f.sent.at(-1))).success, true);
});

test('verification yields hashed proof, consumes OTP, and never authorizes resets without the returned proof', async () => {
  const f = fixture();
  const body = await f.verified();
  assert.match(body.resetProof, /^[a-f0-9]{64}$/);
  assert.equal(f.row.password_reset_proof_hash, crypto.createHash('sha256').update(body.resetProof).digest('hex'));
  assert.equal((await f.service.verify(identity, 'expiry', f.sent[0])).success, false);
  for (const resetProof of [undefined, '', 'a'.repeat(64)]) {
    assert.equal((await f.service.complete(identity, 'expiry', { ...body, resetProof }, f.issue)).status, 403);
  }
  assert.equal(f.row.password_hash, hash);
});

test('current password is required and must match; new passwords must match, meet length, and differ from stored hash', async () => {
  const f = fixture();
  const body = await f.verified();
  for (const values of [
    { currentPassword: undefined }, { currentPassword: 42 }, { currentPassword: 'incorrect' },
    { newPassword: [] }, { confirmPassword: 'mismatch' },
    { newPassword: 'short', confirmPassword: 'short' },
    { newPassword: oldPassword, confirmPassword: oldPassword },
    { newPassword: 'x'.repeat(73), confirmPassword: 'x'.repeat(73) }
  ]) {
    const result = await f.service.complete(identity, 'expiry', { ...body, ...values }, f.issue);
    assert.equal(result.status, 400, JSON.stringify(values));
    assert.equal(f.row.password_hash, hash);
  }
});

test('forgot-password uses same OTP proof but does not require old password and still rejects reuse', async () => {
  const f = fixture();
  const body = await f.verified('forgot');
  delete body.currentPassword;
  assert.equal((await f.service.complete(identity, 'expiry', body, f.issue)).status, 403);
  assert.equal((await f.service.complete(identity, 'forgot', { ...body, newPassword: oldPassword, confirmPassword: oldPassword }, f.issue)).status, 400);
  const result = await f.service.complete(identity, 'forgot', body, f.issue);
  assert.equal(result.success, true); assert.equal(result.token, 'new-device-token');
});

test('expired proof and proof invalidated by another credential change are rejected', async () => {
  for (const invalidate of [(f) => f.advance(600000), (f) => { f.row.permissions_version++; }]) {
    const f = fixture(); const body = await f.verified(); invalidate(f);
    assert.equal((await f.service.complete(identity, 'expiry', body, f.issue)).status, 403);
    assert.equal(f.row.password_hash, hash);
  }
});

test('resend invalidates previous proof', async () => {
  const f = fixture(); const body = await f.verified();
  f.advance(60000); await f.service.request(identity, 'expiry');
  assert.equal((await f.service.complete(identity, 'expiry', body, f.issue)).status, 403);
});

test('successful change increments version, ends old sessions, creates current-device login and consumes proof exactly once', async () => {
  const f = fixture(); const body = await f.verified();
  const results = await Promise.all([
    f.service.complete(identity, 'expiry', body, f.issue),
    f.service.complete(identity, 'expiry', body, f.issue)
  ]);
  assert.equal(results[0].success, true); assert.equal(results[0].message, 'Password updated successfully.');
  assert.equal(results[1].status, 403);
  assert.equal(await bcrypt.compare(newPassword, f.row.password_hash), true);
  assert.equal(f.row.permissions_version, 4);
  assert.ok(f.row.password_changed_at);
  assert.equal(f.row.password_reset_proof_hash, null);
  assert.equal(f.row.password_expiry_otp_attempts, 0);
  assert.ok(f.history[0].logged_out_at);
  assert.equal(f.history[1].logged_out_at, null);
  assert.equal(f.history[1].session_version, 4);
  assert.ok(f.sessions[0].revoked_at);
  assert.equal(f.sessions[1].revoked_at, null);
  assert.equal(f.sessions[1].permissions_version, 4);
});

test('session issuance failure rolls back password, proof consumption and revocation', async () => {
  const f = fixture(); const body = await f.verified();
  await assert.rejects(f.service.complete(identity, 'expiry', body, async () => { throw new Error('session write failed'); }), /session write failed/);
  assert.equal(f.row.password_hash, hash); assert.equal(f.row.permissions_version, 3);
  assert.ok(f.row.password_reset_proof_hash); assert.equal(f.history[0].logged_out_at, null);
  assert.equal(f.sessions[0].revoked_at, null);
  assert.equal((await f.service.complete(identity, 'expiry', body, f.issue)).success, true);
});
