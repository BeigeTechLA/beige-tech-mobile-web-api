const OTP_VALID_MS = 10 * 60 * 1000;

module.exports = function createAccountDeletionRequestService({ db, now = Date.now }) {
  let tableReady;

  async function ensureTable() {
    if (!tableReady) {
      tableReady = db.sequelize.query(`
        CREATE TABLE IF NOT EXISTS account_deletion_requests (
          request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          request_code VARCHAR(32) NULL,
          user_id INT NOT NULL,
          source VARCHAR(20) NOT NULL DEFAULT 'Web',
          verification_status VARCHAR(20) NOT NULL DEFAULT 'Verified',
          status VARCHAR(32) NOT NULL DEFAULT 'Pending Deletion',
          cancelled_by VARCHAR(16) NULL,
          cancelled_at DATETIME NULL,
          verified_at DATETIME NULL,
          completed_at DATETIME NULL,
          requested_at DATETIME NOT NULL,
          scheduled_deletion_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_account_deletion_request_code (request_code),
          KEY idx_account_deletion_request_user (user_id),
          KEY idx_account_deletion_request_status_date (status, scheduled_deletion_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `).catch((error) => {
        tableReady = null;
        throw error;
      });
    }
    await tableReady;
    for (const [column, definition] of [
      ['cancelled_by', 'VARCHAR(16) NULL'],
      ['cancelled_at', 'DATETIME NULL'],
      ['verified_at', 'DATETIME NULL'],
      ['completed_at', 'DATETIME NULL'],
    ]) {
      const columns = await db.sequelize.query(`SHOW COLUMNS FROM account_deletion_requests LIKE '${column}'`, {
        type: db.Sequelize.QueryTypes.SELECT,
      });
      if (!columns.length) await db.sequelize.query(`ALTER TABLE account_deletion_requests ADD COLUMN ${column} ${definition}`);
    }
  }

  async function create(userId) {
    await ensureTable();
    return db.sequelize.transaction(async (transaction) => {
      const user = await db.users.findOne({
        where: { id: userId, is_active: 1 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) return { status: 404, success: false, message: 'Active account was not found.' };

      const verifiedAt = user.password_expiry_otp_verified_at
        ? new Date(user.password_expiry_otp_verified_at).getTime()
        : 0;
      if (user.password_reset_purpose !== 'deletion' || !user.password_reset_proof_hash ||
          !verifiedAt || verifiedAt + OTP_VALID_MS <= now() ||
          Number(user.password_reset_version) !== Number(user.permissions_version)) {
        return { status: 403, success: false, code: 'DELETION_VERIFICATION_REQUIRED',
          message: 'Verify your email before submitting an account deletion request.' };
      }

      const existing = await db.sequelize.query(`
        SELECT request_id, request_code, requested_at, scheduled_deletion_at, status
        FROM account_deletion_requests
        WHERE user_id = :userId AND status IN ('Pending Deletion', 'Processing')
        ORDER BY request_id DESC LIMIT 1 FOR UPDATE
      `, { replacements: { userId }, type: db.Sequelize.QueryTypes.SELECT, transaction });
      if (existing.length) {
        await user.update({
          password_expiry_otp_verified_at: null,
          password_reset_proof_hash: null,
          password_reset_purpose: null,
          password_reset_version: null,
        }, { transaction });
        return {
          success: true,
          message: 'An account deletion request is already active.',
          data: {
            request_id: existing[0].request_code || `DEL-${String(existing[0].request_id).padStart(6, '0')}`,
            requested_at: existing[0].requested_at,
            scheduled_deletion_at: existing[0].scheduled_deletion_at,
            status: existing[0].status,
          },
        };
      }

      const recentCancellation = await db.sequelize.query(`
        SELECT cancelled_at FROM account_deletion_requests
        WHERE user_id = :userId AND status = 'Cancelled' AND cancelled_at IS NOT NULL
        ORDER BY cancelled_at DESC LIMIT 1 FOR UPDATE
      `, { replacements: { userId }, type: db.Sequelize.QueryTypes.SELECT, transaction });
      if (recentCancellation.length) {
        const cooldownEndsAt = new Date(recentCancellation[0].cancelled_at).getTime() + 4 * 24 * 60 * 60 * 1000;
        if (cooldownEndsAt > now()) {
          return { status: 429, success: false, code: 'DELETION_COOLDOWN',
            retry_after_seconds: Math.ceil((cooldownEndsAt - now()) / 1000),
            available_at: new Date(cooldownEndsAt),
            message: 'You can submit another deletion request after the 4-day cooldown.' };
        }
      }

      const requestedAt = new Date(now());
      const scheduledDeletionAt = new Date(requestedAt.getTime());
      scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 60);
      await db.sequelize.query(`
        INSERT INTO account_deletion_requests
          (user_id, source, verification_status, status, requested_at, scheduled_deletion_at, verified_at)
        VALUES (:userId, 'Web', 'Verified', 'Pending Deletion', :requestedAt, :scheduledDeletionAt, :verifiedAt)
      `, { replacements: { userId, requestedAt, scheduledDeletionAt, verifiedAt: new Date(verifiedAt) }, transaction });

      const inserted = await db.sequelize.query('SELECT LAST_INSERT_ID() AS requestId', {
        type: db.Sequelize.QueryTypes.SELECT,
        transaction,
      });
      const requestId = Number(inserted[0]?.requestId);
      const requestCode = `DEL-${String(requestId).padStart(6, '0')}`;
      await db.sequelize.query(
        'UPDATE account_deletion_requests SET request_code = :requestCode WHERE request_id = :requestId',
        { replacements: { requestId, requestCode }, transaction }
      );

      // Consume the successful OTP verification so it cannot submit another request.
      await user.update({
        password_expiry_otp_verified_at: null,
        password_reset_proof_hash: null,
        password_reset_purpose: null,
        password_reset_version: null,
      }, { transaction });

      return {
        success: true,
        message: 'Account deletion request submitted.',
        data: {
          request_id: requestCode,
          requested_at: requestedAt,
          scheduled_deletion_at: scheduledDeletionAt,
          status: 'Pending Deletion',
        },
      };
    });
  }

  async function list() {
    await ensureTable();
    const rows = await db.sequelize.query(`
      SELECT r.request_id, r.request_code, r.user_id, r.source,
        r.verification_status, r.status, r.requested_at, r.scheduled_deletion_at,
        r.cancelled_by, r.cancelled_at, r.verified_at, r.completed_at, r.updated_at,
        u.name, u.email, u.profile_image, ut.user_role
      FROM account_deletion_requests r
      INNER JOIN users u ON u.id = r.user_id
      LEFT JOIN user_type ut ON ut.user_type_id = u.user_type
      ORDER BY r.requested_at DESC, r.request_id DESC
    `, { type: db.Sequelize.QueryTypes.SELECT });
    return rows.map((row) => ({
      request_id: row.request_id,
      request_code: row.request_code || `DEL-${String(row.request_id).padStart(6, '0')}`,
      user_id: row.user_id,
      name: row.name || row.email || 'Unknown user',
      email: row.email,
      avatar: row.profile_image || null,
      account_type: normalizeAccountType(row.user_role),
      source: row.source,
      verification_status: row.verification_status,
      status: row.status,
      requested_at: row.requested_at,
      scheduled_deletion_at: row.scheduled_deletion_at,
      cancelled_by: row.cancelled_by,
      cancelled_at: row.cancelled_at,
      verified_at: row.verified_at || row.requested_at,
      completed_at: row.completed_at || (row.status === 'Completed' ? row.updated_at : null),
    }));
  }

  async function getActive(userId) {
    await ensureTable();
    const rows = await db.sequelize.query(`
      SELECT request_id, request_code, requested_at, scheduled_deletion_at, status, cancelled_by, cancelled_at
      FROM account_deletion_requests
      WHERE user_id = :userId
      ORDER BY request_id DESC LIMIT 1
    `, { replacements: { userId }, type: db.Sequelize.QueryTypes.SELECT });
    const row = rows[0];
    if (!row) return null;
    return {
      request_id: row.request_code || `DEL-${String(row.request_id).padStart(6, '0')}`,
      requested_at: row.requested_at,
      scheduled_deletion_at: row.scheduled_deletion_at,
      status: row.status,
      cancelled_by: row.cancelled_by,
      cancelled_at: row.cancelled_at,
      cooldown_ends_at: row.cancelled_at ? new Date(new Date(row.cancelled_at).getTime() + 4 * 24 * 60 * 60 * 1000) : null,
    };
  }

  async function cancelForUser(userId) {
    await ensureTable();
    const result = await db.sequelize.query(`
      UPDATE account_deletion_requests
      SET status = 'Cancelled', cancelled_by = 'User', cancelled_at = NOW()
      WHERE user_id = :userId AND status IN ('Pending Deletion', 'Processing')
      ORDER BY request_id DESC LIMIT 1
    `, { replacements: { userId } });
    if (!result[0]?.affectedRows) return { status: 404, success: false, message: 'No active deletion request was found.' };
    return { success: true, message: 'Deletion request cancelled.', data: await getActive(userId) };
  }

  async function cancelByAdmin(requestCode) {
    await ensureTable();
    const [result] = await db.sequelize.query(`
      UPDATE account_deletion_requests
      SET status = 'Cancelled', cancelled_by = 'Admin', cancelled_at = NOW()
      WHERE request_code = :requestCode AND status IN ('Pending Deletion', 'Processing', 'Failed')
    `, { replacements: { requestCode } });
    if (!result?.affectedRows) return { status: 404, success: false, message: 'Active deletion request was not found.' };
    return { success: true, message: 'Deletion request cancelled by admin.' };
  }

  async function acceptByAdmin(requestCode) {
    await ensureTable();
    const [result] = await db.sequelize.query(`
      UPDATE account_deletion_requests
      SET status = 'Processing'
      WHERE request_code = :requestCode
        AND status = 'Pending Deletion'
        AND scheduled_deletion_at > NOW()
    `, { replacements: { requestCode } });
    if (!result?.affectedRows) return { status: 409, success: false, message: 'This request is no longer pending or its grace period has expired.' };
    return { success: true, message: 'Deletion request accepted and processing started.' };
  }

  async function processDueRequests() {
    await ensureTable();
    return db.sequelize.transaction(async (transaction) => {
      const dueProcessing = await db.sequelize.query(`
        SELECT request_id, user_id FROM account_deletion_requests
        WHERE status = 'Processing' AND scheduled_deletion_at <= NOW()
        FOR UPDATE
      `, { replacements: {}, type: db.Sequelize.QueryTypes.SELECT, transaction });

      if (dueProcessing.length) {
        const requestIds = dueProcessing.map((row) => row.request_id);
        const userIds = [...new Set(dueProcessing.map((row) => row.user_id))];
        await db.sequelize.query(`
          UPDATE account_deletion_requests SET status = 'Completed', completed_at = NOW()
          WHERE request_id IN (:requestIds)
        `, { replacements: { requestIds }, transaction });
        await db.sequelize.query(`
          UPDATE users SET is_active = 0 WHERE id IN (:userIds)
        `, { replacements: { userIds }, transaction });
      }

      const [failedResult] = await db.sequelize.query(`
        UPDATE account_deletion_requests SET status = 'Failed'
        WHERE status = 'Pending Deletion' AND scheduled_deletion_at <= NOW()
      `, { transaction });

      return { completed: dueProcessing.length, failed: Number(failedResult?.affectedRows || 0) };
    });
  }

  return { create, list, getActive, cancelForUser, cancelByAdmin, acceptByAdmin, processDueRequests };
};

function normalizeAccountType(value) {
  const role = String(value || '').toLowerCase();
  if (role.includes('client')) return 'Client';
  if (role.includes('affiliate')) return 'Affiliate';
  if (role.includes('creator') || role.includes('creative') || role === 'cp') return 'Creator';
  return value || 'Account';
}
