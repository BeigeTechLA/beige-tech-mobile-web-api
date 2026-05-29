CREATE TABLE IF NOT EXISTS `project_note_attachments` (
  `attachment_id` INT NOT NULL AUTO_INCREMENT,
  `note_id` INT NOT NULL,
  `uploaded_by_user_id` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) DEFAULT NULL,
  `file_size_bytes` BIGINT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`attachment_id`),
  KEY `idx_project_note_attachments_note` (`note_id`),
  KEY `idx_project_note_attachments_uploaded_by` (`uploaded_by_user_id`),
  KEY `idx_project_note_attachments_created_at` (`created_at`),
  CONSTRAINT `fk_project_note_attachments_note`
    FOREIGN KEY (`note_id`) REFERENCES `project_notes` (`note_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_note_attachments_uploaded_by`
    FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
