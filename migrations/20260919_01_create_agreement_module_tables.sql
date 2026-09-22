-- =====================================================
-- Agreement Module Tables
-- General agreements, shoot requests, assignment agreements, and audit history
-- =====================================================

CREATE TABLE IF NOT EXISTS agreements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agreement_name VARCHAR(255) NOT NULL,
  agreement_title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  effective_date DATE NOT NULL,
  current_version_id INT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  created_by INT NOT NULL COMMENT 'Admin user that created the agreement',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agreements_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_agreements_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agreement_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agreement_id INT NOT NULL COMMENT 'FK to agreements',
  version_number VARCHAR(20) NOT NULL,
  effective_date DATE NOT NULL,
  created_by INT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agreement_versions_agreement FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE,
  CONSTRAINT fk_agreement_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_agreement_versions_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agreement_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agreement_version_id INT NOT NULL,
  section_order INT NOT NULL,
  section_title VARCHAR(255) NOT NULL,
  section_body TEXT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agreement_sections_version FOREIGN KEY (agreement_version_id) REFERENCES agreement_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agreement_sections_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cp_general_agreement_acceptance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  creative_partner_id INT NOT NULL,
  agreement_version_id INT NOT NULL,
  project_id INT NULL,
  role VARCHAR(100) NULL,
  status ENUM('pending', 'accepted', 'rejected', 'not_accepted', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
  accepted_at DATETIME NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cp_general_acceptance_cp FOREIGN KEY (creative_partner_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_cp_general_acceptance_version FOREIGN KEY (agreement_version_id) REFERENCES agreement_versions(id),
  CONSTRAINT fk_cp_general_acceptance_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shoot_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  project_id VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NULL,
  creative_partner_id INT NOT NULL,
  role VARCHAR(100) NOT NULL,
  shoot_type VARCHAR(100) NULL,
  compensation_offer DECIMAL(10,2) NULL,
  production_date DATE NULL,
  location VARCHAR(255) NULL,
  status ENUM('pending', 'confirmed', 'completed', 'declined') NOT NULL DEFAULT 'pending',
  created_by INT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shoot_requests_project_id (project_id),
  CONSTRAINT fk_shoot_requests_cp FOREIGN KEY (creative_partner_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_shoot_requests_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_shoot_requests_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shoot_agreements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_request_id INT NOT NULL,
  assignment_id VARCHAR(100) NOT NULL,
  creative_partner_id INT NOT NULL,
  role VARCHAR(100) NOT NULL,
  compensation DECIMAL(10,2) NOT NULL,
  production_date DATE NULL,
  location VARCHAR(255) NULL,
  call_time TIME NULL,
  expected_end_time TIME NULL,
  scope_of_services TEXT NULL,
  equipment_requirements TEXT NULL,
  deliverables TEXT NULL,
  approved_expenses TEXT NULL,
  special_instructions TEXT NULL,
  current_version_id INT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  created_by INT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shoot_agreements_assignment_id (assignment_id),
  CONSTRAINT fk_shoot_agreements_request FOREIGN KEY (shoot_request_id) REFERENCES shoot_requests(id),
  CONSTRAINT fk_shoot_agreements_cp FOREIGN KEY (creative_partner_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_shoot_agreements_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_shoot_agreements_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shoot_agreement_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_agreement_id INT NOT NULL,
  version_number VARCHAR(20) NOT NULL,
  compensation DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  snapshot JSON NOT NULL,
  created_by INT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shoot_agreement_versions_agreement FOREIGN KEY (shoot_agreement_id) REFERENCES shoot_agreements(id) ON DELETE CASCADE,
  CONSTRAINT fk_shoot_agreement_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_shoot_agreement_versions_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agreement_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agreement_type ENUM('general', 'shoot') NOT NULL,
  agreement_ref_id INT NOT NULL COMMENT 'Agreement or shoot agreement identifier',
  version_number VARCHAR(20) NULL,
  actor_type ENUM('admin', 'cp') NOT NULL,
  actor_id INT NOT NULL,
  action VARCHAR(255) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  deleted_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agreement_activity_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  CONSTRAINT fk_agreement_activity_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE agreements ADD CONSTRAINT fk_agreements_current_version FOREIGN KEY (current_version_id) REFERENCES agreement_versions(id) ON DELETE SET NULL;
ALTER TABLE shoot_agreements ADD CONSTRAINT fk_shoot_agreements_current_version FOREIGN KEY (current_version_id) REFERENCES shoot_agreement_versions(id) ON DELETE SET NULL;
CREATE INDEX idx_agreement_versions_agreement ON agreement_versions(agreement_id);
CREATE INDEX idx_agreement_sections_version ON agreement_sections(agreement_version_id);
CREATE INDEX idx_cp_general_acceptance_cp ON cp_general_agreement_acceptance(creative_partner_id);
CREATE INDEX idx_cp_general_acceptance_version ON cp_general_agreement_acceptance(agreement_version_id);
CREATE INDEX idx_shoot_requests_cp ON shoot_requests(creative_partner_id);
CREATE INDEX idx_shoot_requests_status ON shoot_requests(status);
CREATE INDEX idx_shoot_agreements_request ON shoot_agreements(shoot_request_id);
CREATE INDEX idx_shoot_agreements_cp_status ON shoot_agreements(creative_partner_id, status);
CREATE INDEX idx_shoot_agreement_versions_agreement ON shoot_agreement_versions(shoot_agreement_id);
CREATE INDEX idx_agreement_activity_reference ON agreement_activity_log(agreement_type, agreement_ref_id);