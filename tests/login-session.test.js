const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Sequelize, DataTypes, Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { ipType, deviceDetails, sessionDetails } = require('../src/utils/login-session-details');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, require: (name) => dependencies[name] || require(name), console, process, Date
  }, { filename: file });
  return module.exports;
}
const future = new Date(Date.now() + 600000);
const account = { id: 288, is_active: 1, permissions_version: 3, userType: { is_internal_member: 1 } };
const row = { session_id: 'session-a', session_version: 3, expires_at: future, logged_out_at: null };

test('Chrome Linux is not mistaken for Apple/Safari; specific browsers take precedence', () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
  assert.deepEqual(deviceDetails(ua), { browser: 'Chrome 154', os: 'Linux' });
  assert.equal(deviceDetails(`${ua} Edg/154.0`).browser, 'Edge 154');
  assert.deepEqual(deviceDetails('Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit/605 Version/17.1 Mobile Safari/605'), { browser: 'Safari 17', os: 'iOS' });
});

test('public-only geolocation classification handles IPv4, IPv6, and mapped IPs', () => {
  for (const ip of ['::1', '127.0.0.2', '::ffff:127.0.0.1']) assert.equal(ipType(ip), 'loopback');
  for (const ip of ['10.0.0.1', '172.20.0.1', '192.168.1.1', 'fc00::1', 'fe80::1', '100.64.0.1', '169.254.0.1']) assert.equal(ipType(ip), 'private');
  for (const ip of ['8.8.8.8', '::ffff:8.8.8.8', '2606:4700:4700::1111']) assert.equal(ipType(ip), 'public');
  assert.equal(ipType('not-an-ip'), 'unknown');
});

test('active, logout, expiry, password/permission change, inactive account and legacy statuses', () => {
  assert.equal(sessionDetails(row, account).session_status, 'active');
  assert.equal(sessionDetails({ ...row, logged_out_at: new Date() }, account).inactive_reason, 'logged_out');
  assert.equal(sessionDetails({ ...row, expires_at: new Date(0) }, account).inactive_reason, 'expired');
  assert.equal(sessionDetails(row, { ...account, permissions_version: 4 }).inactive_reason, 'credentials_changed');
  assert.equal(sessionDetails(row, { ...account, is_active: 0 }).inactive_reason, 'account_inactive');
  assert.equal(sessionDetails({}, account).session_status, 'untracked');
});

test('session validation is user/version scoped, denies revoked sessions and refresh tokens', async () => {
  let where; let updates = 0; let found = { ...row, last_seen_at: new Date(), login_history_id: 1 };
  const service = load('src/services/login-session.service.js', { '../models': {
    user_login_history: { findOne: async (q) => { where = q.where; return found; }, update: async () => { updates++; } }
  } });
  const claims = { userId: 288, permissionsVersion: 3, sessionId: 'session-a' };
  await service.validateSession(claims);
  assert.equal(where.user_id, 288); assert.equal(where.session_id, 'session-a');
  assert.equal(where.session_version, 3); assert.equal(where.logged_out_at, null);
  assert.ok(where.expires_at[Op.gt] instanceof Date); assert.equal(updates, 0);
  found.last_seen_at = new Date(0); await service.validateSession(claims); assert.equal(updates, 1);
  found = null; await assert.rejects(service.validateSession(claims), /SESSION_REVOKED/);
  await assert.rejects(service.validateSession({ ...claims, type: 'refresh' }), /INVALID_TOKEN_TYPE/);
  await service.validateSession({ userId: 288, permissionsVersion: 3 });
});

test('logout revokes only the current tracked session; legacy internal logout revokes account tokens', async () => {
  let query; let incremented = false;
  const service = load('src/services/login-session.service.js', { '../models': {
    user_login_history: { update: async (values, options) => { query = { values, ...options }; } },
    users: { increment: async () => { incremented = true; } }
  } });
  const res = { json: (body) => body };
  assert.equal((await service.logout({ user: { userId: 288, sessionId: 'session-a', isInternalMember: true } }, res)).success, true);
  assert.equal(query.where.session_id, 'session-a'); assert.equal(query.where.user_id, 288);
  assert.ok(query.values.logged_out_at instanceof Date); assert.equal(incremented, false);
  await service.logout({ user: { userId: 288, isInternalMember: true } }, res);
  assert.equal(incremented, true);
});

test('auth rejects revoked/version-invalid sessions; logout remains available when password expired', async () => {
  let revoked = false;
  const auth = load('src/middleware/auth.js', {
    '../models': { users: { findOne: async () => account }, user_type: {} },
    '../config/config': { jwtSecret: 'test-secret' },
    '../services/internal-password-expiry.service': { getExpiryStatus: async () => ({ expired: true }) },
    '../services/login-session.service': { validateSession: async () => { if (revoked) throw new Error('SESSION_REVOKED'); } }
  });
  const token = jwt.sign({ userId: 288, permissionsVersion: 3, sessionId: 'session-a' }, 'test-secret');
  const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: '/v1/auth/logout' };
  let status; let next = false;
  const res = { status: (s) => { status = s; return res; }, json: (v) => v };
  await auth.authenticate(req, res, () => { next = true; });
  assert.equal(next, true); assert.equal(req.user.sessionId, 'session-a');
  req.originalUrl = '/v1/admin/login-history';
  await auth.authenticate(req, res, () => {}); assert.equal(status, 403);
  revoked = true; await auth.authenticate(req, res, () => {}); assert.equal(status, 401);
  await assert.rejects(auth.validatePermissionVersion({ userId: 288, permissionsVersion: 2 }), /PERMISSION_CHANGED/);
});

test('active filtering happens in SQL before pagination and never exposes session identifiers', async () => {
  // Construct real Sequelize models/query SQL without opening a database connection.
  const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false });
  const users = sequelize.define('users', { id: { type: DataTypes.INTEGER, primaryKey: true }, is_active: DataTypes.INTEGER, permissions_version: DataTypes.INTEGER }, { timestamps: false });
  users.addScope('all', {});
  const history = require('../src/models/user_login_history')(sequelize, DataTypes);
  history.belongsTo(users, { foreignKey: 'user_id', as: 'sessionUser' });
  let query;
  history.findAndCountAll = async (options) => {
    history._validateIncludedElements(options);
    query = sequelize.dialect.queryGenerator.selectQuery(history.tableName, options, history);
    return { count: 1, rows: [{ ...row, user_id: 288, login_history_id: 1, user_agent: 'Chrome/154 Linux' }] };
  };
  users.findAll = async (q) => q.attributes.includes('name') ? [account] : [{ id: 288 }];
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/admin.controller.js'), 'utf8');
  const handler = source.slice(source.indexOf('exports.getLoginHistory ='), source.indexOf('const POST_PRODUCTION_ASSIGNABLE_ROLE_NAMES'));
  const context = { exports: {}, Op, users, db: { users, user_login_history: history, user_type: { findAll: async () => [{ user_type_id: 1 }] } }, ipType, deviceDetails, sessionDetails, console };
  vm.runInNewContext(handler, context);
  const res = { status: () => res, json: (v) => v };
  const response = await context.exports.getLoginHistory({ query: { user_id: 288, status: 'active', limit: 10 }, user: { sessionId: 'session-a' } }, res);
  assert.equal(response.success, true);
  assert.match(query, /INNER JOIN `users` AS `sessionUser`/);
  assert.match(query, /`sessionUser`.`permissions_version` = `user_login_history`.`session_version`/);
  assert.match(query, /`user_login_history`.`logged_out_at` IS NULL/);
  assert.match(query, /`user_login_history`.`expires_at` >/);
  assert.match(query, /LIMIT 0, 10/);
  assert.equal(response.data[0].session_id, undefined);
  assert.equal(response.data[0].session_status, 'active');
  assert.equal(response.data[0].is_current_session, true);
  await sequelize.close();
});

test('IP capture trusts only the configured proxy chain, not a supplied forwarded header', () => {
  const express = require('express');
  const app = express(); app.set('trust proxy', ['loopback']);
  const req = Object.create(express.request);
  req.app = app; req.headers = { 'x-forwarded-for': '1.1.1.1' };
  req.socket = { remoteAddress: '8.8.8.8' };
  assert.equal(req.ip, '8.8.8.8');
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers['x-forwarded-for'] = '1.1.1.1, 8.8.8.8';
  assert.equal(req.ip, '8.8.8.8');
  req.headers = {}; req.socket = { remoteAddress: '::1' };
  assert.equal(req.ip, '::1');
});

test('issued sessions persist JWT expiry/version, fail closed on DB error, and skip local geolocation', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8');
  const helpers = source.slice(source.indexOf('const getRequestIpAddress ='), source.indexOf('const getGoogleClientId ='));
  const tokens = source.slice(source.indexOf('const generateTokens ='), source.indexOf('/**\n * Get permissions for a role'));
  let saved; let failure = false; let lookups = 0;
  const context = {
    jwt, ipType, Date, AbortController, setTimeout, clearTimeout,
    process: { env: { JWT_SECRET: 'test-secret' } }, console: { error: () => {} },
    fetch: async () => { lookups++; return { ok: true, json: async () => ({ city: 'Test City', country: 'Test Country' }) }; },
    db: { user_login_history: { create: async (values) => { if (failure) throw new Error('db unavailable'); saved = values; return { update: async () => {} }; } } }
  };
  vm.runInNewContext(`${helpers}\n${tokens}\nthis.issue = generateTokens; this.record = recordSuccessfulLogin; this.locate = getIpLocation;`, context);
  const pair = context.issue(288, 'Admin', 3, 1, 'session-a');
  const claims = jwt.verify(pair.token, 'test-secret');
  assert.equal(claims.sessionId, 'session-a');
  assert.equal(jwt.verify(pair.refreshToken, 'test-secret').type, 'refresh');
  const req = { ip: '::1', get: () => 'Chrome/154 Linux', headers: { 'x-forwarded-for': '8.8.8.8' } };
  await context.record(req, account, 'password', pair.token);
  assert.equal(saved.ip_address, '::1'); assert.equal(saved.session_id, claims.sessionId);
  assert.equal(saved.session_version, 3); assert.equal(saved.expires_at.getTime(), claims.exp * 1000);
  assert.equal(lookups, 0);
  assert.equal((await context.locate('8.8.8.8')).city, 'Test City'); assert.equal(lookups, 1);
  failure = true; await assert.rejects(context.record(req, account, 'password', pair.token), /db unavailable/);
});
