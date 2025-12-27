-- Migration: Add payment tracking fields to stream_project_booking
-- Date: 2025-12-27
-- Purpose: Track payment completion on bookings

-- Add payment_id column to link booking to payment transaction
ALTER TABLE stream_project_booking
ADD COLUMN IF NOT EXISTS payment_id INT NULL,
ADD COLUMN IF NOT EXISTS payment_completed_at DATETIME NULL;

-- Add foreign key constraint (optional, comment out if payment_transactions doesn't exist yet)
-- ALTER TABLE stream_project_booking
-- ADD CONSTRAINT fk_booking_payment 
-- FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id);

-- Add index for faster lookups
ALTER TABLE stream_project_booking
ADD INDEX IF NOT EXISTS idx_booking_payment_id (payment_id);

