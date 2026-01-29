-- =====================================================
-- Projects Table Migration
-- Main project entity for post-shoot workflow management
-- Links to stream_project_booking and tracks 18-state workflow
-- =====================================================

CREATE TABLE IF NOT EXISTS projects (
    project_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL COMMENT 'FK to stream_project_booking',
    project_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique identifier like PRJ-2026-001',
    project_name VARCHAR(255) NOT NULL,

    -- Current state tracking (18 possible states)
    current_state ENUM(
        'RAW_UPLOADED',
        'RAW_TECH_QC_PENDING',
        'RAW_TECH_QC_REJECTED',
        'RAW_TECH_QC_APPROVED',
        'COVERAGE_REVIEW_PENDING',
        'COVERAGE_REJECTED',
        'EDIT_APPROVAL_PENDING',
        'EDIT_IN_PROGRESS',
        'INTERNAL_EDIT_REVIEW_PENDING',
        'CLIENT_PREVIEW_READY',
        'CLIENT_FEEDBACK_RECEIVED',
        'FEEDBACK_INTERNAL_REVIEW',
        'REVISION_IN_PROGRESS',
        'REVISION_QC_PENDING',
        'FINAL_EXPORT_PENDING',
        'READY_FOR_DELIVERY',
        'DELIVERED',
        'PROJECT_CLOSED'
    ) NOT NULL DEFAULT 'RAW_UPLOADED',
    state_changed_at TIMESTAMP NULL DEFAULT NULL,

    -- User references
    client_user_id INT NOT NULL COMMENT 'FK to users - client who owns this project',
    assigned_creator_id INT DEFAULT NULL COMMENT 'FK to users - assigned creator/videographer',
    assigned_editor_id INT DEFAULT NULL COMMENT 'FK to users - assigned editor',
    assigned_qc_id INT DEFAULT NULL COMMENT 'FK to users - assigned QC reviewer',

    -- Deadlines
    raw_upload_deadline DATETIME DEFAULT NULL,
    edit_delivery_deadline DATETIME DEFAULT NULL,
    final_delivery_deadline DATETIME DEFAULT NULL,

    -- Project metadata
    project_notes TEXT DEFAULT NULL COMMENT 'Internal admin notes',
    client_requirements TEXT DEFAULT NULL COMMENT 'Client-provided requirements from booking',
    total_raw_size_bytes BIGINT DEFAULT 0 COMMENT 'Total size of RAW footage uploaded',
    total_files_count INT DEFAULT 0 COMMENT 'Total number of files in project',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE RESTRICT,
    FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_editor_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_qc_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_projects_booking ON projects(booking_id);
CREATE INDEX idx_projects_client ON projects(client_user_id);
CREATE INDEX idx_projects_current_state ON projects(current_state);
CREATE INDEX idx_projects_creator ON projects(assigned_creator_id);
CREATE INDEX idx_projects_editor ON projects(assigned_editor_id);
CREATE INDEX idx_projects_state_changed ON projects(state_changed_at);
CREATE INDEX idx_projects_created_at ON projects(created_at);
