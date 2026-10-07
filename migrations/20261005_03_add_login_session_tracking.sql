-- Apply once BEFORE deploying the session-aware API. Existing history remains untracked.
-- No existing sign-ins can reliably be backfilled as active or logged out.
-- Deploy API and frontend together, then sign in again to create tracked sessions.
-- Legacy JWT logout invalidates all sessions for that account (no per-session ID).
-- New tracked JWT logout invalidates only the current session.
-- API clients must POST /v1/auth/logout before discarding their token.
ALTER TABLE `user_login_history`
  ADD COLUMN `session_id` VARCHAR(36) NULL,
  ADD COLUMN `session_version` INT NULL,
  ADD COLUMN `expires_at` DATETIME NULL,
  ADD COLUMN `last_seen_at` DATETIME NULL,
  ADD COLUMN `logged_out_at` DATETIME NULL,
  ADD UNIQUE KEY `uq_login_history_session` (`session_id`),
  ADD KEY `idx_login_history_active` (`user_id`, `logged_out_at`, `expires_at`);
