const db = require('../models');
const { Op } = require('sequelize');

async function validateSession(decoded) {
  if (decoded.type) throw new Error('INVALID_TOKEN_TYPE');
  // Existing tokens remain usable during rollout; history explicitly labels them untracked.
  if (!decoded.sessionId) return;
  const now = new Date();
  const session = await db.user_login_history.findOne({ where: {
    session_id: decoded.sessionId, user_id: decoded.userId,
    session_version: decoded.permissionsVersion, logged_out_at: null,
    expires_at: { [Op.gt]: now }
  } });
  if (!session) throw new Error('SESSION_REVOKED');
  // Throttle activity writes, without weakening revocation checks.
  if (!session.last_seen_at || now - new Date(session.last_seen_at) >= 60000) {
    await db.user_login_history.update({ last_seen_at: now }, { where: {
      login_history_id: session.login_history_id, logged_out_at: null,
      [Op.or]: [{ last_seen_at: null }, { last_seen_at: { [Op.lt]: new Date(now - 60000) } }]
    } });
  }
}

async function logout(req, res) {
  try {
    if (req.user.sessionId) {
      await db.user_login_history.update({ logged_out_at: new Date() }, { where: {
        session_id: req.user.sessionId, user_id: req.user.userId, logged_out_at: null
      } });
    } else if (req.user.isInternalMember) {
      // A legacy JWT has no individual session ID. Revoke all its account's legacy tokens.
      await db.users.increment('permissions_version', { where: { id: req.user.userId } });
    }
    return res.json({ success: true, message: 'Signed out successfully.' });
  } catch (error) {
    console.error('Session logout failed:', error.message);
    return res.status(500).json({ success: false, message: 'Could not sign out. Please try again.' });
  }
}

module.exports = { validateSession, logout };
