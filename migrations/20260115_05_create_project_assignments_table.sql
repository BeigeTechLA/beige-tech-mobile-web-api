-- =====================================================
-- Project Assignments Table Migration
-- Tracks creator, editor, QC assignments and workload
-- Assignment status and time tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS project_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL COMMENT 'FK to projects',

    -- Assignment details
    role_type ENUM('CREATOR', 'EDITOR', 'QC_REVIEWER', 'ADMIN') NOT NULL,
    assigned_user_id INT NOT NULL COMMENT 'FK to users - person assigned this role',
    assigned_by_user_id INT NOT NULL COMMENT 'FK to users - admin who made the assignment',

    -- Assignment status
    status ENUM(
        'PENDING_ACCEPTANCE',
        'ACCEPTED',
        'DECLINED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING_ACCEPTANCE',

    -- Time tracking
    estimated_hours DECIMAL(5,2) DEFAULT NULL COMMENT 'Estimated time for this assignment',
    actual_hours DECIMAL(5,2) DEFAULT NULL COMMENT 'Actual time spent (self-reported or tracked)',
    started_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,

    -- Acceptance/Decline
    response_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When user accepted/declined',
    response_notes TEXT DEFAULT NULL COMMENT 'Reason for declining or acceptance notes',

    -- Assignment metadata
    assignment_notes TEXT DEFAULT NULL COMMENT 'Instructions from admin',
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') DEFAULT 'NORMAL',
    deadline DATETIME DEFAULT NULL COMMENT 'Specific deadline for this assignment',

    -- Compensation (if applicable)
    agreed_rate DECIMAL(10,2) DEFAULT NULL COMMENT 'Agreed payment for this assignment',
    rate_type ENUM('FLAT', 'HOURLY', 'PROJECT') DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Indexes for performance
CREATE INDEX idx_assignments_project ON project_assignments(project_id);
CREATE INDEX idx_assignments_user ON project_assignments(assigned_user_id);
CREATE INDEX idx_assignments_role ON project_assignments(role_type);
CREATE INDEX idx_assignments_status ON project_assignments(status);
CREATE INDEX idx_assignments_deadline ON project_assignments(deadline);
CREATE INDEX idx_assignments_created_at ON project_assignments(created_at);

-- Prevent duplicate active assignments for same role on same project
CREATE UNIQUE INDEX idx_unique_active_assignment
ON project_assignments(project_id, role_type, assigned_user_id, status)
WHERE status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS');
