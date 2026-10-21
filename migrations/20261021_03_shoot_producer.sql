ALTER TABLE stream_project_booking
  ADD COLUMN producer_user_id INT NULL,
  ADD INDEX idx_stream_project_booking_producer_user_id (producer_user_id);
