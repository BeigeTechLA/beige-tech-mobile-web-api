-- Agreement module refactor: General Agreement acceptance cleanup and booking-based Shoot Agreements.
-- Run once on a database that still has the original agreement schema.

-- General agreements are membership agreements, not project agreements.
ALTER TABLE cp_general_agreement_acceptance
  DROP COLUMN project_id,
  DROP COLUMN role,
  ADD COLUMN sent_at DATETIME NULL AFTER accepted_at;

UPDATE cp_general_agreement_acceptance
SET sent_at = created_at
WHERE sent_at IS NULL;

ALTER TABLE cp_general_agreement_acceptance
  MODIFY COLUMN sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_cp_general_acceptance_version_status
  ON cp_general_agreement_acceptance(agreement_version_id, status);

-- Replace the deprecated manual shoot_requests flow with booking-based agreements.
ALTER TABLE shoot_agreements
  DROP FOREIGN KEY fk_shoot_agreements_request,
  DROP FOREIGN KEY fk_shoot_agreements_cp,
  DROP INDEX uq_shoot_agreements_assignment_id,
  DROP COLUMN shoot_request_id,
  DROP COLUMN assignment_id,
  DROP COLUMN creative_partner_id,
  DROP COLUMN role,
  DROP COLUMN compensation,
  DROP COLUMN production_date,
  DROP COLUMN location,
  DROP COLUMN call_time,
  DROP COLUMN expected_end_time,
  DROP COLUMN scope_of_services,
  DROP COLUMN equipment_requirements,
  DROP COLUMN deliverables,
  DROP COLUMN approved_expenses,
  DROP COLUMN special_instructions,
  MODIFY COLUMN status ENUM('draft', 'sent', 'accepted', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'draft',
  ADD COLUMN booking_id INT NULL AFTER id,
  ADD COLUMN agreement_mode ENUM('individual', 'common') NOT NULL DEFAULT 'individual' AFTER booking_id,
  ADD CONSTRAINT fk_shoot_agreements_booking FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE RESTRICT;

ALTER TABLE shoot_agreement_versions
  DROP COLUMN compensation,
  DROP COLUMN status,
  ADD COLUMN project_snapshot JSON NULL AFTER version_number;

CREATE TABLE shoot_agreement_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_agreement_version_id INT NOT NULL,
  section_order INT NOT NULL,
  section_title VARCHAR(255) NOT NULL,
  section_body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shoot_agreement_sections_version FOREIGN KEY (shoot_agreement_version_id) REFERENCES shoot_agreement_versions(id) ON DELETE CASCADE,
  INDEX idx_shoot_agreement_sections_version (shoot_agreement_version_id)
);

CREATE TABLE shoot_agreement_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_agreement_id INT NOT NULL,
  crew_member_id INT NOT NULL,
  assigned_crew_id INT NOT NULL,
  role_snapshot TEXT NULL,
  compensation_snapshot DECIMAL(12,2) NOT NULL,
  compensation_items_snapshot JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shoot_agreement_recipients_agreement FOREIGN KEY (shoot_agreement_id) REFERENCES shoot_agreements(id) ON DELETE CASCADE,
  CONSTRAINT fk_shoot_agreement_recipients_cp FOREIGN KEY (crew_member_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_shoot_agreement_recipients_assignment FOREIGN KEY (assigned_crew_id) REFERENCES assigned_crew(id),
  UNIQUE KEY uq_shoot_agreement_recipient (shoot_agreement_id, crew_member_id),
  INDEX idx_shoot_agreement_recipients_cp (crew_member_id),
  INDEX idx_shoot_agreement_recipients_active (shoot_agreement_id, is_active)
);

CREATE TABLE shoot_agreement_acceptances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shoot_agreement_recipient_id INT NOT NULL,
  shoot_agreement_version_id INT NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME NULL,
  rejected_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shoot_agreement_acceptances_recipient FOREIGN KEY (shoot_agreement_recipient_id) REFERENCES shoot_agreement_recipients(id) ON DELETE CASCADE,
  CONSTRAINT fk_shoot_agreement_acceptances_version FOREIGN KEY (shoot_agreement_version_id) REFERENCES shoot_agreement_versions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_shoot_agreement_acceptance_recipient_version (shoot_agreement_recipient_id, shoot_agreement_version_id),
  INDEX idx_shoot_agreement_acceptances_version_status (shoot_agreement_version_id, status)
);

-- A recipient's role and compensation are immutable for each agreement version.
CREATE TABLE shoot_agreement_version_recipients (
  id INT NOT NULL AUTO_INCREMENT,
  shoot_agreement_version_id INT NOT NULL,
  shoot_agreement_recipient_id INT NOT NULL,
  crew_member_id INT NOT NULL,
  assigned_crew_id INT NOT NULL,
  role_snapshot TEXT NULL,
  compensation_snapshot DECIMAL(12,2) NOT NULL,
  compensation_items_snapshot JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shoot_agreement_version_recipient (shoot_agreement_version_id, shoot_agreement_recipient_id),
  KEY idx_shoot_agreement_version_recipients_crew (crew_member_id),
  CONSTRAINT fk_shoot_agreement_version_recipients_version FOREIGN KEY (shoot_agreement_version_id) REFERENCES shoot_agreement_versions(id),
  CONSTRAINT fk_shoot_agreement_version_recipients_recipient FOREIGN KEY (shoot_agreement_recipient_id) REFERENCES shoot_agreement_recipients(id),
  CONSTRAINT fk_shoot_agreement_version_recipients_crew FOREIGN KEY (crew_member_id) REFERENCES crew_members(crew_member_id),
  CONSTRAINT fk_shoot_agreement_version_recipients_assignment FOREIGN KEY (assigned_crew_id) REFERENCES assigned_crew(id)
);

DROP TABLE shoot_requests;
