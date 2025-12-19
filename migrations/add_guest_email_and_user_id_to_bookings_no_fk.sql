-- Migration: Add guest_email and user_id to stream_project_booking (No FK constraint)
-- Date: 2025-12-19
-- Purpose: Support guest bookings with email tracking and link authenticated user bookings

-- Add user_id column
ALTER TABLE `stream_project_booking`
ADD COLUMN `user_id` INT DEFAULT NULL AFTER `stream_project_booking_id`,
ADD INDEX `idx_user_id` (`user_id`);

-- Add guest_email column for guest bookings (when user_id is NULL)
ALTER TABLE `stream_project_booking`
ADD COLUMN `guest_email` VARCHAR(255) DEFAULT NULL AFTER `user_id`,
ADD INDEX `idx_guest_email` (`guest_email`);

-- Add comment
ALTER TABLE `stream_project_booking`
COMMENT = 'Project bookings - supports both authenticated (user_id) and guest (guest_email) bookings';
