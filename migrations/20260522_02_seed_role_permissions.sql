-- Seed role-scoped permission modules from scratch.
-- This resets permission IDs, so dependent mapping tables must be cleared first.

SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM `user_permissions`;
DELETE FROM `role_permissions`;
DELETE FROM `permissions`;
ALTER TABLE `user_permissions` AUTO_INCREMENT = 1;
ALTER TABLE `role_permissions` AUTO_INCREMENT = 1;
ALTER TABLE `permissions` AUTO_INCREMENT = 1;
SET FOREIGN_KEY_CHECKS = 1;

DROP TEMPORARY TABLE IF EXISTS `permission_module_seed`;
CREATE TEMPORARY TABLE `permission_module_seed` (
  `role_id` INT NOT NULL,
  `module_key` VARCHAR(100) NOT NULL
);

-- Admin: user_type_id = 1
INSERT INTO `permission_module_seed` (`role_id`, `module_key`) VALUES
(1, 'dashboard'),
(1, 'shoots'),
(1, 'file_manager'),
(1, 'meetings'),
(1, 'messages'),
(1, 'availability'),
(1, 'sales_representative'),
(1, 'finances'),
(1, 'users'),
(1, 'quotes'),
(1, 'invoices');

-- Crew member / Creator: user_type_id = 2
INSERT INTO `permission_module_seed` (`role_id`, `module_key`) VALUES
(2, 'dashboard'),
(2, 'requests_and_shoots'),
(2, 'file_manager'),
(2, 'meetings'),
(2, 'messages'),
(2, 'affiliate'),
(2, 'availability'),
(2, 'profile'),
(2, 'payouts'),
(2, 'settings');

-- Sales representative: user_type_id = 5
INSERT INTO `permission_module_seed` (`role_id`, `module_key`) VALUES
(5, 'sales'),
(5, 'availability'),
(5, 'shoots'),
(5, 'file_manager'),
(5, 'meetings'),
(5, 'messages'),
(5, 'quotes');

-- Client: user_type_id = 3 and duplicate Client role user_type_id = 8
INSERT INTO `permission_module_seed` (`role_id`, `module_key`) VALUES
(3, 'dashboard'),
(3, 'affiliate_overview'),
(3, 'file_manager'),
(3, 'find_yourself'),
(3, 'meetings'),
(3, 'messages'),
(3, 'shoots'),
(3, 'quotes'),
(3, 'book_a_shoot'),
(3, 'finances'),
(3, 'profile'),
(8, 'dashboard'),
(8, 'affiliate_overview'),
(8, 'file_manager'),
(8, 'find_yourself'),
(8, 'meetings'),
(8, 'messages'),
(8, 'shoots'),
(8, 'quotes'),
(8, 'book_a_shoot'),
(8, 'finances'),
(8, 'profile');

DROP TEMPORARY TABLE IF EXISTS `permission_action_seed`;
CREATE TEMPORARY TABLE `permission_action_seed` (
  `action_key` VARCHAR(50) NOT NULL
);

INSERT INTO `permission_action_seed` (`action_key`) VALUES
('view'),
('create'),
('edit'),
('delete');

INSERT INTO `permissions` (
  `role_id`,
  `module_key`,
  `action_key`,
  `permission_key`,
  `is_active`
)
SELECT
  modules.`role_id`,
  modules.`module_key`,
  actions.`action_key`,
  CONCAT(modules.`module_key`, '.', actions.`action_key`) AS `permission_key`,
  1 AS `is_active`
FROM `permission_module_seed` modules
CROSS JOIN `permission_action_seed` actions;

-- Default tab access is granted by view permission only.
-- Use PUT /admin/roles/update to grant create/edit/delete where needed.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `is_active`
)
SELECT
  `role_id`,
  `permission_id`,
  1
FROM `permissions`
WHERE `action_key` = 'view';

DROP TEMPORARY TABLE IF EXISTS `permission_action_seed`;
DROP TEMPORARY TABLE IF EXISTS `permission_module_seed`;
