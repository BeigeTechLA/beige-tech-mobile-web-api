CREATE TABLE IF NOT EXISTS account_deletion_requests (
  request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(32) NULL,
  user_id INT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'Web',
  verification_status VARCHAR(20) NOT NULL DEFAULT 'Verified',
  status VARCHAR(32) NOT NULL DEFAULT 'Pending Deletion',
  cancelled_by VARCHAR(16) NULL,
  cancelled_at DATETIME NULL,
  verified_at DATETIME NULL,
  completed_at DATETIME NULL,
  requested_at DATETIME NOT NULL,
  scheduled_deletion_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_deletion_request_code (request_code),
  KEY idx_account_deletion_request_user (user_id),
  KEY idx_account_deletion_request_status_date (status, scheduled_deletion_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
