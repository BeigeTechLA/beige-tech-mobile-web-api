ALTER TABLE creator_earnings
  ADD COLUMN cp_payment_due_email_sent_at DATETIME NULL AFTER earned_at,
  ADD COLUMN cp_payment_due_7_days_email_sent_at DATETIME NULL AFTER cp_payment_due_email_sent_at,
  ADD COLUMN cp_payment_overdue_1_day_email_sent_at DATETIME NULL AFTER cp_payment_due_7_days_email_sent_at,
  ADD COLUMN cp_payment_overdue_3_days_email_sent_at DATETIME NULL AFTER cp_payment_overdue_1_day_email_sent_at;
