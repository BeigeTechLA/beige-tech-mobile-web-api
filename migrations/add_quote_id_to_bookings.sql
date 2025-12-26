-- Migration: Add quote_id to stream_project_booking table
-- This links bookings to pricing quotes from the new pricing catalog system

-- Add quote_id column to stream_project_booking table
ALTER TABLE stream_project_booking
ADD COLUMN quote_id INT NULL AFTER user_id,
ADD CONSTRAINT fk_booking_quote FOREIGN KEY (quote_id) REFERENCES quotes(quote_id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_booking_quote_id ON stream_project_booking(quote_id);

-- Verification query (run after migration)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stream_project_booking' AND COLUMN_NAME = 'quote_id';

