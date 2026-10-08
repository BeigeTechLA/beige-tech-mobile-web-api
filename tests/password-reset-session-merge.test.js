const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8');
const start = source.indexOf('async function issueLoginSession(');
const helper = source.slice(start, source.indexOf('\n/**', start));

function harness({ failAudit = false } = {}) {
  const writes = []; const cookies = []; const commits = [];
  const expiresAt = new Date(Date.now() + 365 * 86400000);
  const transaction = { afterCommit: (callback) => commits.push(callback) };
  let ownedTransactions = 0;
  const context = {
    randomUUID: () => 'fresh-session-id',
    generateTokens: (_id, _role, version, _type, sessionId) => {
      assert.equal(version, 4); assert.equal(sessionId, 'fresh-session-id');
      return { token: 'fresh-access-token' };
    },
    db: { sequelize: { transaction: async (callback) => {
      ownedTransactions++;
      const result = await callback(transaction);
      commits.forEach((commit) => commit());
      return result;
    } } },
    webSessionService: {
      create: async (_req, user, sessionId, tx) => {
        assert.equal(tx, transaction); assert.equal(user.permissions_version, 4);
        writes.push({ type: 'refresh', sessionId, tx });
        return { rawToken: 'fresh-refresh-token', expiresAt };
      },
      setCookie: (res, token) => cookies.push({ res, token })
    },
    recordSuccessfulLogin: async (_req, _user, method, token, expiry, tx) => {
      assert.equal(token, 'fresh-access-token'); assert.equal(expiry, expiresAt); assert.equal(tx, transaction);
      if (failAudit) throw new Error('audit failure');
      writes.push({ type: 'audit', method, tx });
    }
  };
  vm.runInNewContext(helper, context);
  const user = { id: 288, permissions_version: 4, user_type: 1,
    userType: { is_internal_member: 1, user_type_id: 1, user_role: 'Admin' } };
  return { issue: context.issueLoginSession, transaction, writes, cookies, commits, user,
    ownedTransactions: () => ownedTransactions };
}

test('reset reuses its transaction and publishes a refresh cookie only after commit', async () => {
  const h = harness(); const res = {};
  const tokens = await h.issue({}, res, h.user, 'password_reset', h.transaction);
  assert.equal(tokens.token, 'fresh-access-token'); assert.equal(h.ownedTransactions(), 0);
  assert.equal(h.writes.length, 2); assert.equal(h.writes[1].method, 'password_reset');
  assert.equal(h.cookies.length, 0);
  h.commits.forEach((callback) => callback());
  assert.equal(h.cookies.length, 1); assert.equal(h.cookies[0].res, res);
  assert.equal(h.cookies[0].token, 'fresh-refresh-token');
});

test('a rolled-back reset never publishes the pending refresh cookie', async () => {
  const h = harness();
  await h.issue({}, {}, h.user, 'password_reset', h.transaction);
  // On rollback, Sequelize discards afterCommit callbacks.
  h.commits.length = 0;
  assert.equal(h.cookies.length, 0);
});

test('failed login history write cannot publish a refresh cookie', async () => {
  const h = harness({ failAudit: true });
  await assert.rejects(h.issue({}, {}, h.user, 'password_reset', h.transaction), /audit failure/);
  assert.equal(h.cookies.length, 0); assert.equal(h.commits.length, 0);
});

test('normal login still creates its own transaction and refresh cookie', async () => {
  const h = harness();
  await h.issue({}, {}, h.user, 'password');
  assert.equal(h.ownedTransactions(), 1); assert.equal(h.cookies.length, 1);
  assert.equal(h.writes[1].method, 'password');
});
