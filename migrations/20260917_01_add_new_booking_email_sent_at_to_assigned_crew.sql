ALTER TABLE assigned_crew
  ADD COLUMN new_booking_email_sent_at DATETIME NULL AFTER responded_at;
