-- Create investors table for investor interest submissions
-- Run this migration: mysql -u username -p database_name < migrations/create_investors_table.sql

CREATE TABLE IF NOT EXISTS `investors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone_number` VARCHAR(50),
  `country` VARCHAR(100),
  `investment_rounds` VARCHAR(50) COMMENT 'pre-seed, seed, series-a, series-b',
  `investment_timing` VARCHAR(50) COMMENT 'immediately, 1-3-months, 3-6-months, 6-months-plus',
  `investment_amount` VARCHAR(50) COMMENT '10k-50k, 50k-100k, 100k-500k, 500k-plus',
  `status` ENUM('pending', 'contacted', 'converted', 'declined') NOT NULL DEFAULT 'pending',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


