-- Apply once BEFORE deploying the new password reset API.
-- Requires the existing 20261005 password-expiry and login-session migrations.
-- Existing passwords, expiry settings and sessions are not changed.
ALTER TABLE `users`
  ADD COLUMN `password_reset_purpose` VARCHAR(10) NULL,
  ADD COLUMN `password_reset_proof_hash` VARCHAR(64) NULL,
  ADD COLUMN `password_reset_sent_at` DATETIME NULL,
  ADD COLUMN `password_reset_blocked_until` DATETIME NULL,
  ADD COLUMN `password_reset_version` INT NULL;
