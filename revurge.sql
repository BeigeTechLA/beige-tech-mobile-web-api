--19-12-25

ALTER TABLE equipment_category ADD COLUMN category_name VARCHAR(150) NOT NULL AFTER name, ADD COLUMN description TEXT NULL AFTER category_name;

ALTER TABLE equipment ADD COLUMN brand VARCHAR(100) NULL AFTER manufacturer;

ALTER TABLE equipment
ADD COLUMN rental_price_per_hour DECIMAL(10,2) NULL AFTER daily_rental_rate,
ADD COLUMN availability_status ENUM('available', 'unavailable', 'maintenance', 'rented') NULL DEFAULT 'available' AFTER rental_price_per_hour,
ADD COLUMN condition_status VARCHAR(50) NULL AFTER availability_status;

--05-01-26

ALTER TABLE skills_master ADD COLUMN sub_skills TEXT NULL AFTER name;
ALTER TABLE crew_members MODIFY COLUMN primary_role TEXT NULL;


INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Corporate Event', 'Conferences, summits, company offsites', '1', current_timestamp()), (NULL, 'Weddings', 'Ceremony, reception, highlight films', '1', current_timestamp());
INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Private Events', 'Parties, birthdays, celebrations', '1', current_timestamp()), (NULL, 'Commercial & Advertising', 'Brand ads, promos, campaigns', '1', current_timestamp()), (NULL, 'Social Content', 'Reels, TikToks, YouTube', '1', current_timestamp()), (NULL, 'Podcasts & Shows', 'Video podcasts, livestreams', '1', current_timestamp()), (NULL, 'Music Videos', 'Artist-led productions', '1', current_timestamp()), (NULL, 'Short Films & Narrative', 'Scripted, cinematic stories', '1', current_timestamp()), (NULL, 'Brand & Product', 'Products, lifestyle, e-commerce', '1', current_timestamp()), (NULL, 'People & Teams', 'Headshots and portraits', '1', current_timestamp()), (NULL, 'Behind-the-Scenes', 'Candid, production moments', '1', current_timestamp());
INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Corporate Event Video Editor', ' Conferences, summits, company offsites', '1', current_timestamp()), (NULL, 'Wedding Video Editor', 'Ceremony, reception, highlight films', '1', current_timestamp()), (NULL, 'Private Event Video Editor', 'Parties, birthdays, celebrations', '1', current_timestamp()), (NULL, 'Commercial & Advertising  Video Editor', 'Brand ads, promos, campaigns', '1', current_timestamp()), (NULL, 'Social Content  Video Editor', 'Reels, TikToks, YouTube', '1', current_timestamp()), (NULL, 'Podcasts & Shows Video Editor', 'Video podcasts, livestreams', '1', current_timestamp()), (NULL, 'Music Videos Video Editor', 'Artist-led productions', '1', current_timestamp()), (NULL, 'Short Films & Narrative Video Editor', 'Scripted, cinematic stories', '1', current_timestamp()), (NULL, 'Corporate Events Photo Editor', 'Conferences, company gatherings', '1', current_timestamp()), (NULL, 'Weddings Photo Editor', 'Ceremony and reception', '1', current_timestamp()), (NULL, 'Private Events Photo Editor', 'Parties, celebrations', '1', current_timestamp()), (NULL, 'Brand & Product Photo Editor', 'Products, lifestyle, e-commerce', '1', current_timestamp()), (NULL, 'Social Content Photo Editor', 'Content for social platforms', '1', current_timestamp());

--22-01-26

ALTER TABLE stream_project_booking
ADD COLUMN user_id INT(11) NULL AFTER stream_project_booking_id,
ADD COLUMN quote_id INT(11) NULL AFTER user_id,
ADD COLUMN guest_email VARCHAR(255) NULL AFTER quote_id,
ADD COLUMN payment_id INT(11) NULL AFTER is_active,
ADD COLUMN payment_completed_at DATETIME NULL AFTER payment_id;

ALTER TABLE equipment
ADD COLUMN owner_id INT(11) NULL AFTER category_id,
ADD COLUMN rental_price_per_hour DECIMAL(10,2) NULL AFTER daily_rental_rate,
ADD COLUMN availability_status ENUM('available','unavailable','maintenance','rented')
    DEFAULT 'available' AFTER rental_price_per_hour,
ADD COLUMN condition_status VARCHAR(50) NULL AFTER availability_status;

-- 23-01-26

ALTER TABLE `crew_member_files` ADD `title` VARCHAR(255) NULL AFTER `is_active`, ADD `tag` VARCHAR(255) NULL AFTER `title`;
ALTER TABLE stream_project_booking
ADD COLUMN status TINYINT(1) NOT NULL DEFAULT 0
COMMENT '0=Initiated,1=PreProduction,2=PostProduction,3=Revision,4=Completed,5=Cancelled';

--27-01-26

ALTER TABLE crew_members
ADD COLUMN is_crew_verified INT(11) DEFAULT 0 COMMENT '1 = verified/approved, 2 = rejected';

UPDATE crew_members
SET is_crew_verified = 1
WHERE is_crew_verified = 0;

CREATE TABLE post_production_members (
    post_production_member_id INT(11) AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT current_timestamp(),
    updated_at DATETIME DEFAULT current_timestamp() ON UPDATE current_timestamp()
);

INSERT INTO post_production_members (first_name, last_name, email, phone_number, is_active, created_at, updated_at)
VALUES 
  ('John', 'Doe', 'john.doe@example.com', '1234567890', 1, NOW(), NOW()),
  ('Jane', 'Smith', 'jane.smith@example.com', '0987654321', 1, NOW(), NOW()),
  ('Alex', 'Johnson', 'alex.johnson@example.com', '1231231234', 1, NOW(), NOW()),
  ('Emily', 'Davis', 'emily.davis@example.com', '4564564567', 1, NOW(), NOW()),
  ('Michael', 'Wilson', 'michael.wilson@example.com', '7897897890', 1, NOW(), NOW()),
  ('Sophia', 'Brown', 'sophia.brown@example.com', '3213213210', 1, NOW(), NOW()),
  ('David', 'Taylor', 'david.taylor@example.com', '6546546543', 1, NOW(), NOW()),
  ('Olivia', 'Anderson', 'olivia.anderson@example.com', '9879879876', 1, NOW(), NOW()),
  ('James', 'Thomas', 'james.thomas@example.com', '5675675678', 1, NOW(), NOW()),
  ('Ava', 'Martinez', 'ava.martinez@example.com', '4324324321', 1, NOW(), NOW()),
  ('William', 'Garcia', 'william.garcia@example.com', '8768768765', 1, NOW(), NOW()),
  ('Isabella', 'Rodriguez', 'isabella.rodriguez@example.com', '1111111111', 1, NOW(), NOW()),
  ('Liam', 'Lee', 'liam.lee@example.com', '2222222222', 1, NOW(), NOW()),
  ('Mia', 'Harris', 'mia.harris@example.com', '3333333333', 1, NOW(), NOW());

CREATE TABLE assigned_post_production_member (
    id INT(11) AUTO_INCREMENT PRIMARY KEY,
    project_id INT(11) NOT NULL,
    post_production_member_id INT(11) NOT NULL,
    assigned_date DATETIME DEFAULT current_timestamp(),
    status VARCHAR(20) DEFAULT 'assigned',
    organization_type INT(11) NOT NULL DEFAULT 1,  -- 1 = BEIGE, 2 = MEMEHOUSE
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT current_timestamp(),
    updated_at DATETIME DEFAULT current_timestamp() ON UPDATE current_timestamp()
);

--28-01-26

INSERT INTO `user_type` (`user_type_id`, `user_role`, `is_active`) VALUES (NULL, 'Client', '1');

CREATE TABLE `clients` (
  `client_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `clients`
  ADD PRIMARY KEY (`client_id`),
  ADD KEY `user_id` (`user_id`);

ALTER TABLE `clients`
  MODIFY `client_id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `clients`
  ADD CONSTRAINT `clients_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

-- 31-01-26

UPDATE `user_type` SET `user_role` = 'Creative' WHERE `user_type`.`user_type_id` = 4;
UPDATE `user_type` SET `user_role` = 'Creative' WHERE `user_type`.`user_type_id` = 2;

-- 05-02-26

ALTER TABLE `users` CHANGE `is_active` `is_active` TINYINT(1) NOT NULL DEFAULT '1';

-- 06-02-26
ALTER TABLE `users` DROP INDEX `email`;
ALTER TABLE `users` DROP INDEX `phone_number`;
ALTER TABLE `users` DROP INDEX `instagram_handle`;

-- 11-02-26
-- INSERT INTO `user_type` (`user_type_id`, `user_role`, `is_active`) VALUES (NULL, 'production_manager', '1');
-- INSERT INTO `users` (`id`, `name`, `email`, `phone_number`, `instagram_handle`, `password_hash`, `otp_code`, `otp_expiry`, `email_verified`, `verification_code`, `created_at`, `is_active`, `user_type`, `reset_token`, `reset_token_expiry`) VALUES (NULL, 'Production Manager', 'production@beigecorporation.io', NULL, NULL, '$2b$10$Iu5MhthnoDvhPSc.v0t7Ru/2M3zlEMQAmyOL3A.cyMUD/etk9XO82', NULL, '2026-02-11 05:41:21', '0', '995983', '2026-02-11 05:31:21', '1', '6', NULL, NULL);

--16-02-26

ALTER TABLE `stream_project_booking` 
ADD COLUMN `shoot_type` VARCHAR(100) DEFAULT NULL AFTER `event_type`,
ADD COLUMN `content_type` VARCHAR(255) DEFAULT NULL AFTER `shoot_type`,
ADD COLUMN `reference_links` TEXT DEFAULT NULL AFTER `equipments_needed`;
ALTER TABLE `stream_project_booking` ADD `special_instructions` TEXT NULL DEFAULT NULL AFTER `photo_edit_types`;

ALTER TABLE sales_leads
ADD COLUMN intent ENUM('Hot','Warm','Cold') DEFAULT NULL AFTER lead_status,
ADD COLUMN intent_updated_by INT DEFAULT NULL,
ADD COLUMN intent_updated_at TIMESTAMP NULL;

ALTER TABLE stream_project_booking
  ADD COLUMN edits_needed TINYINT(1) DEFAULT 0 AFTER reference_links,
  ADD COLUMN video_edit_types TEXT DEFAULT NULL AFTER edits_needed,
  ADD COLUMN photo_edit_types TEXT DEFAULT NULL AFTER video_edit_types,
  ADD COLUMN special_instructions TEXT DEFAULT NULL AFTER photo_edit_types;

ALTER TABLE `sales_lead_activities` CHANGE `activity_type` `activity_type` ENUM('created','booking_updated','status_changed','assigned','contacted_sales','payment_link_generated','discount_code_generated','payment_link_opened','discount_applied','payment_completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- 18-02-26
ALTER TABLE `sales_leads` ADD `phone` VARCHAR(20) NULL AFTER `client_name`;
ALTER TABLE `sales_leads` ADD `lead_source` VARCHAR(50) NULL AFTER `intent`;

-- 23-02-26

ALTER TABLE stream_project_booking
  ADD COLUMN stripe_customer_id VARCHAR(255) NULL,
  ADD COLUMN stripe_invoice_id VARCHAR(255) NULL,
  ADD COLUMN invoice_generation_status VARCHAR(32) NULL,
  ADD COLUMN invoice_generation_started_at DATETIME NULL;

CREATE UNIQUE INDEX idx_stream_project_booking_stripe_invoice_id
  ON stream_project_booking (stripe_invoice_id);

CREATE INDEX idx_stream_project_booking_stripe_customer_id
  ON stream_project_booking (stripe_customer_id);

--24-02-26

ALTER TABLE sales_leads MODIFY COLUMN lead_status VARCHAR(100) NOT NULL DEFAULT 'book_a_shoot_lead_created';

--02-03-26

ALTER TABLE `assigned_crew` 
ADD COLUMN `responded_at` DATETIME NULL AFTER `crew_accept`;

--05-03-26

ALTER TABLE referrals
MODIFY COLUMN commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00
COMMENT 'Commission amount calculated from booking total';

--10-03-26

CREATE TABLE IF NOT EXISTS stream_project_booking_days (
  stream_project_booking_day_id INT(11) NOT NULL AUTO_INCREMENT,
  stream_project_booking_id INT(11) NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  duration_hours DECIMAL(5,2) NULL,
  time_zone VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (stream_project_booking_day_id),
  KEY idx_booking_id (stream_project_booking_id),
  KEY idx_event_date (event_date),
  CONSTRAINT fk_booking_days_booking
    FOREIGN KEY (stream_project_booking_id)
    REFERENCES stream_project_booking (stream_project_booking_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `project_form_submissions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` int(11) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `phone_number` varchar(50) DEFAULT NULL,
  `time_zone` varchar(100) DEFAULT NULL,
  `onsite_contact_info` text DEFAULT NULL,
  `project_types` text DEFAULT NULL,
  `project_type_other` text DEFAULT NULL,
  `brief_overview` text DEFAULT NULL,
  `num_people_attending` varchar(100) DEFAULT NULL,
  `event_date` date DEFAULT NULL,
  `additional_dates` text DEFAULT NULL,
  `event_agenda` text DEFAULT NULL,
  `service_times` varchar(255) DEFAULT NULL,
  `location_address` text DEFAULT NULL,
  `google_maps_link` text DEFAULT NULL,
  `location_specification` text DEFAULT NULL,
  `location_scouting_refs` text DEFAULT NULL,
  `shot_list` text DEFAULT NULL,
  `visual_references` text DEFAULT NULL,
  `specific_instructions` text DEFAULT NULL,
  `creative_dress_code` varchar(255) DEFAULT NULL,
  `post_production_ideas` text DEFAULT NULL,
  `preferred_songs` text DEFAULT NULL,
  `additional_info` text DEFAULT NULL,
  `wants_to_learn_more` tinyint(1) DEFAULT 0,
  `form_user_friendliness_rating` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `project_form_submissions`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `project_form_submissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `project_form_submissions` ADD `is_active` INT NOT NULL DEFAULT '1' AFTER `form_user_friendliness_rating`, ADD `created_by` INT NULL DEFAULT NULL AFTER `is_active`;

ALTER TABLE `project_form_submissions`
  DROP `email`,
  DROP `full_name`,
  DROP `phone_number`,
  DROP `time_zone`,
  DROP `event_date`,
  DROP `additional_dates`,
  DROP `service_times`,
  DROP `google_maps_link`;

-- generate affiliate records with referral codes for active users missing affiliates
INSERT INTO affiliates (user_id, referral_code, status, created_at, updated_at)
SELECT 
    u.id,
    UPPER(SUBSTRING(MD5(RAND()),1,6)),
    'active',
    NOW(),
    NOW()
FROM users u
LEFT JOIN affiliates a ON a.user_id = u.id
WHERE a.user_id IS NULL
AND u.is_active = 1;

-- 16-03-26

ALTER TABLE `sales_leads` ADD `created_from` TINYINT NULL DEFAULT NULL COMMENT '1=Web, 2=App' AFTER `intent_updated_at`;
ALTER TABLE `users` ADD `created_from` TINYINT NULL DEFAULT NULL COMMENT '1=Web, 2=App';
ALTER TABLE `crew_members` ADD `created_from` TINYINT NULL DEFAULT NULL COMMENT '1=Web, 2=App';
ALTER TABLE `sales_lead_activities` CHANGE `activity_data` `activity_data` JSON NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS client_leads (
  lead_id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NULL,
  user_id INT NULL,
  guest_email VARCHAR(255) NULL,
  client_name VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  lead_type ENUM('self_serve', 'sales_assisted') NOT NULL,
  lead_status VARCHAR(100) NOT NULL DEFAULT 'in_progress_self_serve',
  intent ENUM('Hot', 'Warm', 'Cold') NULL,
  lead_source VARCHAR(50) NULL,
  assigned_sales_rep_id INT NULL,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  contacted_sales_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  intent_updated_by INT NULL,
  intent_updated_at TIMESTAMP NULL,
  created_from INT NULL,
  INDEX idx_client_lead_status (lead_status),
  INDEX idx_client_assigned_rep (assigned_sales_rep_id),
  INDEX idx_client_booking (booking_id),
  INDEX idx_client_last_activity (last_activity_at),
  INDEX idx_client_lead_type (lead_type),
  INDEX idx_client_user_id (user_id),
  CONSTRAINT fk_client_leads_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE SET NULL,
  CONSTRAINT fk_client_leads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_client_leads_assigned_rep FOREIGN KEY (assigned_sales_rep_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `client_leads` CHANGE `created_from` `created_from` INT(11) NULL DEFAULT NULL COMMENT '1=Web, 2=App';

CREATE TABLE IF NOT EXISTS client_lead_activities (
  activity_id INT PRIMARY KEY AUTO_INCREMENT,
  lead_id INT NOT NULL,
  activity_type ENUM('created', 'booking_updated', 'status_changed', 'assigned', 'contacted_sales', 'payment_link_generated', 'discount_code_generated', 'payment_link_opened', 'discount_applied', 'payment_completed') NOT NULL,
  activity_data JSON NULL,
  performed_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client_lead_activity_lead (lead_id),
  INDEX idx_client_lead_activity_type (activity_type),
  INDEX idx_client_lead_activity_created_at (created_at),
  CONSTRAINT fk_client_lead_activities_lead FOREIGN KEY (lead_id) REFERENCES client_leads(lead_id) ON DELETE CASCADE,
  CONSTRAINT fk_client_lead_activities_performed_by FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE sales_lead_activities
MODIFY COLUMN activity_type ENUM(
  'created',
  'booking_updated',
  'status_changed',
  'assigned',
  'contacted_sales',
  'payment_link_generated',
  'discount_code_generated',
  'payment_link_opened',
  'discount_applied',
  'payment_completed',
  'intent_updated'
) NOT NULL;

ALTER TABLE client_lead_activities
MODIFY COLUMN activity_type ENUM(
  'created',
  'booking_updated',
  'status_changed',
  'assigned',
  'contacted_sales',
  'payment_link_generated',
  'discount_code_generated',
  'payment_link_opened',
  'discount_applied',
  'payment_completed',
  'intent_updated'
) NOT NULL;

ALTER TABLE `client_leads` CHANGE `lead_status` `lead_status` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'in_progress_self_serve';

-- 17-03-26

ALTER TABLE discount_codes
ADD COLUMN client_lead_id INT NULL AFTER lead_id,
ADD INDEX idx_client_lead (client_lead_id),
ADD CONSTRAINT fk_discount_codes_client_lead
  FOREIGN KEY (client_lead_id) REFERENCES client_leads(lead_id) ON DELETE SET NULL;

ALTER TABLE payment_links
ADD COLUMN client_lead_id INT NULL AFTER lead_id,
ADD INDEX idx_client_lead (client_lead_id),
ADD CONSTRAINT fk_payment_links_client_lead
  FOREIGN KEY (client_lead_id) REFERENCES client_leads(lead_id) ON DELETE SET NULL;

-- 18-03-26
UPDATE client_leads
SET intent = 'Hot'
WHERE booking_id IS NULL
  AND lead_status = 'signed_up';

-- 19-03-26

ALTER TABLE `crew_members` ADD `user_id` INT NULL AFTER `crew_member_id`;

-- 20-03-26
-- 1. QUOTE CATALOG ITEMS
CREATE TABLE `quote_catalog_items` (
  `catalog_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `section_type` enum('service','addon','logistics') NOT NULL,
  `pricing_mode` enum('general','wedding','both') NOT NULL DEFAULT 'both',
  `name` varchar(255) NOT NULL,
  `default_rate` decimal(10,2) DEFAULT NULL,
  `rate_type` enum('flat','per_hour','per_day','per_unit') NOT NULL DEFAULT 'flat',
  `rate_unit` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_by_user_id` int(11) DEFAULT NULL,
  `updated_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`catalog_item_id`),
  KEY `idx_quote_catalog_section` (`section_type`,`pricing_mode`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. INSERT CATALOG DATA
INSERT INTO `quote_catalog_items`
(`section_type`, `pricing_mode`, `name`, `default_rate`, `rate_type`, `rate_unit`, `is_active`, `display_order`)
VALUES
('service', 'both', 'Videography', 250.00, 'per_hour', 'per hour', 1, 1),
('service', 'both', 'Photography', 250.00, 'per_hour', 'per hour', 1, 2),
('service', 'both', 'AI Editing', 500.00, 'per_hour', 'per hour', 1, 3),
('service', 'both', 'Livestream Production', 250.00, 'per_hour', 'per hour', 1, 4),
('service', 'both', 'Location', 250.00, 'per_hour', 'per hour', 1, 5),

('addon', 'both', '4K Camera Upgrade', 500.00, 'flat', NULL, 1, 1),
('addon', 'both', 'Drone Footage', 800.00, 'flat', NULL, 1, 2),
('addon', 'both', 'Additional Crew Member', 300.00, 'flat', NULL, 1, 3),
('addon', 'both', 'Lighting Package', 600.00, 'flat', NULL, 1, 4),
('addon', 'both', 'Audio Recording Kit', 400.00, 'flat', NULL, 1, 5),
('addon', 'both', 'Green Screen Setup', 600.00, 'flat', NULL, 1, 6),
('addon', 'both', 'Teleprompter', 200.00, 'flat', NULL, 1, 7),
('addon', 'both', 'Hair and Makeup Artist', 450.00, 'flat', NULL, 1, 8),

('logistics', 'both', 'Travel and Transportation', 500.00, 'flat', NULL, 1, 1),
('logistics', 'both', 'Equipment Rental', 800.00, 'flat', NULL, 1, 2),
('logistics', 'both', 'Studio Rental', 1200.00, 'flat', NULL, 1, 3),
('logistics', 'both', 'Permits and Licenses', 300.00, 'flat', NULL, 1, 4);

-- 3. SALES QUOTES
CREATE TABLE `sales_quotes` (
  `sales_quote_id` int(11) NOT NULL AUTO_INCREMENT,
  `quote_number` varchar(50) NOT NULL,
  `lead_id` int(11) DEFAULT NULL,
  `client_user_id` int(11) DEFAULT NULL,
  `created_by_user_id` int(11) NOT NULL,
  `assigned_sales_rep_id` int(11) DEFAULT NULL,
  `pricing_mode` enum('general','wedding','both') NOT NULL DEFAULT 'general',
  `status` enum('draft','sent','viewed','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
  `client_name` varchar(255) NOT NULL,
  `client_email` varchar(255) DEFAULT NULL,
  `client_phone` varchar(50) DEFAULT NULL,
  `client_address` text DEFAULT NULL,
  `project_description` text DEFAULT NULL,
  `video_shoot_type` varchar(255) DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `quote_validity_days` int(11) DEFAULT NULL,
  `discount_type` enum('none','percentage','fixed_amount') NOT NULL DEFAULT 'none',
  `discount_value` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tax_type` varchar(100) DEFAULT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `terms_conditions` text DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `viewed_at` datetime DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`sales_quote_id`),
  UNIQUE KEY `quote_number` (`quote_number`),
  KEY `idx_sales_quotes_owner` (`assigned_sales_rep_id`,`status`),
  KEY `idx_sales_quotes_client` (`client_user_id`),
  CONSTRAINT `sales_quotes_ibfk_1` FOREIGN KEY (`client_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_quotes_ibfk_2` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_quotes_ibfk_3` FOREIGN KEY (`assigned_sales_rep_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. LINE ITEMS (CLEANED)
CREATE TABLE `sales_quote_line_items` (
  `line_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `sales_quote_id` int(11) NOT NULL,
  `catalog_item_id` int(11) DEFAULT NULL,
  `source_type` enum('catalog','custom') NOT NULL DEFAULT 'catalog',
  `section_type` enum('service','addon','logistics','custom') NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `rate_type` enum('flat','per_hour','per_day','per_unit') NOT NULL DEFAULT 'flat',
  `rate_unit` varchar(50) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `duration_hours` decimal(10,2) DEFAULT NULL,
  `crew_size` int(11) DEFAULT NULL,
  `estimated_pricing` decimal(10,2) DEFAULT NULL,
  `unit_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `configuration_json` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`line_item_id`),
  KEY `idx_sales_quote_line_items_quote` (`sales_quote_id`,`section_type`),
  CONSTRAINT `sales_quote_line_items_ibfk_1` FOREIGN KEY (`sales_quote_id`) REFERENCES `sales_quotes` (`sales_quote_id`) ON DELETE CASCADE,
  CONSTRAINT `sales_quote_line_items_ibfk_2` FOREIGN KEY (`catalog_item_id`) REFERENCES `quote_catalog_items` (`catalog_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5. ACTIVITIES
CREATE TABLE `sales_quote_activities` (
  `activity_id` int(11) NOT NULL AUTO_INCREMENT,
  `sales_quote_id` int(11) NOT NULL,
  `activity_type` enum('created','updated','status_changed','sent','viewed','accepted','rejected') NOT NULL,
  `performed_by_user_id` int(11) DEFAULT NULL,
  `message` varchar(255) DEFAULT NULL,
  `metadata_json` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`activity_id`),
  KEY `idx_sales_quote_activities_quote` (`sales_quote_id`,`created_at`),
  CONSTRAINT `sales_quote_activities_ibfk_1` FOREIGN KEY (`sales_quote_id`) REFERENCES `sales_quotes` (`sales_quote_id`) ON DELETE CASCADE,
  CONSTRAINT `sales_quote_activities_ibfk_2` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE users ADD location VARCHAR(255), ADD latitude DECIMAL(10,8), ADD longitude DECIMAL(11,8);

-- 24-03-26

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS `shoot_types` (
  `shoot_type_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `content_type` tinyint(4) NOT NULL COMMENT 'Legacy field before catalog-item mapping',
  `display_order` int(11) NOT NULL DEFAULT 0,
  `image_url` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `tags` text DEFAULT NULL,
  `edited_photos_note` varchar(255) DEFAULT NULL,
  `is_active` tinyint(4) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`shoot_type_id`),
  
  -- 👇 important: prevent duplicate logical data
  UNIQUE KEY unique_shoot (`name`, `content_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `shoot_types`
(`shoot_type_id`, `name`, `content_type`, `display_order`, `image_url`, `description`, `tags`, `edited_photos_note`, `is_active`, `created_at`)
VALUES
(1, 'Wedding', 1, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', NULL, 1, '2026-01-13 19:18:07'),
(2, 'Social Content', 1, 5, 'shoot-types/social-content.jpg', NULL, '[\"Reels\", \"TikToks\", \"Youtube\"]', NULL, 1, '2026-01-13 19:18:07'),
(3, 'Short Films & Narrative', 1, 8, 'shoot-types/short-films-narrative.png', NULL, '[\"Scripted\", \"Cinematic stories\"]', NULL, 1, '2026-01-13 19:18:07'),
(4, 'Private Event', 1, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', NULL, 1, '2026-01-13 19:18:07'),
(5, 'Podcasts & Shows', 1, 6, 'shoot-types/podcasts-shows.jpg', NULL, '[\"Video podcasts\", \"livestreams\"]', NULL, 1, '2026-01-13 19:18:07'),
(6, 'Music Videos', 1, 7, 'shoot-types/music-videos.jpg', NULL, '[\"Artists-led productions\"]', NULL, 1, '2026-01-13 19:18:07'),
(7, 'Corporate Event', 1, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', NULL, 1, '2026-01-13 19:18:07'),
(8, 'Commercial & Advertising', 1, 4, 'shoot-types/commercial-advertising.png', NULL, '[\"Brand ads\", \"Promos\", \"Campaigns\"]', NULL, 1, '2026-01-13 19:18:07'),

(9, 'Wedding', 2, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(10, 'Social Content', 2, 5, 'shoot-types/social-content.jpg', NULL, '[\"Instagram, Linkedin etc\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(11, 'Private Event', 2, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(12, 'People & Teams', 2, 6, 'shoot-types/people-teams.jpg', NULL, '[\"Headshots\", \"team photos\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(13, 'Corporate Event', 2, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(14, 'Brand & Product', 2, 4, 'shoot-types/brand-product.png', NULL, '[\"Product photography\", \"campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(15, 'Behind-the-Scenes', 2, 7, 'shoot-types/behind-the-scenes.jpg', NULL, '[\"Candid shots, process\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),

(16, 'Wedding', 3, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(17, 'Social Content', 3, 4, 'shoot-types/social-content.jpg', NULL, '[\"Reels\", \"TikToks\", \"Youtube\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(18, 'Private Event', 3, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(19, 'Music Videos', 3, 5, 'shoot-types/music-videos.jpg', NULL, '[\"Artists-led productions\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(20, 'Corporate Event', 3, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(21, 'Commercial & Advertising', 3, 7, 'shoot-types/commercial-advertising.png', NULL, '[\"Brand ads\", \"Promos\", \"Campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(22, 'Brand & Product', 3, 6, 'shoot-types/brand-product.png', NULL, '[\"Product photography\", \"campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(23, 'Behind-the-Scenes', 3, 8, 'shoot-types/behind-the-scenes.jpg', NULL, '[\"Candid shots\", \"process\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07');

--- 25-03-26 ---

CREATE TABLE IF NOT EXISTS `sales_shoot_types` (
  `sales_shoot_type_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `content_type` tinyint(4) NOT NULL COMMENT '1=videography,2=photography,3=both',
  `display_order` int(11) NOT NULL DEFAULT 0,
  `image_url` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `tags` text DEFAULT NULL,
  `edited_photos_note` varchar(255) DEFAULT NULL,
  `is_active` tinyint(4) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`sales_shoot_type_id`),
  UNIQUE KEY unique_shoot (`name`, `content_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `sales_shoot_types`
(`sales_shoot_type_id`, `name`, `content_type`, `display_order`, `image_url`, `description`, `tags`, `edited_photos_note`, `is_active`, `created_at`)
VALUES
(1, 'Wedding', 1, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', NULL, 1, '2026-01-13 19:18:07'),
(2, 'Social Content', 1, 5, 'shoot-types/social-content.jpg', NULL, '[\"Reels\", \"TikToks\", \"Youtube\"]', NULL, 1, '2026-01-13 19:18:07'),
(3, 'Short Films & Narrative', 1, 8, 'shoot-types/short-films-narrative.png', NULL, '[\"Scripted\", \"Cinematic stories\"]', NULL, 1, '2026-01-13 19:18:07'),
(4, 'Private Event', 1, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', NULL, 1, '2026-01-13 19:18:07'),
(5, 'Podcasts & Shows', 1, 6, 'shoot-types/podcasts-shows.jpg', NULL, '[\"Video podcasts\", \"livestreams\"]', NULL, 1, '2026-01-13 19:18:07'),
(6, 'Music Videos', 1, 7, 'shoot-types/music-videos.jpg', NULL, '[\"Artists-led productions\"]', NULL, 1, '2026-01-13 19:18:07'),
(7, 'Corporate Event', 1, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', NULL, 1, '2026-01-13 19:18:07'),
(8, 'Commercial & Advertising', 1, 4, 'shoot-types/commercial-advertising.png', NULL, '[\"Brand ads\", \"Promos\", \"Campaigns\"]', NULL, 1, '2026-01-13 19:18:07'),

(9, 'Wedding', 2, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(10, 'Social Content', 2, 5, 'shoot-types/social-content.jpg', NULL, '[\"Instagram, Linkedin etc\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(11, 'Private Event', 2, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(12, 'People & Teams', 2, 6, 'shoot-types/people-teams.jpg', NULL, '[\"Headshots\", \"team photos\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(13, 'Corporate Event', 2, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(14, 'Brand & Product', 2, 4, 'shoot-types/brand-product.png', NULL, '[\"Product photography\", \"campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(15, 'Behind-the-Scenes', 2, 7, 'shoot-types/behind-the-scenes.jpg', NULL, '[\"Candid shots, process\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),

(16, 'Wedding', 3, 2, 'shoot-types/wedding.jpg', NULL, '[\"Ceremony and reception\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(17, 'Social Content', 3, 4, 'shoot-types/social-content.jpg', NULL, '[\"Reels\", \"TikToks\", \"Youtube\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(18, 'Private Event', 3, 3, 'shoot-types/private-event.jpg', NULL, '[\"Parties\", \"celebrations\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(19, 'Music Videos', 3, 5, 'shoot-types/music-videos.jpg', NULL, '[\"Artists-led productions\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(20, 'Corporate Event', 3, 1, 'shoot-types/corporate-event.jpg', NULL, '[\"Conferences\", \"summits\", \"company offsites\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(21, 'Commercial & Advertising', 3, 7, 'shoot-types/commercial-advertising.png', NULL, '[\"Brand ads\", \"Promos\", \"Campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(22, 'Brand & Product', 3, 6, 'shoot-types/brand-product.png', NULL, '[\"Product photography\", \"campaigns\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07'),
(23, 'Behind-the-Scenes', 3, 8, 'shoot-types/behind-the-scenes.jpg', NULL, '[\"Candid shots\", \"process\"]', 'Generally photos include 25 edited photos per hour for non-weddings.', 1, '2026-01-13 19:18:07');

ALTER TABLE `quote_catalog_items` ADD COLUMN `is_system_default` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_active`;
UPDATE `quote_catalog_items` SET `is_system_default` = 1 WHERE `created_by_user_id` IS NULL;

-- 26-03-26

ALTER TABLE `sales_shoot_types` ADD COLUMN `is_system_default` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_active`;
UPDATE `sales_shoot_types`
SET `is_system_default` = 1
WHERE `sales_shoot_type_id` IN (
  1, 2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23
);

ALTER TABLE `sales_quote_line_items`
ADD COLUMN `is_active` tinyint(1) NOT NULL DEFAULT 1 AFTER `sort_order`;

-- 27-06-26

CREATE TABLE IF NOT EXISTS `projects` (
  `project_id` int(11) NOT NULL AUTO_INCREMENT,
  `booking_id` int(11) NOT NULL COMMENT 'FK to stream_project_booking',
  `project_code` varchar(50) NOT NULL COMMENT 'Unique identifier like PRJ-2026-001',
  `project_name` varchar(255) NOT NULL,
  `current_state` enum(
    'RAW_UPLOADED',
    'RAW_TECH_QC_PENDING',
    'RAW_TECH_QC_REJECTED',
    'RAW_TECH_QC_APPROVED',
    'COVERAGE_REVIEW_PENDING',
    'COVERAGE_REJECTED',
    'EDIT_APPROVAL_PENDING',
    'EDIT_IN_PROGRESS',
    'INTERNAL_EDIT_REVIEW_PENDING',
    'CLIENT_PREVIEW_READY',
    'CLIENT_FEEDBACK_RECEIVED',
    'FEEDBACK_INTERNAL_REVIEW',
    'REVISION_IN_PROGRESS',
    'REVISION_QC_PENDING',
    'FINAL_EXPORT_PENDING',
    'READY_FOR_DELIVERY',
    'DELIVERED',
    'PROJECT_CLOSED'
  ) NOT NULL DEFAULT 'RAW_UPLOADED',
  `state_changed_at` timestamp NULL DEFAULT NULL,
  `client_user_id` int(11) NOT NULL COMMENT 'FK to users - client who owns this project',
  `assigned_creator_id` int(11) DEFAULT NULL COMMENT 'FK to users - assigned creator/videographer',
  `assigned_editor_id` int(11) DEFAULT NULL COMMENT 'FK to users - assigned editor',
  `assigned_qc_id` int(11) DEFAULT NULL COMMENT 'FK to users - assigned QC reviewer',
  `raw_upload_deadline` datetime DEFAULT NULL,
  `edit_delivery_deadline` datetime DEFAULT NULL,
  `final_delivery_deadline` datetime DEFAULT NULL,
  `project_notes` text DEFAULT NULL COMMENT 'Internal admin notes',
  `client_requirements` text DEFAULT NULL COMMENT 'Client-provided requirements from booking',
  `total_raw_size_bytes` bigint(20) DEFAULT 0 COMMENT 'Total size of RAW footage uploaded',
  `total_files_count` int(11) DEFAULT 0 COMMENT 'Total number of files in project',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`project_id`),
  UNIQUE KEY `project_code` (`project_code`),

  KEY `idx_projects_booking` (`booking_id`),
  KEY `idx_projects_client` (`client_user_id`),
  KEY `idx_projects_current_state` (`current_state`),
  KEY `idx_projects_creator` (`assigned_creator_id`),
  KEY `idx_projects_editor` (`assigned_editor_id`),
  KEY `idx_projects_qc` (`assigned_qc_id`),
  KEY `idx_projects_state_changed` (`state_changed_at`),
  KEY `idx_projects_created_at` (`created_at`),

  CONSTRAINT `projects_ibfk_1`
    FOREIGN KEY (`booking_id`)
    REFERENCES `stream_project_booking` (`stream_project_booking_id`),

  CONSTRAINT `projects_ibfk_2`
    FOREIGN KEY (`client_user_id`)
    REFERENCES `users` (`id`),

  CONSTRAINT `projects_ibfk_3`
    FOREIGN KEY (`assigned_creator_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL,

  CONSTRAINT `projects_ibfk_4`
    FOREIGN KEY (`assigned_editor_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL,

  CONSTRAINT `projects_ibfk_5`
    FOREIGN KEY (`assigned_qc_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL

) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `project_files` (
  `file_id` int(11) NOT NULL AUTO_INCREMENT,
  `project_id` int(11) NOT NULL COMMENT 'FK to projects',

  `file_category` enum(
    'RAW_FOOTAGE',
    'RAW_AUDIO',
    'EDIT_DRAFT',
    'EDIT_REVISION',
    'EDIT_FINAL',
    'CLIENT_DELIVERABLE',
    'THUMBNAIL',
    'REFERENCE_MATERIAL'
  ) NOT NULL,

  `file_name` varchar(500) NOT NULL,
  `file_path` varchar(1000) NOT NULL COMMENT 'S3 path: raw-footage/{project_id}/{filename}',
  `file_size_bytes` bigint(20) NOT NULL,
  `file_extension` varchar(20) NOT NULL,
  `mime_type` varchar(100) DEFAULT NULL,

  `upload_status` enum('PENDING','IN_PROGRESS','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `upload_progress` int(11) DEFAULT 0 COMMENT 'Percentage 0-100',
  `upload_session_id` varchar(100) DEFAULT NULL COMMENT 'For chunked uploads',
  `uploaded_by_user_id` int(11) DEFAULT NULL COMMENT 'FK to users - who uploaded this file',

  `validation_status` enum('PENDING','PASSED','FAILED') DEFAULT 'PENDING',
  `validation_errors` text DEFAULT NULL COMMENT 'JSON array of validation issues',

  -- Video metadata
  `video_duration_seconds` int(11) DEFAULT NULL,
  `video_resolution` varchar(20) DEFAULT NULL,
  `video_fps` decimal(5,2) DEFAULT NULL,
  `video_codec` varchar(50) DEFAULT NULL,
  `video_bitrate_kbps` int(11) DEFAULT NULL,

  -- Audio metadata
  `audio_codec` varchar(50) DEFAULT NULL,
  `audio_sample_rate` int(11) DEFAULT NULL,
  `audio_channels` int(11) DEFAULT NULL,

  -- Versioning
  `version_number` int(11) DEFAULT 1,
  `replaces_file_id` int(11) DEFAULT NULL,

  -- Hashing & storage
  `md5_hash` varchar(32) DEFAULT NULL,
  `sha256_hash` varchar(64) DEFAULT NULL,
  `s3_bucket` varchar(100) DEFAULT NULL,
  `s3_region` varchar(50) DEFAULT NULL,
  `s3_etag` varchar(100) DEFAULT NULL,

  -- Soft delete
  `is_deleted` tinyint(1) DEFAULT 0,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by_user_id` int(11) DEFAULT NULL,

  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`file_id`),

  -- Indexes
  KEY `idx_project_files_project` (`project_id`),
  KEY `idx_project_files_category` (`file_category`),
  KEY `idx_project_files_upload_status` (`upload_status`),
  KEY `idx_project_files_validation` (`validation_status`),
  KEY `idx_project_files_session` (`upload_session_id`),
  KEY `idx_project_files_uploaded_by` (`uploaded_by_user_id`),
  KEY `idx_project_files_deleted` (`is_deleted`),
  KEY `idx_project_files_created_at` (`created_at`),
  KEY `idx_project_files_replaces` (`replaces_file_id`),
  KEY `idx_project_files_deleted_by` (`deleted_by_user_id`),

  -- Constraints
  CONSTRAINT `project_files_ibfk_1`
    FOREIGN KEY (`project_id`)
    REFERENCES `projects` (`project_id`)
    ON DELETE CASCADE,

  CONSTRAINT `project_files_ibfk_2`
    FOREIGN KEY (`uploaded_by_user_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL,

  CONSTRAINT `project_files_ibfk_3`
    FOREIGN KEY (`replaces_file_id`)
    REFERENCES `project_files` (`file_id`)
    ON DELETE SET NULL,

  CONSTRAINT `project_files_ibfk_4`
    FOREIGN KEY (`deleted_by_user_id`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- 30-03-26

ALTER TABLE `sales_quotes` MODIFY COLUMN `status` ENUM('draft','pending','sent','viewed','accepted','rejected','expired') NOT NULL DEFAULT 'draft';

-- 01-04-26

-- IGNORE ERR IF INDEX DOES NOT EXISTS
ALTER TABLE users DROP INDEX email;

-- 02-04-26

INSERT INTO `user_type` (`user_type_id`, `user_role`, `is_active`) VALUES (NULL, 'sales_admin', '1');

-- 02-04-26
-- Align sales_shoot_types.content_type with quote_catalog_items.catalog_item_id
ALTER TABLE `sales_shoot_types`
  MODIFY `content_type` int(11) NOT NULL COMMENT 'References quote_catalog_items.catalog_item_id for service items';

-- Legacy content_type=3 meant "both". Deactivate those rows before enforcing catalog-item mapping.
UPDATE `sales_shoot_types`
SET `is_active` = 0
WHERE `content_type` = 3;

ALTER TABLE `sales_shoot_types`
  ADD CONSTRAINT `fk_sales_shoot_types_catalog_item`
  FOREIGN KEY (`content_type`) REFERENCES `quote_catalog_items` (`catalog_item_id`);

-- 03-04-26

ALTER TABLE `sales_leads`
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `updated_at`,
  ADD INDEX `idx_sales_leads_is_active` (`is_active`);

ALTER TABLE `client_leads`
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `updated_at`,
  ADD INDEX `idx_client_leads_is_active` (`is_active`);

CREATE TABLE IF NOT EXISTS `sales_ai_editing_types` (
  `sales_ai_editing_type_id` int NOT NULL AUTO_INCREMENT,
  `category` enum('video','photo') NOT NULL,
  `type_key` varchar(100) NOT NULL,
  `label` varchar(255) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `display_order` int NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_system_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_user_id` int DEFAULT NULL,
  `updated_by_user_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sales_ai_editing_type_id`),
  UNIQUE KEY `uniq_sales_ai_editing_type_key` (`type_key`),
  UNIQUE KEY `uniq_sales_ai_editing_type_label` (`category`,`label`),
  KEY `idx_sales_ai_editing_types_active` (`category`,`is_active`,`display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `sales_ai_editing_types`
(`sales_ai_editing_type_id`, `category`, `type_key`, `label`, `note`, `display_order`, `is_active`, `is_system_default`, `created_at`, `updated_at`)
VALUES
(1, 'video', 'social_reel_15_30', 'Social Media Reel (15 sec-30 sec)', NULL, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 'video', 'social_reel_30_90', 'Social Media Reel (30 sec-90 sec)', NULL, 2, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(3, 'video', 'mini_highlight_1_2', 'Mini Highlight Video (1-2 mins)', NULL, 3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(4, 'video', 'highlight_4_7', 'Highlight Video (4-7 min)', NULL, 4, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(5, 'video', 'feature_30_40', 'Feature Video (30-40 min)', NULL, 5, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(6, 'video', 'commercial_2_4', 'Commercial (2 min-4 min)', NULL, 6, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(7, 'video', 'commercial_4_10', 'Commercial (4 min-10 min)', NULL, 7, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(8, 'video', 'social_reel_2_4', 'Social Media Reel (2 min-4 min)', NULL, 8, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(9, 'video', 'full_podcast_15_30', 'Full Length Podcast (15 min-30 min)', NULL, 9, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(10, 'video', 'full_podcast_30_60', 'Longer Full Length Podcast (30 min-60 min)', NULL, 10, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(11, 'video', 'music_video_2_3', 'Edited Music Video (2-3 min)', NULL, 11, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(12, 'video', 'music_video_vfx_2_3', 'Edited Music Video with VFX (2-3 min)', NULL, 12, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(13, 'video', 'short_film_2_5', 'Edited Short Film (2 Min-5 Min)', NULL, 13, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(14, 'video', 'short_film_5_10', 'Edited Short Film (5 Min-10 Min)', NULL, 14, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(15, 'photo', 'edited_photos', 'Edited Photos', 'Edited Photos', 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 06-04-26

ALTER TABLE `sales_quotes` MODIFY COLUMN `status` ENUM('draft','pending','sent','viewed','accepted','paid','rejected','expired') NOT NULL DEFAULT 'draft';

ALTER TABLE `quotes`
  ADD COLUMN `tax_type` VARCHAR(100) NULL AFTER `discount_amount`,
  ADD COLUMN `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER `tax_type`,
  ADD COLUMN `tax_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `tax_rate`;

-- 08-04-26

DELETE FROM sales_ai_editing_types WHERE sales_ai_editing_type_id BETWEEN 6 AND 14;

-- 09-04-26

CREATE TABLE IF NOT EXISTS `invoice_send_history` (
  `invoice_send_history_id` INT NOT NULL AUTO_INCREMENT,
  `booking_id` INT NOT NULL,
  `quote_id` INT NULL,
  `lead_id` INT NULL,
  `client_lead_id` INT NULL,
  `assigned_sales_rep_id` INT NULL,
  `client_name` VARCHAR(255) NULL,
  `client_email` VARCHAR(255) NULL,
  `invoice_number` VARCHAR(100) NULL,
  `invoice_url` TEXT NULL,
  `invoice_pdf` TEXT NULL,
  `payment_status` ENUM('paid', 'pending') NOT NULL DEFAULT 'pending',
  `sent_by_user_id` INT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`invoice_send_history_id`),
  KEY `idx_invoice_send_history_booking` (`booking_id`),
  KEY `idx_invoice_send_history_quote` (`quote_id`),
  KEY `idx_invoice_send_history_lead` (`lead_id`),
  KEY `idx_invoice_send_history_client_lead` (`client_lead_id`),
  KEY `idx_invoice_send_history_assigned_rep` (`assigned_sales_rep_id`),
  KEY `idx_invoice_send_history_payment_status` (`payment_status`),
  KEY `idx_invoice_send_history_sent_at` (`sent_at`)
);

-- 13-04-26

CREATE TABLE IF NOT EXISTS `sales_rep_availability` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sales_rep_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `availability_status` TINYINT NOT NULL COMMENT '1 = available, 2 = unavailable',
  `start_time` TIME NULL,
  `end_time` TIME NULL,
  `location` VARCHAR(255) NULL,
  `recurrence` TINYINT NULL DEFAULT 1 COMMENT '1=none,2=daily,3=weekly,4=monthly',
  `notes` TEXT NULL,
  `is_full_day` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `recurrence_until` DATE NULL,
  `recurrence_days` TEXT NULL,
  `recurrence_day_of_month` INT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sales_rep_availability_rep_id` (`sales_rep_id`),
  KEY `idx_sales_rep_availability_rep_date` (`sales_rep_id`, `date`),
  CONSTRAINT `fk_sales_rep_availability_user`
    FOREIGN KEY (`sales_rep_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `sales_rep_live_status` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sales_rep_id` INT NOT NULL,
  `is_available` TINYINT NOT NULL DEFAULT 1 COMMENT '1 = available/on, 0 = unavailable/off',
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sales_rep_live_status_rep` (`sales_rep_id`),
  CONSTRAINT `fk_sales_rep_live_status_user`
    FOREIGN KEY (`sales_rep_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
);

-- 14-04-26

CREATE TABLE IF NOT EXISTS `sales_rep_status_activity` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sales_rep_id` INT NOT NULL,
  `is_available` TINYINT NOT NULL COMMENT '1 = available/on, 0 = unavailable/off',
  `reason` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sales_rep_status_activity_rep_id` (`sales_rep_id`),
  KEY `idx_sales_rep_status_activity_created_at` (`created_at`),
  CONSTRAINT `fk_sales_rep_status_activity_user`
    FOREIGN KEY (`sales_rep_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
);

ALTER TABLE crew_members ADD COLUMN old_location TEXT NULL AFTER location;

-- 15-04-26

ALTER TABLE stream_project_booking ADD COLUMN estimated_delivery_date DATE NULL AFTER event_date;

--16-04-26

ALTER TABLE `clients` CHANGE `user_id` `user_id` INT(11) NULL;

-- 21-04-26

ALTER TABLE sales_quotes
MODIFY COLUMN status ENUM(
  'draft',
  'pending',
  'partially_paid',
  'sent',
  'viewed',
  'accepted',
  'paid',
  'rejected',
  'expired'
) NOT NULL DEFAULT 'draft';

ALTER TABLE sales_quotes
ADD COLUMN client_id INT NULL AFTER client_user_id,
ADD CONSTRAINT sales_quotes_ibfk_client
  FOREIGN KEY (client_id) REFERENCES clients(client_id),
ADD INDEX idx_sales_quotes_client_ref (client_id, client_user_id);


-- 20-4-26

CREATE TABLE `signatures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quote_id` int(11) NOT NULL,
  `signer_name` varchar(255) NOT NULL,
  `signer_email` varchar(255) DEFAULT NULL,
  `signature_base64` longtext NOT NULL,
  `pdf_path` varchar(500) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'signed',
  `signed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;