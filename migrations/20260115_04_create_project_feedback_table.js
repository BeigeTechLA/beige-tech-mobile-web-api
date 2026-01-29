'use strict';

/**
 * Project Feedback Table Migration
 * Client and internal feedback with video timestamps
 * Admin-translated feedback for creators
 */

const FEEDBACK_TYPES = [
  'CLIENT_PREVIEW_FEEDBACK',
  'INTERNAL_QC_REJECTION',
  'COVERAGE_REVIEW_NOTES',
  'REVISION_REQUEST',
  'FINAL_APPROVAL'
];

const SUBMITTED_BY_ROLES = ['CLIENT', 'QC', 'ADMIN', 'EDITOR'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_feedback', {
      feedback_id: {
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
      feedback_type: {
        type: Sequelize.ENUM(...FEEDBACK_TYPES),
        allowNull: false
      },
      submitted_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'FK to users - who submitted this feedback'
      },
      submitted_by_role: {
        type: Sequelize.ENUM(...SUBMITTED_BY_ROLES),
        allowNull: false
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
        comment: 'FK to project_files - file being reviewed'
      },
      feedback_text: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      video_timestamps: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array: [{"time": "00:01:23", "note": "Adjust color"}]'
      },
      priority: {
        type: Sequelize.ENUM(...PRIORITIES),
        allowNull: true,
        defaultValue: 'MEDIUM'
      },
      translated_for_creator: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Admin-sanitized version for creator'
      },
      translated_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - admin who translated'
      },
      translated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM(...STATUSES),
        allowNull: true,
        defaultValue: 'PENDING'
      },
      resolved_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - who resolved this feedback'
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      resolution_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      attachments: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array of S3 paths for reference images'
      },
      satisfaction_rating: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '1-5 stars, only for final approval'
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
    await queryInterface.addIndex('project_feedback', ['project_id'], {
      name: 'idx_feedback_project'
    });
    await queryInterface.addIndex('project_feedback', ['feedback_type'], {
      name: 'idx_feedback_type'
    });
    await queryInterface.addIndex('project_feedback', ['submitted_by_user_id'], {
      name: 'idx_feedback_submitted_by'
    });
    await queryInterface.addIndex('project_feedback', ['status'], {
      name: 'idx_feedback_status'
    });
    await queryInterface.addIndex('project_feedback', ['related_file_id'], {
      name: 'idx_feedback_file'
    });
    await queryInterface.addIndex('project_feedback', ['created_at'], {
      name: 'idx_feedback_created_at'
    });
    await queryInterface.addIndex('project_feedback', ['priority'], {
      name: 'idx_feedback_priority'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_feedback');
  }
};
