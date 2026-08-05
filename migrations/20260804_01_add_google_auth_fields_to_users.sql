ALTER TABLE `users`
  ADD COLUMN `google_sub` VARCHAR(255) NULL AFTER `password_hash`,
  ADD COLUMN `auth_provider` VARCHAR(50) NULL AFTER `google_sub`;

ALTER TABLE `users`
  ADD UNIQUE KEY `google_sub` (`google_sub`);

ALTER TABLE `clients`
  MODIFY COLUMN `phone_number` VARCHAR(20) NULL;

ALTER TABLE users
  ADD COLUMN profile_image TEXT NULL AFTER auth_provider;

