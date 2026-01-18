'use strict';

/**
 * Projects Table Migration
 * Main project entity for post-shoot workflow management
 * Links to stream_project_booking and tracks 18-state workflow
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

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('projects', {
      project_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      booking_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'stream_project_booking',
          key: 'stream_project_booking_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'FK to stream_project_booking'
      },
      project_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Unique identifier like PRJ-2026-001'
      },
      project_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      current_state: {
        type: Sequelize.ENUM(...PROJECT_STATES),
        allowNull: false,
        defaultValue: 'RAW_UPLOADED'
      },
      state_changed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      client_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'FK to users - client who owns this project'
      },
      assigned_creator_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - assigned creator/videographer'
      },
      assigned_editor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - assigned editor'
      },
      assigned_qc_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - assigned QC reviewer'
      },
      raw_upload_deadline: {
        type: Sequelize.DATE,
        allowNull: true
      },
      edit_delivery_deadline: {
        type: Sequelize.DATE,
        allowNull: true
      },
      final_delivery_deadline: {
        type: Sequelize.DATE,
        allowNull: true
      },
      project_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Internal admin notes'
      },
      client_requirements: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Client-provided requirements from booking'
      },
      total_raw_size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: true,
        defaultValue: 0,
        comment: 'Total size of RAW footage uploaded'
      },
      total_files_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'Total number of files in project'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('projects', ['booking_id'], {
      name: 'idx_projects_booking'
    });
    await queryInterface.addIndex('projects', ['client_user_id'], {
      name: 'idx_projects_client'
    });
    await queryInterface.addIndex('projects', ['current_state'], {
      name: 'idx_projects_current_state'
    });
    await queryInterface.addIndex('projects', ['assigned_creator_id'], {
      name: 'idx_projects_creator'
    });
    await queryInterface.addIndex('projects', ['assigned_editor_id'], {
      name: 'idx_projects_editor'
    });
    await queryInterface.addIndex('projects', ['state_changed_at'], {
      name: 'idx_projects_state_changed'
    });
    await queryInterface.addIndex('projects', ['created_at'], {
      name: 'idx_projects_created_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('projects');
  }
};
