const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, require: (name) => dependencies[name] || require(name),
    console: { error: () => {}, log: () => {} }, process: { env: { NODE_ENV: 'production' } }, Date
  });
  return module.exports;
}
const secret = 'test-secret';
const generateTokens = (userId, userRole, permissionsVersion, userTypeId, sessionId) => ({
  token: jwt.sign({ userId, userRole, permissionsVersion, userTypeId, ...(sessionId ? { sessionId } : {}) }, secret, { expiresIn: '30m' })
});
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const req = (cookie, token) => ({ headers: {
  ...(cookie ? { cookie: `revure_refresh_session=${cookie}` } : {}), ...(token ? { authorization: `Bearer ${token}` } : {})
}, ip: '::1', get: () => 'Chrome/154 Linux' });
const response = () => ({ statusCode: 200, cookies: [], cleared: [],
  status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
  cookie(...args) { this.cookies.push(args); }, clearCookie(...args) { this.cleared.push(args); }
});

function harness({ internal = true, enabled = false } = {}) {
  const state = {
    sessions: [], history: [],
    user: { id: 288, user_type: 1, is_active: 1, permissions_version: 3,
      password_changed_at: new Date(Date.now() - 9 * 86400000), created_at: new Date(0),
      userType: { is_internal_member: internal ? 1 : 0, user_role: internal ? 'Admin' : 'client', user_type_id: 1 } }
  };
  const settings = { is_enabled: enabled, expiry_days: 7, enabled_at: new Date(0) };
  let failRotation = false;
  function matches(row, where) {
    return Reflect.ownKeys(where).every((key) => {
      const value = where[key];
      if (key === Op.or) return value.some((condition) => matches(row, condition));
      if (value && typeof value === 'object' && Op.gt in value) return new Date(row[key]) > value[Op.gt];
      return value === null ? row[key] == null : row[key] === value;
    });
  }
  const wrap = (row) => row && new Proxy(row, { get(target, key) {
    if (key === 'update') return async (values) => {
      if (failRotation && values.token_hash) throw new Error('database unavailable');
      Object.assign(target, values);
    };
    return target[key];
  } });
  const table = (name) => ({
    findOne: async (q) => {
      if (q.transaction) assert.equal(q.lock, 'UPDATE');
      return wrap(state[name].find((row) => matches(row, q.where)));
    },
    create: async (row) => { state[name].push({ ...row }); return wrap(state[name].at(-1)); },
    update: async (values, q) => {
      const rows = state[name].filter((row) => matches(row, q.where));
      rows.forEach((row) => Object.assign(row, values)); return [rows.length];
    }
  });
  let queue = Promise.resolve();
  const db = {
    user_sessions: table('sessions'), user_login_history: table('history'), user_type: {},
    internal_password_expiry_settings: { findOrCreate: async () => [settings] },
    users: {
      scope() { return this; },
      findOne: async (q) => matches(state.user, q.where) ? wrap(state.user) : null,
      update: async (values, q) => { if (!matches(state.user, q.where)) return [0]; Object.assign(state.user, values); return [1]; }
    },
    sequelize: { transaction: (fn) => {
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); }
        catch (error) { Object.assign(state, snapshot); throw error; }
      });
      queue = run.catch(() => {}); return run;
    } }
  };
  const expiry = load('src/services/internal-password-expiry.service.js', { '../models': db });
  const service = load('src/services/web-session.service.js', {
    '../models': db, '../config/config': { jwtSecret: secret, refreshSessionDays: 365 },
    './internal-password-expiry.service': expiry
  });
  async function seed(rawToken = 'original', id = internal ? 'session-a' : null) {
    state.sessions.push({ user_id: 288, login_session_id: id, permissions_version: 3,
      token_hash: hash(rawToken), expires_at: new Date(Date.now() + 3600000), revoked_at: null });
    if (id) state.history.push({ user_id: 288, session_id: id, session_version: 3, logged_out_at: null, expires_at: new Date(Date.now() + 3600000) });
  }
  return { state, settings, db, service, expiry, seed, failRotation: () => { failRotation = true; } };
}

test('new refresh credentials are hashed, version bound and long-lived in HttpOnly cookies', async () => {
  const h = harness();
  const created = await h.service.create(req(), h.state.user, 'session-a', {});
  assert.equal(h.state.sessions[0].permissions_version, 3);
  assert.equal(h.state.sessions[0].login_session_id, 'session-a');
  assert.equal(h.state.sessions[0].token_hash, hash(created.rawToken));
  assert.ok(created.expiresAt > new Date(Date.now() + 364 * 86400000));
  const res = response(); h.service.setCookie(res, created.rawToken);
  assert.equal(res.cookies[0][2].httpOnly, true); assert.equal(res.cookies[0][2].secure, true);
  assert.equal(res.cookies[0][2].path, '/v1/auth');
});

test('refresh rotates one stable session, preserves tracked ID, and rejects replay', async () => {
  const h = harness(); await h.seed(); const res = response();
  await h.service.refresh(req('original'), res, generateTokens);
  assert.equal(res.statusCode, 200);
  const claims = jwt.verify(res.body.token, secret);
  assert.equal(claims.sessionId, 'session-a'); assert.equal(claims.permissionsVersion, 3);
  assert.equal(claims.exp - claims.iat, 1800);
  assert.equal(h.state.sessions.length, 1); assert.equal(h.state.history.length, 1);
  assert.ok(h.state.history[0].expires_at > new Date(Date.now() + 364 * 86400000));
  assert.equal(h.state.history[0].expires_at.getTime(), h.state.sessions[0].expires_at.getTime());
  assert.notEqual(res.cookies[0][1], 'original');
  const replay = response(); await h.service.refresh(req('original'), replay, generateTokens);
  assert.equal(replay.statusCode, 401);
  const next = response(); await h.service.refresh(req(res.cookies[0][1]), next, generateTokens);
  assert.equal(next.statusCode, 200);
});

test('expired internal password survives refresh but both auth middlewares block dashboard access and allow OTP', async () => {
  const h = harness({ enabled: true }); await h.seed(); const res = response();
  await h.service.refresh(req('original'), res, generateTokens);
  assert.equal(res.statusCode, 200); assert.equal(res.body.password_expired, true);
  const auth = load('src/middleware/auth.js', { '../models': h.db, '../config/config': { jwtSecret: secret },
    jsonwebtoken: { verify: (token) => jwt.verify(token, secret) },
    '../services/internal-password-expiry.service': h.expiry,
    '../services/login-session.service': { validateSession: async () => {} } });
  const other = load('src/middleware/auth.middleware.js', { './auth': auth,
    jsonwebtoken: { verify: (token) => jwt.verify(token, secret) } });
  for (const middleware of [auth.authenticate, other.authenticate, auth.optionalAuth, other.optionalAuth, auth.authenticateAdmin]) {
    const request = { ...req(null, res.body.token), originalUrl: '/v1/admin/login-history' };
    const blocked = response(); let next = false;
    await middleware(request, blocked, () => { next = true; });
    assert.equal(blocked.statusCode, 403); assert.equal(blocked.body.code, 'PASSWORD_EXPIRED'); assert.equal(next, false);
    request.originalUrl = '/v1/auth/password-expiry/request-otp';
    await middleware(request, response(), () => { next = true; }); assert.equal(next, true);
  }
});

test('expiry disabled and external accounts retain unrestricted refreshed sessions', async () => {
  for (const options of [{ enabled: false }, { internal: false, enabled: true }]) {
    const h = harness(options); await h.seed(); const res = response();
    await h.service.refresh(req('original'), res, generateTokens);
    assert.equal(res.statusCode, 200); assert.equal(res.body.password_expired, false);
    if (options.internal === false) assert.equal(jwt.verify(res.body.token, secret).sessionId, undefined);
  }
});

test('password/permission change, inactive account, expired/revoked/unbound refresh and missing history all deny refresh', async () => {
  const changes = [
    h => h.state.user.permissions_version++, h => h.state.user.is_active = 0,
    h => h.state.sessions[0].expires_at = new Date(0), h => h.state.sessions[0].revoked_at = new Date(),
    h => h.state.sessions[0].permissions_version = null, h => h.state.history[0].logged_out_at = new Date(),
    h => h.state.history[0].expires_at = new Date(0), h => h.state.history.length = 0,
    h => h.state.sessions[0].login_session_id = null
  ];
  for (const change of changes) {
    const h = harness(); await h.seed(); change(h); const res = response();
    await h.service.refresh(req('original'), res, generateTokens);
    assert.equal(res.statusCode, 401); assert.equal(res.cookies.length, 0); assert.equal(res.cleared.length, 1);
  }
});

test('cookie-only logout revokes refresh plus tracked access and leaves another device active', async () => {
  const h = harness(); await h.seed(); await h.seed('other-device', 'session-b');
  const res = response(); await h.service.logout(req('original'), res);
  assert.equal(res.statusCode, 200); assert.ok(h.state.sessions[0].revoked_at); assert.ok(h.state.history[0].logged_out_at);
  assert.equal(h.state.sessions[1].revoked_at, null); assert.equal(h.state.history[1].logged_out_at, null);
  const refreshed = response(); await h.service.refresh(req('original'), refreshed, generateTokens); assert.equal(refreshed.statusCode, 401);
  const other = response(); await h.service.refresh(req('other-device'), other, generateTokens); assert.equal(other.statusCode, 200);
});

test('bearer-only logout accepts an expired signed token for revocation, never unverified claims', async () => {
  const h = harness(); await h.seed();
  const expired = jwt.sign({ userId: 288, sessionId: 'session-a', permissionsVersion: 3 }, secret, { expiresIn: -1 });
  const forged = jwt.sign({ userId: 288, sessionId: 'session-a', permissionsVersion: 3 }, 'wrong-key');
  await h.service.logout(req(null, forged), response()); assert.equal(h.state.sessions[0].revoked_at, null);
  await h.service.logout(req(null, expired), response()); assert.ok(h.state.sessions[0].revoked_at); assert.ok(h.state.history[0].logged_out_at);
  const retry = response(); await h.service.logout(req(null, expired), retry); assert.equal(retry.statusCode, 200);
});

test('password change invalidates refresh sessions on every device, including external accounts', async () => {
  for (const internal of [true, false]) {
    const h = harness({ internal }); await h.seed(); await h.seed('other', internal ? 'session-b' : null);
    h.state.user.permissions_version++;
    for (const raw of ['original', 'other']) {
      const res = response(); await h.service.refresh(req(raw), res, generateTokens); assert.equal(res.statusCode, 401);
    }
  }
});

test('legacy internal logout increments version once and revokes refresh credentials', async () => {
  const h = harness(); await h.seed();
  const token = jwt.sign({ userId: 288, permissionsVersion: 3 }, secret);
  await h.service.logout(req(null, token), response());
  assert.equal(h.state.user.permissions_version, 4); assert.ok(h.state.sessions[0].revoked_at);
  await h.service.logout(req(null, token), response()); assert.equal(h.state.user.permissions_version, 4);
});

test('rotation DB failure rolls back and does not clear a still-valid cookie', async () => {
  const h = harness(); await h.seed(); h.failRotation(); const res = response();
  await h.service.refresh(req('original'), res, generateTokens);
  assert.equal(res.statusCode, 500); assert.equal(res.cookies.length, 0); assert.equal(res.cleared.length, 0);
  assert.equal(h.state.sessions[0].token_hash, hash('original'));
});

test('concurrent rotations have one winner; logout prevents further refresh', async () => {
  const h = harness(); await h.seed(); const first = response(); const second = response();
  await Promise.all([h.service.refresh(req('original'), first, generateTokens), h.service.refresh(req('original'), second, generateTokens)]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 401]);
  const winner = first.statusCode === 200 ? first : second;
  await h.service.logout(req(winner.cookies[0][1], winner.body.token), response());
  const denied = response(); await h.service.refresh(req(winner.cookies[0][1]), denied, generateTokens); assert.equal(denied.statusCode, 401);
});

test('cookie-only logout racing with rotation still revokes the newly rotated session', async () => {
  for (const logoutFirst of [true, false]) {
    const h = harness(); await h.seed(); const refreshed = response(); const loggedOut = response();
    const refresh = () => h.service.refresh(req('original'), refreshed, generateTokens);
    const logout = () => h.service.logout(req('original'), loggedOut);
    await Promise.all(logoutFirst ? [logout(), refresh()] : [refresh(), logout()]);
    assert.equal(loggedOut.statusCode, 200);
    assert.ok(h.state.sessions[0].revoked_at); assert.ok(h.state.history[0].logged_out_at);
    if (refreshed.cookies.length) {
      const denied = response(); await h.service.refresh(req(refreshed.cookies[0][1]), denied, generateTokens);
      assert.equal(denied.statusCode, 401);
    }
  }
});
