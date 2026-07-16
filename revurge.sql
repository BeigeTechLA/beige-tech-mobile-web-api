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

-- 22-04-26

CREATE TABLE `account_credit_ledger` (
  `account_credit_ledger_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `guest_email` VARCHAR(255) NULL,
  `booking_id` INT NULL,
  `sales_quote_id` INT NULL,
  `sales_quote_activity_id` INT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `entry_type` ENUM('credit_created', 'credit_used', 'credit_reversed') NOT NULL DEFAULT 'credit_created',
  `status` ENUM('pending', 'available', 'used', 'reversed', 'expired') NOT NULL DEFAULT 'pending',
  `source` ENUM('quote_reduction', 'manual_admin', 'payment_adjustment') NOT NULL DEFAULT 'quote_reduction',
  `notes` TEXT NULL,
  `created_by_user_id` INT NULL,
  `approved_by_user_id` INT NULL,
  `approved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_credit_ledger_id`),
  KEY `idx_account_credit_user` (`user_id`),
  KEY `idx_account_credit_guest_email` (`guest_email`),
  KEY `idx_account_credit_booking` (`booking_id`),
  KEY `idx_account_credit_quote` (`sales_quote_id`),
  KEY `idx_account_credit_status` (`status`),
  UNIQUE KEY `uniq_account_credit_source_activity` (`sales_quote_activity_id`, `entry_type`),
  CONSTRAINT `fk_account_credit_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_account_credit_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `stream_project_booking` (`stream_project_booking_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_account_credit_sales_quote`
    FOREIGN KEY (`sales_quote_id`) REFERENCES `sales_quotes` (`sales_quote_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_account_credit_sales_quote_activity`
    FOREIGN KEY (`sales_quote_activity_id`) REFERENCES `sales_quote_activities` (`activity_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_account_credit_created_by`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_account_credit_approved_by`
    FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 24-04-26

ALTER TABLE `stream_project_booking`
  ADD COLUMN `event_latitude` DECIMAL(10,8) NULL AFTER `event_location`,
  ADD COLUMN `event_longitude` DECIMAL(11,8) NULL AFTER `event_latitude`;

ALTER TABLE `crew_members`
  ADD COLUMN `latitude` DECIMAL(10,8) NULL AFTER `old_location`,
  ADD COLUMN `longitude` DECIMAL(11,8) NULL AFTER `latitude`;

  --25-04-26
  --25-04-26

ALTER TABLE stream_project_booking ADD COLUMN time_zone VARCHAR(64) NULL AFTER end_time;

-- 27-04-26

CREATE TABLE IF NOT EXISTS chat_room_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id VARCHAR(191) NOT NULL,
  booking_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_room_mappings_room_id (room_id),
  KEY idx_chat_room_mappings_booking_id (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 28-04-26

ALTER TABLE `sales_quote_activities`
MODIFY COLUMN `activity_type` ENUM(
  'created',
  'updated',
  'status_changed',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'restricted_edit_confirmed'
) NOT NULL;

CREATE TABLE IF NOT EXISTS `sales_quote_versions` (
  `sales_quote_version_id` INT NOT NULL AUTO_INCREMENT,
  `sales_quote_id` INT NOT NULL,
  `version_number` INT NOT NULL,
  `source_activity_id` INT NULL,
  `created_by_user_id` INT NULL,
  `change_reason` TEXT NULL,
  `quote_snapshot_json` LONGTEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sales_quote_version_id`),
  UNIQUE KEY `uniq_sales_quote_version_number` (`sales_quote_id`, `version_number`),
  KEY `idx_sales_quote_versions_quote` (`sales_quote_id`, `created_at`),
  KEY `idx_sales_quote_versions_activity` (`source_activity_id`),
  KEY `idx_sales_quote_versions_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_sales_quote_versions_quote`
    FOREIGN KEY (`sales_quote_id`) REFERENCES `sales_quotes` (`sales_quote_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sales_quote_versions_activity`
    FOREIGN KEY (`source_activity_id`) REFERENCES `sales_quote_activities` (`activity_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_sales_quote_versions_created_by`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE signatures DROP COLUMN pdf_path;

-- 06-05-26

ALTER TABLE users
ADD COLUMN assign_lead TINYINT(1) NOT NULL DEFAULT 1;


ALTER TABLE `users`
ADD COLUMN `role` VARCHAR(100) NULL DEFAULT NULL AFTER `assign_lead`;

-- 08-05-26

CREATE TABLE `roles` (
  `role_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT DEFAULT NULL,
  `updated_by` INT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `unique_role_name` (`name`)
);

CREATE TABLE `permissions` (
  `permission_id` INT NOT NULL AUTO_INCREMENT,
  `module_key` VARCHAR(100) NOT NULL,
  `action_key` VARCHAR(50) NOT NULL,
  `permission_key` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `unique_permission_key` (`permission_key`)
);

CREATE TABLE `role_permissions` (
  `role_permission_id` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`role_permission_id`),
  KEY `fk_role_permissions_role_id` (`role_id`),
  KEY `fk_role_permissions_permission_id` (`permission_id`),
  CONSTRAINT `fk_role_permissions_role_id`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permissions_permission_id`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE
);

CREATE TABLE `user_roles` (
  `user_role_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_role_id`),
  KEY `fk_user_roles_user_id` (`user_id`),
  KEY `fk_user_roles_role_id` (`role_id`),
  CONSTRAINT `fk_user_roles_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role_id`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE
);

INSERT INTO permissions (module_key, action_key, permission_key) VALUES
('dashboard', 'view', 'dashboard.view'),
('dashboard', 'create', 'dashboard.create'),
('dashboard', 'edit', 'dashboard.edit'),
('dashboard', 'delete', 'dashboard.delete'),

('users', 'view', 'users.view'),
('users', 'create', 'users.create'),
('users', 'edit', 'users.edit'),
('users', 'delete', 'users.delete'),

('shoots', 'view', 'shoots.view'),
('shoots', 'create', 'shoots.create'),
('shoots', 'edit', 'shoots.edit'),
('shoots', 'delete', 'shoots.delete'),

('quotes', 'view', 'quotes.view'),
('quotes', 'create', 'quotes.create'),
('quotes', 'edit', 'quotes.edit'),
('quotes', 'delete', 'quotes.delete');

ALTER TABLE `role_permissions`
DROP FOREIGN KEY `fk_role_permissions_role_id`;

ALTER TABLE `user_roles`
DROP FOREIGN KEY `fk_user_roles_role_id`;

DROP TABLE IF EXISTS `roles`;

ALTER TABLE `role_permissions`
ADD CONSTRAINT `fk_role_permissions_user_type_id`
FOREIGN KEY (`role_id`) REFERENCES `user_type` (`user_type_id`) ON DELETE CASCADE;

ALTER TABLE `user_roles`
ADD CONSTRAINT `fk_user_roles_user_type_id`
FOREIGN KEY (`role_id`) REFERENCES `user_type` (`user_type_id`) ON DELETE CASCADE;

ALTER TABLE `user_type`
ADD COLUMN `description` TEXT DEFAULT NULL AFTER `user_role`;

ALTER TABLE user_type
ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 13-05-26

ALTER TABLE `client_lead_activities` ADD `is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `created_at`;
ALTER TABLE `affiliates` ADD `is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `updated_at`;

-- 14-05-26

CREATE TABLE `user_permissions` (
  `user_permission_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  `is_allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_permission_id`),
  UNIQUE KEY `unique_user_permission` (`user_id`, `permission_id`),
  KEY `fk_user_permissions_user_id` (`user_id`),
  KEY `fk_user_permissions_permission_id` (`permission_id`),
  CONSTRAINT `fk_user_permissions_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_permissions_permission_id`
    FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE
);

-- 15-05-26

INSERT INTO `permissions` (`module_key`, `action_key`, `permission_key`, `is_active`) VALUES
('sales', 'view', 'sales.view', 1),
('sales', 'create', 'sales.create', 1),
('sales', 'edit', 'sales.edit', 1),
('sales', 'delete', 'sales.delete', 1),
('affiliate', 'view', 'affiliate.view', 1),
('affiliate', 'create', 'affiliate.create', 1),
('affiliate', 'edit', 'affiliate.edit', 1),
('affiliate', 'delete', 'affiliate.delete', 1),
('profile', 'view', 'profile.view', 1),
('profile', 'create', 'profile.create', 1),
('profile', 'edit', 'profile.edit', 1),
('profile', 'delete', 'profile.delete', 1),
('payouts', 'view', 'payouts.view', 1),
('payouts', 'create', 'payouts.create', 1),
('payouts', 'edit', 'payouts.edit', 1),
('payouts', 'delete', 'payouts.delete', 1),
('settings', 'view', 'settings.view', 1),
('settings', 'create', 'settings.create', 1),
('settings', 'edit', 'settings.edit', 1),
('settings', 'delete', 'settings.delete', 1),
('request_shoots', 'view', 'request_shoots.view', 1),
('request_shoots', 'create', 'request_shoots.create', 1),
('request_shoots', 'edit', 'request_shoots.edit', 1),
('request_shoots', 'delete', 'request_shoots.delete', 1),
('file_manager', 'view', 'file_manager.view', 1),
('file_manager', 'create', 'file_manager.create', 1),
('file_manager', 'edit', 'file_manager.edit', 1),
('file_manager', 'delete', 'file_manager.delete', 1),
('meetings', 'view', 'meetings.view', 1),
('meetings', 'create', 'meetings.create', 1),
('meetings', 'edit', 'meetings.edit', 1),
('meetings', 'delete', 'meetings.delete', 1),
('messages', 'view', 'messages.view', 1),
('messages', 'create', 'messages.create', 1),
('messages', 'edit', 'messages.edit', 1),
('messages', 'delete', 'messages.delete', 1),
('availability', 'view', 'availability.view', 1),
('availability', 'create', 'availability.create', 1),
('availability', 'edit', 'availability.edit', 1),
('availability', 'delete', 'availability.delete', 1),
('sales_representative', 'view', 'sales_representative.view', 1),
('sales_representative', 'create', 'sales_representative.create', 1),
('sales_representative', 'edit', 'sales_representative.edit', 1),
('sales_representative', 'delete', 'sales_representative.delete', 1),
('invoices', 'view', 'invoices.view', 1),
('invoices', 'create', 'invoices.create', 1),
('invoices', 'edit', 'invoices.edit', 1),
('invoices', 'delete', 'invoices.delete', 1),
('affiliate_overview', 'view', 'affiliate_overview.view', 1),
('affiliate_overview', 'create', 'affiliate_overview.create', 1),
('affiliate_overview', 'edit', 'affiliate_overview.edit', 1),
('affiliate_overview', 'delete', 'affiliate_overview.delete', 1),
('find_yourself', 'view', 'find_yourself.view', 1),
('find_yourself', 'create', 'find_yourself.create', 1),
('find_yourself', 'edit', 'find_yourself.edit', 1),
('find_yourself', 'delete', 'find_yourself.delete', 1),
('book_a_shoot', 'view', 'book_a_shoot.view', 1),
('book_a_shoot', 'create', 'book_a_shoot.create', 1),
('book_a_shoot', 'edit', 'book_a_shoot.edit', 1),
('book_a_shoot', 'delete', 'book_a_shoot.delete', 1),
('finances', 'view', 'finances.view', 1),
('finances', 'create', 'finances.create', 1),
('finances', 'edit', 'finances.edit', 1),
('finances', 'delete', 'finances.delete', 1);

-- 13-05-26

CREATE TABLE IF NOT EXISTS finance_transactions (
  finance_transaction_id INT NOT NULL AUTO_INCREMENT,
  transaction_code VARCHAR(64) NOT NULL,
  booking_id INT NULL,
  payment_id INT NULL,
  invoice_send_history_id INT NULL,
  client_user_id INT NULL,
  guest_email VARCHAR(255) NULL,
  transaction_type ENUM('client_payment', 'manual_payment', 'refund', 'adjustment', 'credit', 'creator_earning', 'platform_fee') NOT NULL DEFAULT 'client_payment',
  direction ENUM('inflow', 'outflow', 'internal') NOT NULL DEFAULT 'inflow',
  source ENUM('stripe', 'manual', 'account_credit', 'system', 'admin') NOT NULL DEFAULT 'system',
  payment_method VARCHAR(64) NULL,
  status ENUM('pending', 'paid', 'failed', 'refunded', 'void', 'cancelled') NOT NULL DEFAULT 'pending',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  platform_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  creator_earnings_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  gateway_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  external_reference VARCHAR(255) NULL,
  transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_transaction_id),
  UNIQUE KEY uniq_finance_transaction_code (transaction_code),
  KEY idx_finance_transactions_booking (booking_id),
  KEY idx_finance_transactions_payment (payment_id),
  KEY idx_finance_transactions_status (status),
  KEY idx_finance_transactions_type (transaction_type),
  KEY idx_finance_transactions_date (transaction_date),
  CONSTRAINT fk_finance_transactions_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id),
  CONSTRAINT fk_finance_transactions_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id),
  CONSTRAINT fk_finance_transactions_invoice FOREIGN KEY (invoice_send_history_id) REFERENCES invoice_send_history(invoice_send_history_id),
  CONSTRAINT fk_finance_transactions_client_user FOREIGN KEY (client_user_id) REFERENCES users(id),
  CONSTRAINT fk_finance_transactions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_project_breakdowns (
  finance_project_breakdown_id INT NOT NULL AUTO_INCREMENT,
  booking_id INT NOT NULL,
  quote_id INT NULL,
  client_user_id INT NULL,
  guest_email VARCHAR(255) NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  equipment_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  platform_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  platform_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  creator_earnings_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  collected_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  outstanding_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('unpaid', 'pending', 'partially_paid', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'unpaid',
  metadata_json TEXT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_project_breakdown_id),
  UNIQUE KEY uniq_finance_breakdown_booking (booking_id),
  KEY idx_finance_breakdowns_client (client_user_id),
  KEY idx_finance_breakdowns_status (payment_status),
  CONSTRAINT fk_finance_breakdowns_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id),
  CONSTRAINT fk_finance_breakdowns_client_user FOREIGN KEY (client_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_invoice_payments (
  finance_invoice_payment_id INT NOT NULL AUTO_INCREMENT,
  invoice_send_history_id INT NOT NULL,
  payment_id INT NULL,
  finance_transaction_id INT NULL,
  booking_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending', 'paid', 'failed', 'void') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_invoice_payment_id),
  KEY idx_finance_invoice_payments_invoice (invoice_send_history_id),
  KEY idx_finance_invoice_payments_payment (payment_id),
  KEY idx_finance_invoice_payments_booking (booking_id),
  KEY idx_finance_invoice_payments_status (status),
  CONSTRAINT fk_finance_invoice_payments_invoice FOREIGN KEY (invoice_send_history_id) REFERENCES invoice_send_history(invoice_send_history_id),
  CONSTRAINT fk_finance_invoice_payments_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id),
  CONSTRAINT fk_finance_invoice_payments_transaction FOREIGN KEY (finance_transaction_id) REFERENCES finance_transactions(finance_transaction_id),
  CONSTRAINT fk_finance_invoice_payments_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_earnings (
  creator_earning_id INT NOT NULL AUTO_INCREMENT,
  booking_id INT NOT NULL,
  creator_id INT NOT NULL,
  payment_id INT NULL,
  finance_transaction_id INT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  platform_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_earning_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending', 'earned', 'payout_pending', 'paid', 'held', 'cancelled') NOT NULL DEFAULT 'pending',
  earned_at DATETIME NULL,
  payout_id INT NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_earning_id),
  KEY idx_creator_earnings_booking (booking_id),
  KEY idx_creator_earnings_creator (creator_id),
  KEY idx_creator_earnings_payment (payment_id),
  KEY idx_creator_earnings_status (status),
  CONSTRAINT fk_creator_earnings_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id),
  CONSTRAINT fk_creator_earnings_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_creator_earnings_payment FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id),
  CONSTRAINT fk_creator_earnings_transaction FOREIGN KEY (finance_transaction_id) REFERENCES finance_transactions(finance_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_wallets (
  creator_wallet_id INT NOT NULL AUTO_INCREMENT,
  creator_id INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  pending_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  available_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  reserved_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  lifetime_earnings DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  lifetime_payouts DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  last_reconciled_at DATETIME NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_wallet_id),
  UNIQUE KEY uniq_creator_wallets_creator (creator_id),
  CONSTRAINT fk_creator_wallets_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_payout_accounts (
  creator_payout_account_id INT NOT NULL AUTO_INCREMENT,
  creator_id INT NOT NULL,
  payout_method ENUM('stripe', 'bank_transfer', 'manual') NOT NULL DEFAULT 'manual',
  account_label VARCHAR(120) NULL,
  stripe_account_id VARCHAR(255) NULL,
  account_holder_name VARCHAR(255) NULL,
  bank_name VARCHAR(255) NULL,
  account_last4 VARCHAR(4) NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending', 'verified', 'disabled') NOT NULL DEFAULT 'pending',
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_payout_account_id),
  KEY idx_creator_payout_accounts_creator (creator_id),
  KEY idx_creator_payout_accounts_status (status),
  CONSTRAINT fk_creator_payout_accounts_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_payout_requests (
  creator_payout_request_id INT NOT NULL AUTO_INCREMENT,
  request_code VARCHAR(64) NOT NULL,
  creator_id INT NOT NULL,
  creator_payout_account_id INT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payout_method ENUM('stripe', 'bank_transfer', 'manual') NOT NULL DEFAULT 'manual',
  status ENUM('requested', 'approved', 'processing', 'paid', 'rejected', 'cancelled', 'failed') NOT NULL DEFAULT 'requested',
  external_reference VARCHAR(255) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  processed_by_user_id INT NULL,
  processed_at DATETIME NULL,
  paid_at DATETIME NULL,
  rejection_reason TEXT NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_payout_request_id),
  UNIQUE KEY uniq_creator_payout_requests_code (request_code),
  KEY idx_creator_payout_requests_creator (creator_id),
  KEY idx_creator_payout_requests_status (status),
  KEY idx_creator_payout_requests_requested_at (requested_at),
  CONSTRAINT fk_creator_payout_requests_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_creator_payout_requests_account FOREIGN KEY (creator_payout_account_id) REFERENCES creator_payout_accounts(creator_payout_account_id),
  CONSTRAINT fk_creator_payout_requests_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_creator_payout_requests_processed_by FOREIGN KEY (processed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_payout_transactions (
  creator_payout_transaction_id INT NOT NULL AUTO_INCREMENT,
  creator_id INT NOT NULL,
  creator_payout_request_id INT NULL,
  creator_payout_account_id INT NULL,
  transaction_type ENUM('earning_pending', 'earning_released', 'payout_requested', 'payout_paid', 'payout_returned', 'hold_reserved', 'hold_released', 'manual_adjustment') NOT NULL,
  direction ENUM('credit', 'debit', 'internal') NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  source_type VARCHAR(64) NULL,
  source_id INT NULL,
  source_reference VARCHAR(120) NULL,
  balance_pending_after DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_available_after DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_reserved_after DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('posted', 'void') NOT NULL DEFAULT 'posted',
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_payout_transaction_id),
  KEY idx_creator_payout_transactions_creator (creator_id),
  KEY idx_creator_payout_transactions_request (creator_payout_request_id),
  KEY idx_creator_payout_transactions_source (source_type, source_reference),
  CONSTRAINT fk_creator_payout_transactions_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_creator_payout_transactions_request FOREIGN KEY (creator_payout_request_id) REFERENCES creator_payout_requests(creator_payout_request_id),
  CONSTRAINT fk_creator_payout_transactions_account FOREIGN KEY (creator_payout_account_id) REFERENCES creator_payout_accounts(creator_payout_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14-05-26

ALTER TABLE account_credit_ledger
  MODIFY COLUMN source ENUM('quote_reduction', 'referral_bonus', 'loyalty_reward', 'manual_admin', 'payment_adjustment') NOT NULL DEFAULT 'quote_reduction',
  ADD COLUMN payment_id INT NULL AFTER booking_id,
  ADD COLUMN invoice_send_history_id INT NULL AFTER payment_id,
  ADD COLUMN source_account_credit_ledger_id INT NULL AFTER invoice_send_history_id,
  ADD COLUMN usage_context ENUM('general', 'shoot_payment', 'studio_rental') NOT NULL DEFAULT 'general' AFTER source,
  ADD COLUMN user_segment ENUM('client', 'creator') NOT NULL DEFAULT 'client' AFTER usage_context,
  ADD KEY idx_account_credit_payment (payment_id),
  ADD KEY idx_account_credit_invoice (invoice_send_history_id),
  ADD KEY idx_account_credit_source_entry (source_account_credit_ledger_id),
  ADD KEY idx_account_credit_segment (user_segment),
  ADD CONSTRAINT fk_account_credit_payment
    FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_account_credit_invoice
    FOREIGN KEY (invoice_send_history_id) REFERENCES invoice_send_history(invoice_send_history_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_account_credit_source_entry
    FOREIGN KEY (source_account_credit_ledger_id) REFERENCES account_credit_ledger(account_credit_ledger_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE account_credit_ledger
  ADD COLUMN credit_type VARCHAR(50) NULL AFTER source,
  ADD COLUMN expires_at DATETIME NULL AFTER credit_type,
  ADD COLUMN restrictions_json JSON NULL AFTER notes,
  ADD COLUMN created_by_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER restrictions_json,
  ADD COLUMN notification_status ENUM('not_requested', 'pending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'not_requested' AFTER created_by_admin,
  ADD KEY idx_account_credit_credit_type (credit_type),
  ADD KEY idx_account_credit_expires_at (expires_at);

CREATE TABLE IF NOT EXISTS finance_disputes (
  finance_dispute_id INT NOT NULL AUTO_INCREMENT,
  dispute_code VARCHAR(64) NOT NULL,
  booking_id INT NULL,
  invoice_send_history_id INT NULL,
  finance_transaction_id INT NULL,
  client_user_id INT NULL,
  creator_id INT NULL,
  raised_by_type ENUM('client','creator','admin') NOT NULL DEFAULT 'admin',
  raised_by_user_id INT NULL,
  raised_by_creator_id INT NULL,
  category ENUM('quality','payment_delay','wrong_deliverables','refund','payout_issues','other') NOT NULL DEFAULT 'other',
  subject VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('open','in_review','resolved','rejected','escalated') NOT NULL DEFAULT 'open',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  disputed_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payout_hold_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  impacted_payout_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  resolution_type ENUM('payout_release','refund','partial_refund','credit_compensation','payout_adjustment','no_action','other') NULL,
  resolution_notes TEXT NULL,
  resolved_by_user_id INT NULL,
  resolved_at DATETIME NULL,
  metadata_json TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_dispute_id),
  UNIQUE KEY uniq_finance_disputes_code (dispute_code),
  KEY idx_finance_disputes_booking (booking_id),
  KEY idx_finance_disputes_invoice (invoice_send_history_id),
  KEY idx_finance_disputes_status (status),
  KEY idx_finance_disputes_category (category),
  KEY idx_finance_disputes_client (client_user_id),
  KEY idx_finance_disputes_creator (creator_id),
  KEY idx_finance_disputes_created_at (created_at),
  CONSTRAINT fk_finance_disputes_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_invoice FOREIGN KEY (invoice_send_history_id) REFERENCES invoice_send_history(invoice_send_history_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_transaction FOREIGN KEY (finance_transaction_id) REFERENCES finance_transactions(finance_transaction_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_client FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_raised_user FOREIGN KEY (raised_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_raised_creator FOREIGN KEY (raised_by_creator_id) REFERENCES crew_members(crew_member_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_disputes_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_dispute_comments (
  finance_dispute_comment_id INT NOT NULL AUTO_INCREMENT,
  finance_dispute_id INT NOT NULL,
  comment_type ENUM('internal','status_update','resolution','system') NOT NULL DEFAULT 'internal',
  visibility ENUM('internal','client','creator','all') NOT NULL DEFAULT 'internal',
  body TEXT NOT NULL,
  created_by_user_id INT NULL,
  created_by_creator_id INT NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_dispute_comment_id),
  KEY idx_finance_dispute_comments_dispute (finance_dispute_id),
  KEY idx_finance_dispute_comments_created_at (created_at),
  CONSTRAINT fk_finance_dispute_comments_dispute FOREIGN KEY (finance_dispute_id) REFERENCES finance_disputes(finance_dispute_id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_dispute_comments_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_dispute_comments_creator FOREIGN KEY (created_by_creator_id) REFERENCES crew_members(crew_member_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_dispute_attachments (
  finance_dispute_attachment_id INT NOT NULL AUTO_INCREMENT,
  finance_dispute_id INT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_url TEXT NULL,
  file_size_bytes BIGINT NULL,
  mime_type VARCHAR(100) NULL,
  attachment_type ENUM('evidence','invoice','deliverable','refund_proof','payout_proof','other') NOT NULL DEFAULT 'evidence',
  uploaded_by_user_id INT NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_dispute_attachment_id),
  KEY idx_finance_dispute_attachments_dispute (finance_dispute_id),
  KEY idx_finance_dispute_attachments_created_at (created_at),
  CONSTRAINT fk_finance_dispute_attachments_dispute FOREIGN KEY (finance_dispute_id) REFERENCES finance_disputes(finance_dispute_id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_dispute_attachments_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_dispute_resolution_logs (
  finance_dispute_resolution_log_id INT NOT NULL AUTO_INCREMENT,
  finance_dispute_id INT NOT NULL,
  action ENUM('created','updated','comment_added','attachment_added','payout_hold_created','payout_hold_released','resolved','rejected','refunded','escalated') NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NULL,
  amount DECIMAL(12,2) NULL,
  notes TEXT NULL,
  metadata_json TEXT NULL,
  performed_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_dispute_resolution_log_id),
  KEY idx_finance_dispute_logs_dispute (finance_dispute_id),
  KEY idx_finance_dispute_logs_action (action),
  KEY idx_finance_dispute_logs_created_at (created_at),
  CONSTRAINT fk_finance_dispute_logs_dispute FOREIGN KEY (finance_dispute_id) REFERENCES finance_disputes(finance_dispute_id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_dispute_logs_user FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_dispute_payout_holds (
  finance_dispute_payout_hold_id INT NOT NULL AUTO_INCREMENT,
  finance_dispute_id INT NOT NULL,
  creator_id INT NOT NULL,
  creator_earning_id INT NULL,
  creator_payout_request_id INT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  hold_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  released_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('held','partially_released','released','cancelled') NOT NULL DEFAULT 'held',
  reason TEXT NULL,
  held_by_user_id INT NULL,
  held_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by_user_id INT NULL,
  released_at DATETIME NULL,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (finance_dispute_payout_hold_id),
  KEY idx_finance_dispute_holds_dispute (finance_dispute_id),
  KEY idx_finance_dispute_holds_creator (creator_id),
  KEY idx_finance_dispute_holds_status (status),
  CONSTRAINT fk_finance_dispute_holds_dispute FOREIGN KEY (finance_dispute_id) REFERENCES finance_disputes(finance_dispute_id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_dispute_holds_creator FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_dispute_holds_earning FOREIGN KEY (creator_earning_id) REFERENCES creator_earnings(creator_earning_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_dispute_holds_payout FOREIGN KEY (creator_payout_request_id) REFERENCES creator_payout_requests(creator_payout_request_id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_dispute_holds_held_by FOREIGN KEY (held_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_dispute_holds_released_by FOREIGN KEY (released_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);



-- 15-05-26

ALTER TABLE payment_transactions
  ADD COLUMN payment_source ENUM('booking_checkout', 'quote_invoice', 'additional_invoice')
    NOT NULL DEFAULT 'booking_checkout'
    COMMENT 'Origin of the payment transaction'
    AFTER guest_email,
  MODIFY COLUMN hours DECIMAL(10,2) NULL
    COMMENT 'Number of hours booked; nullable for quote invoices before scheduling',
  ADD INDEX idx_payment_source (payment_source);

ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_hours_positive CHECK (
    hours IS NULL OR hours >= 0
  );

CREATE TABLE IF NOT EXISTS sales_quote_preview_links (
  sales_quote_preview_link_id INT AUTO_INCREMENT PRIMARY KEY,
  sales_quote_id INT NOT NULL,
  quote_key VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by_user_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_quote_preview_links_quote_key (quote_key),
  KEY idx_sales_quote_preview_links_quote_id (sales_quote_id),
  KEY idx_sales_quote_preview_links_expires_at (expires_at),
  CONSTRAINT fk_sales_quote_preview_links_quote
    FOREIGN KEY (sales_quote_id) REFERENCES sales_quotes(sales_quote_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_sales_quote_preview_links_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE booking_payment_summary (
  booking_payment_summary_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sales_quote_id INT NULL,
  quote_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  credit_used_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  credit_created_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  due_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_status ENUM(
    'pending',
    'partially_paid',
    'paid',
    'approval_pending',
    'no_payment_due'
  ) NOT NULL DEFAULT 'pending',
  manual_payment_mode VARCHAR(32) NULL,
  manual_payment_other_mode VARCHAR(100) NULL,
  manual_payment_proof_url TEXT NULL,
  manual_payment_proof_file_path VARCHAR(1024) NULL,
  manual_payment_proof_file_name VARCHAR(255) NULL,
  manual_payment_notes TEXT NULL,
  manual_payment_updated_by_user_id INT NULL,
  manual_payment_updated_at DATETIME NULL,
  last_quote_change_type ENUM('none', 'increase', 'decrease') NOT NULL DEFAULT 'none',
  last_quote_change_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  last_quote_change_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_payment_summary_booking_id (booking_id),
  INDEX idx_booking_payment_summary_sales_quote_id (sales_quote_id),
  INDEX idx_booking_payment_summary_payment_status (payment_status)
);

-- 21-05-26

ALTER TABLE booking_payment_summary
  ADD COLUMN lead_id INT NULL AFTER booking_id,
  ADD INDEX idx_booking_payment_summary_lead_id (lead_id);

UPDATE booking_payment_summary bps
JOIN sales_leads sl ON sl.booking_id = bps.booking_id
SET bps.lead_id = sl.lead_id
WHERE bps.lead_id IS NULL;


-- 22-05-26

ALTER TABLE booking_payment_summary
  ADD COLUMN manual_payment_mode VARCHAR(32) NULL AFTER payment_status,
  ADD COLUMN manual_payment_other_mode VARCHAR(100) NULL AFTER manual_payment_mode,
  ADD COLUMN manual_payment_proof_url TEXT NULL AFTER manual_payment_other_mode,
  ADD COLUMN manual_payment_proof_file_path VARCHAR(1024) NULL AFTER manual_payment_proof_url,
  ADD COLUMN manual_payment_proof_file_name VARCHAR(255) NULL AFTER manual_payment_proof_file_path,
  ADD COLUMN manual_payment_notes TEXT NULL AFTER manual_payment_proof_file_name,
  ADD COLUMN manual_payment_updated_by_user_id INT NULL AFTER manual_payment_notes,
  ADD COLUMN manual_payment_updated_at DATETIME NULL AFTER manual_payment_updated_by_user_id;

CREATE TABLE IF NOT EXISTS booking_manual_payments (
  booking_manual_payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  lead_id INT NULL,
  sales_quote_id INT NULL,
  payment_type ENUM('full', 'partial') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_mode VARCHAR(32) NOT NULL,
  other_payment_mode VARCHAR(100) NULL,
  proof_url TEXT NULL,
  proof_file_path VARCHAR(1024) NULL,
  proof_file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  performed_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking_manual_payments_booking_id (booking_id),
  INDEX idx_booking_manual_payments_lead_id (lead_id),
  INDEX idx_booking_manual_payments_sales_quote_id (sales_quote_id),
  INDEX idx_booking_manual_payments_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS sales_quote_preview_links (
  sales_quote_preview_link_id INT AUTO_INCREMENT PRIMARY KEY,
  sales_quote_id INT NOT NULL,
  quote_key VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by_user_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_quote_preview_links_quote_key (quote_key),
  KEY idx_sales_quote_preview_links_quote_id (sales_quote_id),
  KEY idx_sales_quote_preview_links_expires_at (expires_at),
  CONSTRAINT fk_sales_quote_preview_links_quote
    FOREIGN KEY (sales_quote_id) REFERENCES sales_quotes(sales_quote_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_sales_quote_preview_links_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE TABLE booking_payment_summary (
  booking_payment_summary_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sales_quote_id INT NULL,
  quote_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  credit_used_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  credit_created_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  due_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_status ENUM(
    'pending',
    'partially_paid',
    'paid',
    'approval_pending',
    'no_payment_due'
  ) NOT NULL DEFAULT 'pending',
  manual_payment_mode VARCHAR(32) NULL,
  manual_payment_other_mode VARCHAR(100) NULL,
  manual_payment_proof_url TEXT NULL,
  manual_payment_proof_file_path VARCHAR(1024) NULL,
  manual_payment_proof_file_name VARCHAR(255) NULL,
  manual_payment_notes TEXT NULL,
  manual_payment_updated_by_user_id INT NULL,
  manual_payment_updated_at DATETIME NULL,
  last_quote_change_type ENUM('none', 'increase', 'decrease') NOT NULL DEFAULT 'none',
  last_quote_change_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  last_quote_change_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_payment_summary_booking_id (booking_id),
  INDEX idx_booking_payment_summary_sales_quote_id (sales_quote_id),
  INDEX idx_booking_payment_summary_payment_status (payment_status)
);

-- 21-05-26

ALTER TABLE booking_payment_summary
  ADD COLUMN lead_id INT NULL AFTER booking_id,
  ADD INDEX idx_booking_payment_summary_lead_id (lead_id);

UPDATE booking_payment_summary bps
JOIN sales_leads sl ON sl.booking_id = bps.booking_id
SET bps.lead_id = sl.lead_id
WHERE bps.lead_id IS NULL;


-- 22-05-26

ALTER TABLE booking_payment_summary
  ADD COLUMN manual_payment_mode VARCHAR(32) NULL AFTER payment_status,
  ADD COLUMN manual_payment_other_mode VARCHAR(100) NULL AFTER manual_payment_mode,
  ADD COLUMN manual_payment_proof_url TEXT NULL AFTER manual_payment_other_mode,
  ADD COLUMN manual_payment_proof_file_path VARCHAR(1024) NULL AFTER manual_payment_proof_url,
  ADD COLUMN manual_payment_proof_file_name VARCHAR(255) NULL AFTER manual_payment_proof_file_path,
  ADD COLUMN manual_payment_notes TEXT NULL AFTER manual_payment_proof_file_name,
  ADD COLUMN manual_payment_updated_by_user_id INT NULL AFTER manual_payment_notes,
  ADD COLUMN manual_payment_updated_at DATETIME NULL AFTER manual_payment_updated_by_user_id;

CREATE TABLE IF NOT EXISTS booking_manual_payments (
  booking_manual_payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  lead_id INT NULL,
  sales_quote_id INT NULL,
  payment_type ENUM('full', 'partial') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_mode VARCHAR(32) NOT NULL,
  other_payment_mode VARCHAR(100) NULL,
  proof_url TEXT NULL,
  proof_file_path VARCHAR(1024) NULL,
  proof_file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  performed_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking_manual_payments_booking_id (booking_id),
  INDEX idx_booking_manual_payments_lead_id (lead_id),
  INDEX idx_booking_manual_payments_sales_quote_id (sales_quote_id),
  INDEX idx_booking_manual_payments_created_at (created_at)
);


-- 22-05-26

ALTER TABLE `users` ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;
UPDATE `users` SET `updated_at` = `created_at`;


-- 27-05-26

CREATE TABLE IF NOT EXISTS `project_notes` (
  `note_id` int(11) NOT NULL AUTO_INCREMENT,
  `booking_id` int(11) NOT NULL COMMENT 'FK to stream_project_booking - shoot shown on admin board',
  `parent_note_id` int(11) DEFAULT NULL COMMENT 'Self reference for threaded replies',
  `created_by_user_id` int(11) NOT NULL COMMENT 'Internal/admin user who wrote the note',
  `message` text NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`),
  KEY `idx_project_notes_booking` (`booking_id`),
  KEY `idx_project_notes_parent` (`parent_note_id`),
  KEY `idx_project_notes_created_by` (`created_by_user_id`),
  KEY `idx_project_notes_created_at` (`created_at`),
  CONSTRAINT `project_notes_ibfk_1`
    FOREIGN KEY (`booking_id`)
    REFERENCES `stream_project_booking` (`stream_project_booking_id`)
    ON DELETE CASCADE,
  CONSTRAINT `project_notes_ibfk_2`
    FOREIGN KEY (`parent_note_id`)
    REFERENCES `project_notes` (`note_id`)
    ON DELETE CASCADE,
  CONSTRAINT `project_notes_ibfk_3`
    FOREIGN KEY (`created_by_user_id`)
    REFERENCES `users` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `project_note_reactions` (
  `reaction_id` int(11) NOT NULL AUTO_INCREMENT,
  `note_id` int(11) NOT NULL COMMENT 'FK to project_notes',
  `user_id` int(11) NOT NULL COMMENT 'User who reacted',
  `reaction_type` varchar(30) NOT NULL DEFAULT 'like',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reaction_id`),
  UNIQUE KEY `uniq_project_note_reaction_user` (`note_id`, `user_id`, `reaction_type`),
  KEY `idx_project_note_reactions_note` (`note_id`),
  KEY `idx_project_note_reactions_user` (`user_id`),
  CONSTRAINT `project_note_reactions_ibfk_1`
    FOREIGN KEY (`note_id`)
    REFERENCES `project_notes` (`note_id`)
    ON DELETE CASCADE,
  CONSTRAINT `project_note_reactions_ibfk_2`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 28-05-26

CREATE TABLE IF NOT EXISTS `project_note_attachments` (
  `attachment_id` INT NOT NULL AUTO_INCREMENT,
  `note_id` INT NOT NULL,
  `uploaded_by_user_id` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) DEFAULT NULL,
  `file_size_bytes` BIGINT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`attachment_id`),
  KEY `idx_project_note_attachments_note` (`note_id`),
  KEY `idx_project_note_attachments_uploaded_by` (`uploaded_by_user_id`),
  KEY `idx_project_note_attachments_created_at` (`created_at`),
  CONSTRAINT `fk_project_note_attachments_note`
    FOREIGN KEY (`note_id`) REFERENCES `project_notes` (`note_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_note_attachments_uploaded_by`
    FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29-5-26

ALTER TABLE `sales_quotes`
  ADD COLUMN IF NOT EXISTS `location_latitude` DECIMAL(10,7) NULL AFTER `client_address`,
  ADD COLUMN IF NOT EXISTS `location_longitude` DECIMAL(10,7) NULL AFTER `location_latitude`;

-- 03-06-26

-- Reset permissions

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE role_permissions;
TRUNCATE TABLE user_permissions;
TRUNCATE TABLE permissions;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO permissions (module_key, action_key, permission_key, is_active)
SELECT
  scoped_modules.module_key,
  actions.action_key,
  CONCAT(scoped_modules.module_key, '.', actions.action_key) AS permission_key,
  1 AS is_active
FROM (
  -- Admin: 11 modules
  SELECT 'admin_dashboard' AS module_key UNION ALL
  SELECT 'admin_shoots' UNION ALL
  SELECT 'admin_file_manager' UNION ALL
  SELECT 'admin_meetings' UNION ALL
  SELECT 'admin_messages' UNION ALL
  SELECT 'admin_availability' UNION ALL
  SELECT 'admin_sales_representative' UNION ALL
  SELECT 'admin_finances' UNION ALL
  SELECT 'admin_users' UNION ALL
  SELECT 'admin_quotes' UNION ALL
  SELECT 'admin_invoices' UNION ALL

  -- Crew Member: 10 modules
  SELECT 'crew_dashboard' UNION ALL
  SELECT 'crew_request_shoots' UNION ALL
  SELECT 'crew_file_manager' UNION ALL
  SELECT 'crew_meetings' UNION ALL
  SELECT 'crew_messages' UNION ALL
  SELECT 'crew_affiliate' UNION ALL
  SELECT 'crew_availability' UNION ALL
  SELECT 'crew_profile' UNION ALL
  SELECT 'crew_payouts' UNION ALL
  SELECT 'crew_settings' UNION ALL

  -- Sales Representative: 7 modules
  SELECT 'sales_rep_sales' UNION ALL
  SELECT 'sales_rep_availability' UNION ALL
  SELECT 'sales_rep_shoots' UNION ALL
  SELECT 'sales_rep_file_manager' UNION ALL
  SELECT 'sales_rep_meetings' UNION ALL
  SELECT 'sales_rep_messages' UNION ALL
  SELECT 'sales_rep_quotes' UNION ALL

  -- Client: 11 modules
  SELECT 'client_dashboard' UNION ALL
  SELECT 'client_affiliate_overview' UNION ALL
  SELECT 'client_file_manager' UNION ALL
  SELECT 'client_find_yourself' UNION ALL
  SELECT 'client_meetings' UNION ALL
  SELECT 'client_messages' UNION ALL
  SELECT 'client_shoots' UNION ALL
  SELECT 'client_quotes' UNION ALL
  SELECT 'client_book_a_shoot' UNION ALL
  SELECT 'client_finances' UNION ALL
  SELECT 'client_profile'
) AS scoped_modules
CROSS JOIN (
  SELECT 'view' AS action_key UNION ALL
  SELECT 'create' UNION ALL
  SELECT 'edit' UNION ALL
  SELECT 'delete'
) AS actions;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT
  1,
  permission_id,
  1
FROM permissions
WHERE module_key LIKE 'admin_%'
  AND is_active = 1;

-- Crew Member
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT
  2,
  permission_id,
  1
FROM permissions
WHERE module_key LIKE 'crew_%'
  AND is_active = 1;

-- Sales Representative
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT
  5,
  permission_id,
  1
FROM permissions
WHERE module_key LIKE 'sales_rep_%'
  AND is_active = 1;

-- Client
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT
  3,
  permission_id,
  1
FROM permissions
WHERE module_key LIKE 'client_%'
  AND is_active = 1;

-- 04-06-26

ALTER TABLE permissions ADD COLUMN role_id INT NULL AFTER permission_key;

INSERT INTO permissions (module_key, action_key, permission_key, role_id, is_active) VALUES
('sales_admin_dashboard', 'view', 'sales_admin_dashboard.view', NULL, 1),
('sales_admin_dashboard', 'create', 'sales_admin_dashboard.create', NULL, 1),
('sales_admin_dashboard', 'edit', 'sales_admin_dashboard.edit', NULL, 1),
('sales_admin_dashboard', 'delete', 'sales_admin_dashboard.delete', NULL, 1),

('sales_admin_sales_people', 'view', 'sales_admin_sales_people.view', NULL, 1),
('sales_admin_sales_people', 'create', 'sales_admin_sales_people.create', NULL, 1),
('sales_admin_sales_people', 'edit', 'sales_admin_sales_people.edit', NULL, 1),
('sales_admin_sales_people', 'delete', 'sales_admin_sales_people.delete', NULL, 1),

('sales_admin_shoots', 'view', 'sales_admin_shoots.view', NULL, 1),
('sales_admin_shoots', 'create', 'sales_admin_shoots.create', NULL, 1),
('sales_admin_shoots', 'edit', 'sales_admin_shoots.edit', NULL, 1),
('sales_admin_shoots', 'delete', 'sales_admin_shoots.delete', NULL, 1),

('sales_admin_file_manager', 'view', 'sales_admin_file_manager.view', NULL, 1),
('sales_admin_file_manager', 'create', 'sales_admin_file_manager.create', NULL, 1),
('sales_admin_file_manager', 'edit', 'sales_admin_file_manager.edit', NULL, 1),
('sales_admin_file_manager', 'delete', 'sales_admin_file_manager.delete', NULL, 1),

('sales_admin_meetings', 'view', 'sales_admin_meetings.view', NULL, 1),
('sales_admin_meetings', 'create', 'sales_admin_meetings.create', NULL, 1),
('sales_admin_meetings', 'edit', 'sales_admin_meetings.edit', NULL, 1),
('sales_admin_meetings', 'delete', 'sales_admin_meetings.delete', NULL, 1),

('sales_admin_messages', 'view', 'sales_admin_messages.view', NULL, 1),
('sales_admin_messages', 'create', 'sales_admin_messages.create', NULL, 1),
('sales_admin_messages', 'edit', 'sales_admin_messages.edit', NULL, 1),
('sales_admin_messages', 'delete', 'sales_admin_messages.delete', NULL, 1),

('sales_admin_quotes', 'view', 'sales_admin_quotes.view', NULL, 1),
('sales_admin_quotes', 'create', 'sales_admin_quotes.create', NULL, 1),
('sales_admin_quotes', 'edit', 'sales_admin_quotes.edit', NULL, 1),
('sales_admin_quotes', 'delete', 'sales_admin_quotes.delete', NULL, 1),

('sales_admin_invoices', 'view', 'sales_admin_invoices.view', NULL, 1),
('sales_admin_invoices', 'create', 'sales_admin_invoices.create', NULL, 1),
('sales_admin_invoices', 'edit', 'sales_admin_invoices.edit', NULL, 1),
('sales_admin_invoices', 'delete', 'sales_admin_invoices.delete', NULL, 1);

INSERT INTO `permissions` (`module_key`, `action_key`, `permission_key`, `role_id`, `is_active`) VALUES
('production_manager_dashboard', 'view', 'production_manager_dashboard.view', NULL, 1),
('production_manager_dashboard', 'create', 'production_manager_dashboard.create', NULL, 1),
('production_manager_dashboard', 'edit', 'production_manager_dashboard.edit', NULL, 1),
('production_manager_dashboard', 'delete', 'production_manager_dashboard.delete', NULL, 1),

('production_manager_creative_partner', 'view', 'production_manager_creative_partner.view', NULL, 1),
('production_manager_creative_partner', 'create', 'production_manager_creative_partner.create', NULL, 1),
('production_manager_creative_partner', 'edit', 'production_manager_creative_partner.edit', NULL, 1),
('production_manager_creative_partner', 'delete', 'production_manager_creative_partner.delete', NULL, 1),

('production_manager_shoots', 'view', 'production_manager_shoots.view', NULL, 1),
('production_manager_shoots', 'create', 'production_manager_shoots.create', NULL, 1),
('production_manager_shoots', 'edit', 'production_manager_shoots.edit', NULL, 1),
('production_manager_shoots', 'delete', 'production_manager_shoots.delete', NULL, 1),

('production_manager_file_manager', 'view', 'production_manager_file_manager.view', NULL, 1),
('production_manager_file_manager', 'create', 'production_manager_file_manager.create', NULL, 1),
('production_manager_file_manager', 'edit', 'production_manager_file_manager.edit', NULL, 1),
('production_manager_file_manager', 'delete', 'production_manager_file_manager.delete', NULL, 1),

('production_manager_meetings', 'view', 'production_manager_meetings.view', NULL, 1),
('production_manager_meetings', 'create', 'production_manager_meetings.create', NULL, 1),
('production_manager_meetings', 'edit', 'production_manager_meetings.edit', NULL, 1),
('production_manager_meetings', 'delete', 'production_manager_meetings.delete', NULL, 1),

('production_manager_messages', 'view', 'production_manager_messages.view', NULL, 1),
('production_manager_messages', 'create', 'production_manager_messages.create', NULL, 1),
('production_manager_messages', 'edit', 'production_manager_messages.edit', NULL, 1),
('production_manager_messages', 'delete', 'production_manager_messages.delete', NULL, 1),

('production_manager_availability', 'view', 'production_manager_availability.view', NULL, 1),
('production_manager_availability', 'create', 'production_manager_availability.create', NULL, 1),
('production_manager_availability', 'edit', 'production_manager_availability.edit', NULL, 1),
('production_manager_availability', 'delete', 'production_manager_availability.delete', NULL, 1);

-- Sales Admin permissions
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 7, permission_id, 1
FROM permissions
WHERE module_key IN (
  'sales_admin_dashboard',
  'sales_admin_sales_people',
  'sales_admin_shoots',
  'sales_admin_file_manager',
  'sales_admin_meetings',
  'sales_admin_messages',
  'sales_admin_quotes',
  'sales_admin_invoices'
)
AND is_active = 1
AND NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.role_id = 7
    AND rp.permission_id = permissions.permission_id
);

-- Production Manager permissions
INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 6, permission_id, 1
FROM permissions
WHERE module_key IN (
  'production_manager_dashboard',
  'production_manager_creative_partner',
  'production_manager_shoots',
  'production_manager_file_manager',
  'production_manager_meetings',
  'production_manager_messages',
  'production_manager_availability'
)
AND is_active = 1
AND NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.role_id = 6
    AND rp.permission_id = permissions.permission_id
);

TRUNCATE TABLE role_permissions;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 1, permission_id, 1
FROM permissions
WHERE module_key LIKE 'admin_%' AND is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 2, permission_id, 1
FROM permissions
WHERE module_key LIKE 'crew_%' AND is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 3, permission_id, 1
FROM permissions
WHERE module_key LIKE 'client_%' AND is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 5, permission_id, 1
FROM permissions
WHERE module_key LIKE 'sales_rep_%' AND is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 6, permission_id, 1
FROM permissions
WHERE module_key LIKE 'production_manager_%' AND is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT 7, permission_id, 1
FROM permissions
WHERE module_key LIKE 'sales_admin_%' AND is_active = 1;


-- 03-06-26

CREATE TABLE IF NOT EXISTS `creator_earning_advances` (
  `advance_id` INT NOT NULL AUTO_INCREMENT,
  `creator_earning_id` INT NOT NULL,
  `booking_id` INT NOT NULL,
  `creator_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
  `processed_at` DATETIME NULL,
  `notes` TEXT NULL,
  `created_by_user_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`advance_id`),
  KEY `idx_cea_earning` (`creator_earning_id`),
  KEY `idx_cea_booking` (`booking_id`),
  KEY `idx_cea_creator` (`creator_id`),
  CONSTRAINT `fk_cea_earning`
    FOREIGN KEY (`creator_earning_id`) REFERENCES `creator_earnings` (`creator_earning_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cea_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `stream_project_booking` (`stream_project_booking_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cea_creator`
    FOREIGN KEY (`creator_id`) REFERENCES `crew_members` (`crew_member_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `creator_earning_compensation_items` (
  `compensation_item_id` INT NOT NULL AUTO_INCREMENT,
  `creator_earning_id` INT NOT NULL,
  `booking_id` INT NOT NULL,
  `creator_id` INT NOT NULL,
  `item_label` VARCHAR(255) NOT NULL COMMENT 'e.g. Base Shoot Compensation, Parking, Travel Adjustment, Bonus',
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`compensation_item_id`),
  KEY `idx_ceci_earning` (`creator_earning_id`),
  KEY `idx_ceci_booking` (`booking_id`),
  KEY `idx_ceci_creator` (`creator_id`),
  CONSTRAINT `fk_ceci_earning`
    FOREIGN KEY (`creator_earning_id`) REFERENCES `creator_earnings` (`creator_earning_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ceci_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `stream_project_booking` (`stream_project_booking_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ceci_creator`
    FOREIGN KEY (`creator_id`) REFERENCES `crew_members` (`crew_member_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `creator_earning_timeline_events` (
  `timeline_event_id` INT NOT NULL AUTO_INCREMENT,
  `creator_earning_id` INT NOT NULL,
  `booking_id` INT NOT NULL,
  `creator_id` INT NOT NULL,
  `event_type` ENUM(
    'shoot_assigned',
    'shoot_accepted',
    'advance_payment_processed',
    'shoot_completed',
    'awaiting_finance_approval',
    'final_payment_processed'
  ) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `sub_label` VARCHAR(255) NULL,
  `amount` DECIMAL(10,2) NULL,
  `is_completed` TINYINT(1) NOT NULL DEFAULT 0,
  `event_date` DATETIME NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`timeline_event_id`),
  KEY `idx_cete_earning` (`creator_earning_id`),
  KEY `idx_cete_booking` (`booking_id`),
  KEY `idx_cete_creator` (`creator_id`),
  CONSTRAINT `fk_cete_earning`
    FOREIGN KEY (`creator_earning_id`) REFERENCES `creator_earnings` (`creator_earning_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cete_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `stream_project_booking` (`stream_project_booking_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cete_creator`
    FOREIGN KEY (`creator_id`) REFERENCES `crew_members` (`crew_member_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO creator_earnings 
(booking_id, creator_id, gross_amount, net_earning_amount, status, created_at, updated_at)
VALUES 
(1, 2010, 1200.00, 1200.00, 'pending', NOW(), NOW());



INSERT INTO creator_earnings 
(booking_id, creator_id, gross_amount, net_earning_amount, status, created_at, updated_at)
VALUES 
(480, 2010, 1200.00, 1200.00, 'pending', NOW(), NOW()),
(616, 2010, 1200.00, 1200.00, 'pending', NOW(), NOW()),
(622, 2010, 1200.00, 1200.00, 'paid', NOW(), NOW()),
(626, 2010, 1200.00, 1200.00, 'earned', NOW(), NOW());
-- 12-05-26

CREATE TABLE IF NOT EXISTS studios (
  studio_id INT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id INT NULL,
  host_name VARCHAR(255) NULL,
  host_email VARCHAR(255) NULL,
  studio_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255) NULL,
  slug VARCHAR(255) NULL,
  status ENUM('draft', 'active', 'inactive', 'pending_review', 'rejected') NOT NULL DEFAULT 'draft',
  verification_status ENUM('unverified', 'verified') NOT NULL DEFAULT 'unverified',
  space_type VARCHAR(100) NULL,
  description TEXT NULL,
  short_description VARCHAR(500) NULL,
  country VARCHAR(100) NULL,
  address_line1 VARCHAR(255) NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  latitude DECIMAL(10,8) NULL,
  longitude DECIMAL(11,8) NULL,
  timezone VARCHAR(64) NULL,
  hourly_rate DECIMAL(10,2) NULL,
  overtime_rate DECIMAL(10,2) NULL,
  minimum_booking_hours DECIMAL(5,2) NULL,
  buffer_time_minutes INT NULL,
  capacity_min INT NULL,
  capacity_max INT NULL,
  square_feet INT NULL,
  height VARCHAR(80) NULL,
  width VARCHAR(80) NULL,
  length VARCHAR(80) NULL,
  main_floor_number VARCHAR(80) NULL,
  overnight_stays_allowed BOOLEAN NOT NULL DEFAULT 0,
  security_recording_enabled BOOLEAN NOT NULL DEFAULT 0,
  security_recording_description TEXT NULL,
  wifi_name VARCHAR(255) NULL,
  wifi_password VARCHAR(255) NULL,
  preferred_age VARCHAR(80) NULL,
  parking_options JSON NULL,
  access_features JSON NULL,
  facility_features JSON NULL,
  supported_shoot_types JSON NULL,
  suggested_type VARCHAR(255) NULL,
  activities JSON NULL,
  space_basics JSON NULL,
  amenities JSON NULL,
  description_tags JSON NULL,
  house_rules JSON NULL,
  policies JSON NULL,
  pricing_settings JSON NULL,
  metadata JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_studios_slug (slug),
  INDEX idx_studios_status (status),
  INDEX idx_studios_city_state (city, state),
  INDEX idx_studios_owner (owner_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_media (
  studio_media_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  thumbnail_url TEXT NULL,
  title VARCHAR(255) NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_media_studio (studio_id),
  INDEX idx_studio_media_cover (studio_id, is_cover),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_operating_hours (
  studio_operating_hour_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday, ... 6=Saturday',
  is_open BOOLEAN NOT NULL DEFAULT 1,
  opens_at TIME NULL,
  closes_at TIME NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_studio_operating_day (studio_id, day_of_week),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_availability (
  studio_availability_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  availability_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  status ENUM('available', 'disabled', 'shoot_booked', 'conflict') NOT NULL DEFAULT 'available',
  notes TEXT NULL,
  metadata JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_availability_studio_date (studio_id, availability_date),
  INDEX idx_studio_availability_status (status),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_reviews (
  studio_review_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  reviewer_user_id INT NULL,
  reviewer_name VARCHAR(255) NULL,
  reviewer_avatar_url TEXT NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 5.0,
  cleanliness_rating DECIMAL(2,1) NULL,
  communication_rating DECIMAL(2,1) NULL,
  check_in_rating DECIMAL(2,1) NULL,
  review_text TEXT NULL,
  reviewed_at DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_reviews_studio (studio_id),
  INDEX idx_studio_reviews_user (reviewer_user_id),
  INDEX idx_studio_reviews_active (is_active),

  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_bookings (
  studio_booking_id INT PRIMARY KEY AUTO_INCREMENT,
  stream_project_booking_id INT NULL,
  studio_id INT NOT NULL,
  user_id INT NULL,

  booking_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  duration_hours DECIMAL(5,2) NULL,

  status ENUM('requested', 'confirmed', 'completed', 'cancelled', 'rejected') NOT NULL DEFAULT 'requested',

  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  overtime_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  source ENUM('manual', 'book_a_shoot') NOT NULL DEFAULT 'manual',
  metadata JSON NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_bookings_booking (stream_project_booking_id),
  INDEX idx_studio_bookings_studio (studio_id),
  INDEX idx_studio_bookings_user (user_id),
  INDEX idx_studio_bookings_date (booking_date),
  INDEX idx_studio_bookings_status (status),
  INDEX idx_studio_bookings_source (source),

  FOREIGN KEY (stream_project_booking_id)
    REFERENCES stream_project_booking(stream_project_booking_id)
    ON DELETE SET NULL,

  FOREIGN KEY (studio_id)
    REFERENCES studios(studio_id)
    ON DELETE CASCADE,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `studios` ADD `parking_description` TEXT NULL AFTER `parking_options`;

-- 11-06-26
-- Rename Creative Partner permission keys from old crew_* keys.
-- Keeps existing permission_id values, so role_permissions and user_permissions remain linked.
UPDATE permissions
SET
  module_key = REPLACE(module_key, 'crew_', 'creative_partner_'),
  permission_key = REPLACE(permission_key, 'crew_', 'creative_partner_')
WHERE module_key LIKE 'crew_%'
  OR permission_key LIKE 'crew_%';

ALTER TABLE permissions
ADD COLUMN role_key VARCHAR(100) NULL AFTER permission_id;

UPDATE permissions SET role_key = 'admin'
WHERE module_key LIKE 'admin_%';

UPDATE permissions SET role_key = 'creative_partner'
WHERE module_key LIKE 'creative_partner_%';

UPDATE permissions SET role_key = 'sales_rep'
WHERE module_key LIKE 'sales_rep_%';

UPDATE permissions SET role_key = 'sales_admin'
WHERE module_key LIKE 'sales_admin_%';

UPDATE permissions SET role_key = 'production_manager'
WHERE module_key LIKE 'production_manager_%';

UPDATE permissions SET role_key = 'client'
WHERE module_key LIKE 'client_%';

-- 17-06-26

ALTER TABLE users ADD COLUMN permissions_version INT DEFAULT 1;

-- 22-06-26

ALTER TABLE `sales_quotes`
  ADD COLUMN `booking_type` ENUM('single_day','multi_day') NULL AFTER `video_shoot_type`,
  ADD COLUMN `time_zone` VARCHAR(64) NULL AFTER `booking_type`,
  ADD COLUMN `start_date` DATE NULL AFTER `time_zone`,
  ADD COLUMN `start_time` TIME NULL AFTER `start_date`,
  ADD COLUMN `end_time` TIME NULL AFTER `start_time`,
  ADD COLUMN `booking_days` TEXT NULL AFTER `end_time`;

-- 23-06-26

ALTER TABLE `permissions` DROP INDEX `idx_permissions_role_id`;
ALTER TABLE `permissions` DROP INDEX `unique_role_permission_key`;
ALTER TABLE revurge.permissions DROP FOREIGN KEY fk_permissions_role_id;
ALTER TABLE `permissions` DROP `role_id`;

-- 24-06-26

-- Add a Super Admin role for role and permission management.
SET @super_admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) IN ('super_admin', 'superadmin')
  LIMIT 1
);

INSERT INTO user_type (user_role, description, is_active)
SELECT 'super_admin', 'Full system access', 1
WHERE @super_admin_role_id IS NULL;

SET @super_admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) IN ('super_admin', 'superadmin')
  LIMIT 1
);

UPDATE user_type
SET is_active = 1
WHERE user_type_id = @super_admin_role_id;

SET @admin_role_id = (
  SELECT user_type_id
  FROM user_type
  WHERE LOWER(REPLACE(user_role, ' ', '_')) = 'admin'
  LIMIT 1
);

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT @super_admin_role_id, rp.permission_id, 1
FROM role_permissions rp
WHERE rp.role_id = @admin_role_id
  AND rp.is_active = 1
  AND @super_admin_role_id IS NOT NULL
  AND @admin_role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing.role_id = @super_admin_role_id
      AND existing.permission_id = rp.permission_id
  );

ALTER TABLE `affiliates` ADD `is_active` INT NOT NULL DEFAULT '1' AFTER `updated_at`;
 
 -- 25-06-26

 ALTER TABLE clients
  ADD COLUMN archived_at DATETIME NULL,
  ADD COLUMN archived_by_user_id INT NULL,
  ADD COLUMN archive_reason VARCHAR(255) NULL,
  ADD COLUMN restored_at DATETIME NULL,
  ADD COLUMN restored_by_user_id INT NULL;

CREATE TABLE IF NOT EXISTS user_archive_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(50) NOT NULL,
  target_id INT NOT NULL,
  user_id INT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NULL,
  performed_by_user_id INT NOT NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(100) NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_archive_history_target (target_type, target_id),
  INDEX idx_archive_history_user (user_id),
  INDEX idx_archive_history_action (action),
  INDEX idx_archive_history_created_at (created_at),
  CONSTRAINT fk_user_archive_history_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_archive_history_performed_by
    FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- 26-06-26

ALTER TABLE creator_earnings
  ADD COLUMN approval_status ENUM('draft', 'pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'draft' AFTER status,
  ADD COLUMN compensation_source ENUM('system', 'sales_admin', 'admin') NOT NULL DEFAULT 'system' AFTER approval_status,
  ADD COLUMN compensation_method ENUM('equal_split', 'role_based', 'manual') NULL AFTER compensation_source,
  ADD COLUMN submitted_by_user_id INT NULL AFTER compensation_method,
  ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by_user_id,
  ADD COLUMN approved_by_user_id INT NULL AFTER submitted_at,
  ADD COLUMN approved_at DATETIME NULL AFTER approved_by_user_id,
  ADD COLUMN rejected_by_user_id INT NULL AFTER approved_at,
  ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by_user_id,
  ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at,
  ADD COLUMN approval_notes TEXT NULL AFTER rejection_reason,
  ADD INDEX idx_creator_earnings_approval_status (approval_status),
  ADD INDEX idx_creator_earnings_compensation_source (compensation_source);
-- 01-07-26

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS requested_amount DECIMAL(10, 2) NULL AFTER discount_code_id;

--03-07-26
ALTER TABLE stream_project_booking
  ADD COLUMN start_date_time VARCHAR(50) NULL,
  ADD COLUMN end_date_time VARCHAR(50) NULL;

-- 07-07-26

ALTER TABLE `project_meetings`
  ADD COLUMN `google_calendar_event_id` VARCHAR(255) NULL AFTER `meet_link`,
  ADD COLUMN `google_calendar_id` VARCHAR(255) NULL DEFAULT 'primary' AFTER `google_calendar_event_id`;

-- 16-07-26

ALTER TABLE `sales_quote_line_items` CHANGE `item_name` `item_name` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;
