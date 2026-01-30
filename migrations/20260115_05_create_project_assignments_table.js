'use strict';

/**
 * Project Assignments Table Migration
 * Tracks creator, editor, QC assignments and workload
 * Assignment status and time tracking
 */

const ROLE_TYPES = ['CREATOR', 'EDITOR', 'QC_REVIEWER', 'ADMIN'];
const STATUSES = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'DECLINED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const RATE_TYPES = ['FLAT', 'HOURLY', 'PROJECT'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_assignments', {
      assignment_id: {
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
      role_type: {
        type: Sequelize.ENUM(...ROLE_TYPES),
        allowNull: false
      },
      assigned_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'FK to users - person assigned this role'
      },
      assigned_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment: 'FK to users - admin who made the assignment'
      },
      status: {
        type: Sequelize.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'PENDING_ACCEPTANCE'
      },
      estimated_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Estimated time for this assignment'
      },
      actual_hours: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Actual time spent (self-reported or tracked)'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      response_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When user accepted/declined'
      },
      response_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Reason for declining or acceptance notes'
      },
      assignment_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Instructions from admin'
      },
      priority: {
        type: Sequelize.ENUM(...PRIORITIES),
        allowNull: true,
        defaultValue: 'NORMAL'
      },
      deadline: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Specific deadline for this assignment'
      },
      agreed_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Agreed payment for this assignment'
      },
      rate_type: {
        type: Sequelize.ENUM(...RATE_TYPES),
        allowNull: true
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
    await queryInterface.addIndex('project_assignments', ['project_id'], {
      name: 'idx_assignments_project'
    });
    await queryInterface.addIndex('project_assignments', ['assigned_user_id'], {
      name: 'idx_assignments_user'
    });
    await queryInterface.addIndex('project_assignments', ['role_type'], {
      name: 'idx_assignments_role'
    });
    await queryInterface.addIndex('project_assignments', ['status'], {
      name: 'idx_assignments_status'
    });
    await queryInterface.addIndex('project_assignments', ['deadline'], {
      name: 'idx_assignments_deadline'
    });
    await queryInterface.addIndex('project_assignments', ['created_at'], {
      name: 'idx_assignments_created_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_assignments');
  }
};
