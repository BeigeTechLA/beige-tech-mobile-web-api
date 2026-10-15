-- Apply once before deploying the merged refresh/password-expiry API.
-- Requires 20260930_01_create_user_sessions.sql and the 20261005 login-history migrations.
ALTER TABLE `user_sessions`
  ADD COLUMN `login_session_id` VARCHAR(36) NULL,
  ADD COLUMN `permissions_version` INT NULL,
  ADD COLUMN `previous_token_hash` VARCHAR(64) NULL,
  ADD UNIQUE KEY `uq_user_sessions_login_session` (`login_session_id`),
  ADD UNIQUE KEY `uq_user_sessions_previous_token` (`previous_token_hash`);

-- Do NOT backfill permissions_version with the user's current value: that could
-- revive a refresh credential issued before a password change. Existing refresh
-- sessions without this snapshot require one fresh sign-in. New sessions keep
-- the configured long lifetime and rotate without bypassing password expiry.
