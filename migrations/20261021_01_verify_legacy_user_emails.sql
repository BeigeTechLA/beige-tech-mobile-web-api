-- Run once on each database immediately before deploying the email verification
-- login gate. Capture the current maximum user ID before new signup traffic uses
-- the gated API. Do not rerun after deployment: later accounts need their OTP.
SET @legacy_max_user_id := (SELECT COALESCE(MAX(id), 0) FROM users);

SELECT @legacy_max_user_id AS legacy_max_user_id,
       COUNT(*) AS legacy_unverified_users
FROM users
WHERE id <= @legacy_max_user_id AND email_verified = 0;

UPDATE users
SET email_verified = 1,
    verification_code = NULL
WHERE id <= @legacy_max_user_id AND email_verified = 0;

SELECT ROW_COUNT() AS legacy_users_marked_verified;
