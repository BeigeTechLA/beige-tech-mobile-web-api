ALTER TABLE clients
  ADD COLUMN archived_at DATETIME NULL,
  ADD COLUMN archived_by_user_id INT NULL,
  ADD COLUMN archive_reason VARCHAR(255) NULL,
  ADD COLUMN restored_at DATETIME NULL,
  ADD COLUMN restored_by_user_id INT NULL;

CREATE TABLE IF NOT EXISTS user_archive_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  target_type VARCHAR(50) NOT NULL,
  target_id INT NOT NULL,
  user_id INT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NULL,
  performed_by_user_id INT NOT NULL,
  performed_by_name VARCHAR(255) NULL,
  performed_by_role VARCHAR(100) NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_archive_history_target (target_type, target_id),
  INDEX idx_archive_history_user (user_id),
  INDEX idx_archive_history_action (action),
  INDEX idx_archive_history_created_at (created_at),
  CONSTRAINT fk_user_archive_history_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_archive_history_performed_by
    FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
