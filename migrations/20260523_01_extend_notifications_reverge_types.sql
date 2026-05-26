ALTER TABLE `notifications_reverge`
  MODIFY `type` ENUM(
    'book_a_shoot',
    'quote_approval',
    'quote_rejected',
    'cp_booking_request',
    'cp_request_approved',
    'cp_request_rejected',
    'cp_accepted',
    'cp_rejected'
  ) NOT NULL;
