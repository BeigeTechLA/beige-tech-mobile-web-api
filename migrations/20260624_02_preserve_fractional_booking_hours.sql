-- Pricing supports quarter/half-hour shoots; integer storage changes totals.
ALTER TABLE stream_project_booking
  MODIFY COLUMN duration_hours DECIMAL(5,2) NULL;

ALTER TABLE stream_project_booking_days
  MODIFY COLUMN duration_hours DECIMAL(5,2) NULL;
