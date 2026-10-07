const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const db = require('../models');
const config = require('../config/config');
const passwordExpiry = require('./internal-password-expiry.service');

const REFRESH_COOKIE = 'revure_refresh_session';
const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readCookie = (req, name) => String(req.headers?.cookie || '').split(';').map((s) => s.trim())
  .find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/v1/auth' });
const lifetimeMs = () => {
  const days = Number(config.refreshSessionDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error('REFRESH_SESSION_DAYS must be a positive number');
  return days * 86400000;
};
const setCookie = (res, rawToken) => res.cookie(REFRESH_COOKIE, rawToken, { ...cookieOptions(), maxAge: lifetimeMs() });
const clearCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

// The caller commits the refresh credential and login audit together, then sets
// the cookie. Only hashed random tokens are stored; no JWT refresh-token fallback.
async function create(req, user, loginSessionId, transaction) {
  const now = new Date();
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(now.getTime() + lifetimeMs());
  await db.user_sessions.create({
    user_id: user.id,
    login_session_id: loginSessionId || null,
    permissions_version: user.permissions_version,
    token_hash: hashToken(rawToken), expires_at: expiresAt,
    last_used_at: now, created_at: now,
    user_agent: String(req.get('user-agent') || '').slice(0, 512) || null,
    ip_address: String(req.ip || '').slice(0, 64) || null
  }, { transaction });
  return { rawToken, expiresAt };
}

async function refresh(req, res, generateTokens) {
  try {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (!rawToken) {
      clearCookie(res);
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }
    const result = await db.sequelize.transaction(async (transaction) => {
      // Lock the stable session row: concurrent refresh requests cannot both
      // rotate the same credential, and logout cannot be undone by rotation.
      const session = await db.user_sessions.findOne({
        where: { token_hash: hashToken(rawToken) }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;
      const user = await db.users.scope('all').findOne({
        where: { id: session.user_id, is_active: 1 }, transaction,
        include: [{ model: db.user_type, as: 'userType', attributes: ['user_type_id', 'user_role', 'is_internal_member'] }]
      });
      // Never upgrade old refresh credentials to the current password version.
      if (!user || session.permissions_version == null || Number(session.permissions_version) !== Number(user.permissions_version)) {
        await session.update({ revoked_at: new Date() }, { transaction });
        return null;
      }
      const internal = Number(user.userType?.is_internal_member || 0) === 1;
      let history = null;
      if (internal || session.login_session_id) {
        if (!session.login_session_id) {
          await session.update({ revoked_at: new Date() }, { transaction });
          return null;
        }
        history = await db.user_login_history.findOne({ where: {
          session_id: session.login_session_id, user_id: user.id,
          session_version: user.permissions_version, logged_out_at: null,
          expires_at: { [Op.gt]: new Date() }
        }, transaction, lock: transaction.LOCK.UPDATE });
        if (!history) {
          await session.update({ revoked_at: new Date() }, { transaction });
          return null;
        }
      }
      const status = await passwordExpiry.getExpiryStatus(user, internal);
      const now = new Date();
      const nextToken = crypto.randomBytes(48).toString('base64url');
      const expiresAt = new Date(now.getTime() + lifetimeMs());
      await session.update({ previous_token_hash: session.token_hash, token_hash: hashToken(nextToken), expires_at: expiresAt, last_used_at: now }, { transaction });
      if (history) await history.update({ expires_at: expiresAt, last_seen_at: now }, { transaction });
      const { token } = generateTokens(user.id, user.userType?.user_role || 'client', user.permissions_version,
        user.userType?.user_type_id || user.user_type, session.login_session_id || undefined);
      return { rawToken: nextToken, token, status };
    });
    if (!result) {
      clearCookie(res);
      return res.status(401).json({ success: false, force_logout: true, message: 'Session is no longer valid. Please sign in again.' });
    }
    setCookie(res, result.rawToken);
    // Expiry does not end the login: this token can reach OTP/password-change
    // endpoints, while protected endpoints still return PASSWORD_EXPIRED.
    return res.json({ success: true, token: result.token,
      password_expired: result.status.expired, password_expires_at: result.status.expires_at || null });
  } catch (error) {
    console.error('Refresh session error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to refresh session.' });
  }
}

async function logout(req, res) {
  try {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    const bearer = req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const accessToken = bearer || readCookie(req, 'revure_token');
    let decoded = null;
    if (accessToken) {
      try {
        // Expired access tokens may identify ONLY what to revoke, never grant access.
        const claims = jwt.verify(accessToken, config.jwtSecret, { ignoreExpiration: true });
        if (!claims.type && claims.userId) decoded = claims;
      } catch { /* A valid refresh cookie can still end the session. */ }
    }
    await db.sequelize.transaction(async (transaction) => {
      const targets = [];
      if (rawToken) {
        // A logout started just before refresh may carry the previous cookie.
        // That cookie can revoke this session, but can never refresh it again.
        const session = await db.user_sessions.findOne({
          where: { [Op.or]: [{ token_hash: hashToken(rawToken) }, { previous_token_hash: hashToken(rawToken) }] },
          transaction, lock: transaction.LOCK.UPDATE
        });
        if (session) {
          await session.update({ revoked_at: new Date() }, { transaction });
          if (session.login_session_id) targets.push({ user_id: session.user_id, session_id: session.login_session_id });
        }
      }
      if (decoded?.sessionId) {
        targets.push({ user_id: decoded.userId, session_id: decoded.sessionId });
        await db.user_sessions.update({ revoked_at: new Date() }, { where: {
          user_id: decoded.userId, login_session_id: decoded.sessionId, revoked_at: null
        }, transaction });
      } else if (decoded && decoded.permissionsVersion != null) {
        const user = await db.users.findOne({ where: { id: decoded.userId }, transaction,
          include: [{ model: db.user_type, as: 'userType', attributes: ['is_internal_member'] }] });
        if (Number(user?.userType?.is_internal_member || 0) === 1) {
          // Only the current legacy token version can invalidate the account once.
          const [changed] = await db.users.update({ permissions_version: Number(decoded.permissionsVersion) + 1 }, {
            where: { id: user.id, permissions_version: decoded.permissionsVersion }, transaction
          });
          if (changed) await db.user_sessions.update({ revoked_at: new Date() }, { where: { user_id: user.id, revoked_at: null }, transaction });
        }
      }
      for (const target of targets) {
        await db.user_login_history.update({ logged_out_at: new Date() }, {
          where: { ...target, logged_out_at: null }, transaction
        });
      }
    });
    clearCookie(res);
    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to log out. Please try again.' });
  }
}

module.exports = { create, setCookie, refresh, logout };
