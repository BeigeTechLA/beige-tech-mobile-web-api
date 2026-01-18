'use strict';

/**
 * Project State History Table Migration
 * Complete audit trail of all state transitions
 * Tracks who, when, why for compliance and debugging
 */

const PROJECT_STATES = [
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
];

const TRANSITIONED_BY_ROLES = ['SYSTEM', 'CLIENT', 'CREATOR', 'EDITOR', 'QC', 'ADMIN'];
const TRANSITION_TYPES = ['MANUAL', 'AUTOMATIC'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_state_history', {
      history_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'project_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'FK to projects'
      },
      from_state: {
        type: Sequelize.ENUM(...PROJECT_STATES),
        allowNull: false
      },
      to_state: {
        type: Sequelize.ENUM(...PROJECT_STATES),
        allowNull: false
      },
      transitioned_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - NULL if system auto-transition'
      },
      transitioned_by_role: {
        type: Sequelize.ENUM(...TRANSITIONED_BY_ROLES),
        allowNull: false
      },
      transition_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User-provided reason or system note'
      },
      transition_type: {
        type: Sequelize.ENUM(...TRANSITION_TYPES),
        allowNull: false,
        defaultValue: 'MANUAL'
      },
      related_file_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_files',
          key: 'file_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to project_files - file that triggered transition'
      },
      related_feedback_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'FK to project_feedback - feedback that triggered transition'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'IP address of user who made transition'
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Browser/client info'
      },
      additional_metadata: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON for any extra context'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('project_state_history', ['project_id'], {
      name: 'idx_state_history_project'
    });
    await queryInterface.addIndex('project_state_history', ['from_state'], {
      name: 'idx_state_history_from_state'
    });
    await queryInterface.addIndex('project_state_history', ['to_state'], {
      name: 'idx_state_history_to_state'
    });
    await queryInterface.addIndex('project_state_history', ['transitioned_by_user_id'], {
      name: 'idx_state_history_user'
    });
    await queryInterface.addIndex('project_state_history', ['created_at'], {
      name: 'idx_state_history_created_at'
    });
    await queryInterface.addIndex('project_state_history', ['transition_type'], {
      name: 'idx_state_history_transition_type'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_state_history');
  }
};
