-- Migration: Create payments and waitlist tables
-- Date: 2025-12-16

-- Create payments table
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` INT NOT NULL AUTO_INCREMENT,
  `booking_id` INT NOT NULL,
  `user_id` INT DEFAULT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `stripe_transaction_id` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  `confirmation_number` VARCHAR(50) DEFAULT NULL UNIQUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  INDEX `idx_booking_id` (`booking_id`),
  INDEX `idx_user_id` (`user_id`),
  UNIQUE INDEX `idx_confirmation_number` (`confirmation_number`),
  CONSTRAINT `fk_payments_booking`
    FOREIGN KEY (`booking_id`)
    REFERENCES `stream_project_booking` (`stream_project_booking_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create waitlist table
CREATE TABLE IF NOT EXISTS `waitlist` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `company` VARCHAR(255) DEFAULT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('pending', 'contacted', 'converted', 'inactive') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comments to tables
ALTER TABLE `payments` COMMENT = 'Payment transactions and booking confirmations';
ALTER TABLE `waitlist` COMMENT = 'Waitlist entries for early access and notifications';
