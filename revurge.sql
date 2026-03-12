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