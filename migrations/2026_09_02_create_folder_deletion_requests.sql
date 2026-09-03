-- Migration: 2026-09-02
-- Adds folder_deletion_requests table for File Manager delete-approval workflow.
-- This schema follows the existing MySQL/BIGINT File Manager tables in this API.

CREATE TABLE IF NOT EXISTS folder_deletion_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  folder_id VARCHAR(1024) NOT NULL,
  folder_id_hash CHAR(64) AS (SHA2(folder_id, 256)) STORED,
  pending_folder_id_hash CHAR(64) AS (
    CASE WHEN status = 'pending' THEN SHA2(folder_id, 256) ELSE NULL END
  ) STORED,
  title VARCHAR(255) NOT NULL,
  requested_by_user_id INT(11) NOT NULL,
  project_id VARCHAR(128) DEFAULT NULL,
  event_id VARCHAR(128) DEFAULT NULL,
  reason VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  status ENUM('pending', 'approved', 'rejected', 'completed') NOT NULL DEFAULT 'pending',
  file_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INT(11) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  reject_reason TEXT DEFAULT NULL,
  audit_log JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_folder_deletion_requests_status (status),
  KEY idx_folder_deletion_requests_folder (folder_id_hash),
  KEY idx_folder_deletion_requests_requested_by (requested_by_user_id),
  KEY idx_folder_deletion_requests_requested_at (requested_at),
  UNIQUE KEY uq_folder_deletion_requests_pending_folder (pending_folder_id_hash),
  CONSTRAINT fk_folder_deletion_requests_requested_by
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_folder_deletion_requests_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;