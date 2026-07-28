ALTER TABLE creator_earnings
  ADD COLUMN approval_status ENUM('draft', 'pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'draft' AFTER status,
  ADD COLUMN compensation_source ENUM('system', 'sales_admin', 'admin') NOT NULL DEFAULT 'system' AFTER approval_status,
  ADD COLUMN compensation_method ENUM('equal_split', 'role_based', 'manual') NULL AFTER compensation_source,
  ADD COLUMN submitted_by_user_id INT NULL AFTER compensation_method,
  ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by_user_id,
  ADD COLUMN approved_by_user_id INT NULL AFTER submitted_at,
  ADD COLUMN approved_at DATETIME NULL AFTER approved_by_user_id,
  ADD COLUMN rejected_by_user_id INT NULL AFTER approved_at,
  ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by_user_id,
  ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at,
  ADD COLUMN approval_notes TEXT NULL AFTER rejection_reason,
  ADD INDEX idx_creator_earnings_approval_status (approval_status),
  ADD INDEX idx_creator_earnings_compensation_source (compensation_source);
