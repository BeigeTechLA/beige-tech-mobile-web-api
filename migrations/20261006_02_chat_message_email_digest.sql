-- Apply before deploying the six-hour chat-message email digest job.
CREATE TABLE IF NOT EXISTS `chat_message_email_digests` (
  `chat_room_id` VARCHAR(191) NOT NULL,
  `last_message_at` DATETIME(3) NOT NULL,
  `last_email_sent_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`chat_room_id`),
  KEY `idx_chat_message_email_digests_last_email_sent_at` (`last_email_sent_at`)
);
