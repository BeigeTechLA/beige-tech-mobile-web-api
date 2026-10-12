-- Immutable Creative Partner agreement records. Apply once per environment.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS agreement_templates (
  agreement_template_id INT NOT NULL AUTO_INCREMENT,
  agreement_type ENUM('general','shoot') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  content_html LONGTEXT NOT NULL,
  content_json LONGTEXT NULL,
  version VARCHAR(50) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  status ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  effective_at DATETIME NULL,
  published_at DATETIME NULL,
  published_by_user_id INT NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agreement_template_id),
  UNIQUE KEY uq_agreement_template_type_version (agreement_type, version),
  KEY idx_agreement_templates_type_status (agreement_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agreement_documents (
  agreement_document_id INT NOT NULL AUTO_INCREMENT,
  agreement_type ENUM('general','shoot') NOT NULL,
  agreement_template_id INT NULL,
  creator_id INT NULL,
  booking_id INT NULL,
  assignment_id INT NULL,
  creator_earning_id INT NULL,
  parent_document_id INT NULL,
  version_no INT NOT NULL DEFAULT 1,
  display_version VARCHAR(50) NOT NULL,
  status ENUM('draft','pending_acceptance','accepted','rejected','cancelled','expired') NOT NULL DEFAULT 'draft',
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  content_html LONGTEXT NOT NULL,
  content_json LONGTEXT NULL,
  content_hash CHAR(64) NOT NULL,
  snapshot_json LONGTEXT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  compensation_amount DECIMAL(12,2) NULL,
  sent_at DATETIME NULL,
  due_at DATETIME NULL,
  responded_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_by_user_id INT NULL,
  sent_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agreement_document_id),
  KEY idx_agreement_documents_creator (creator_id, agreement_type, status),
  KEY idx_agreement_documents_assignment (assignment_id, is_current),
  KEY idx_agreement_documents_booking (booking_id),
  KEY idx_agreement_documents_template (agreement_template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agreement_responses (
  agreement_response_id INT NOT NULL AUTO_INCREMENT,
  agreement_document_id INT NOT NULL,
  creator_id INT NOT NULL,
  action ENUM('accepted','rejected') NOT NULL,
  accepted_terms TINYINT(1) NOT NULL DEFAULT 0,
  signer_name VARCHAR(255) NULL,
  rejection_reason VARCHAR(100) NULL,
  comments TEXT NULL,
  content_hash_at_response CHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  responded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agreement_response_id),
  UNIQUE KEY uq_agreement_response_document (agreement_document_id),
  KEY idx_agreement_responses_creator (creator_id, responded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agreement_events (
  agreement_event_id INT NOT NULL AUTO_INCREMENT,
  agreement_document_id INT NOT NULL,
  actor_user_id INT NULL,
  actor_creator_id INT NULL,
  event_type VARCHAR(80) NOT NULL,
  metadata_json LONGTEXT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agreement_event_id),
  KEY idx_agreement_events_document (agreement_document_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO permissions (role_key, module_key, action_key, permission_key, is_active)
VALUES
  ('admin', 'admin_agreements', 'view', 'admin_agreements.view', 1),
  ('admin', 'admin_agreements', 'create', 'admin_agreements.create', 1),
  ('admin', 'admin_agreements', 'edit', 'admin_agreements.edit', 1),
  ('admin', 'admin_agreements', 'send', 'admin_agreements.send', 1),
  ('admin', 'admin_agreements', 'cancel', 'admin_agreements.cancel', 1)
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO role_permissions (role_id, permission_id, is_active)
SELECT DISTINCT rp.role_id, p_new.permission_id, 1
FROM role_permissions rp
JOIN permissions p_old ON p_old.permission_id = rp.permission_id
JOIN permissions p_new ON p_new.module_key = 'admin_agreements' AND p_new.is_active = 1
WHERE p_old.module_key = 'admin_shoots' AND p_old.is_active = 1 AND rp.is_active = 1
ON DUPLICATE KEY UPDATE is_active = 1;

UPDATE users user
JOIN (
  SELECT DISTINCT rp.role_id
  FROM role_permissions rp
  JOIN permissions p ON p.permission_id = rp.permission_id
  WHERE p.module_key = 'admin_agreements' AND rp.is_active = 1
) granted_role ON granted_role.role_id = user.user_type
SET user.permissions_version = user.permissions_version + 1;

COMMIT;
