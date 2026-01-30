'use strict';

/**
 * Notifications Table Migration
 * In-app and email notifications for state transitions
 * Tracks read status and email delivery
 */

const NOTIFICATION_TYPES = [
  'STATE_TRANSITION',
  'NEW_ASSIGNMENT',
  'FEEDBACK_RECEIVED',
  'DEADLINE_APPROACHING',
  'FILE_UPLOADED',
  'FILE_VALIDATION_FAILED',
  'PROJECT_DELIVERED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_DECLINED',
  'QC_REJECTION',
  'CLIENT_APPROVAL',
  'GENERAL_MESSAGE'
];

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const EMAIL_DELIVERY_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      notification_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'FK to users - recipient of this notification'
      },
      notification_type: {
        type: Sequelize.ENUM(...NOTIFICATION_TYPES),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Notification title'
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Notification body'
      },
      action_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'URL to navigate to when clicked'
      },
      related_project_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'projects',
          key: 'project_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'FK to projects'
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
        comment: 'FK to project_files'
      },
      related_feedback_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'FK to project_feedback'
      },
      related_assignment_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_assignments',
          key: 'assignment_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to project_assignments'
      },
      is_read: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      email_sent: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0
      },
      email_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      email_delivery_status: {
        type: Sequelize.ENUM(...EMAIL_DELIVERY_STATUSES),
        allowNull: true,
        defaultValue: 'PENDING'
      },
      email_delivery_error: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      email_opened: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0
      },
      email_opened_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      priority: {
        type: Sequelize.ENUM(...PRIORITIES),
        allowNull: true,
        defaultValue: 'NORMAL'
      },
      expires_at: {
        type: Sequelize.DATE,
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
    await queryInterface.addIndex('notifications', ['user_id'], {
      name: 'idx_notifications_user'
    });
    await queryInterface.addIndex('notifications', ['notification_type'], {
      name: 'idx_notifications_type'
    });
    await queryInterface.addIndex('notifications', ['is_read'], {
      name: 'idx_notifications_read'
    });
    await queryInterface.addIndex('notifications', ['related_project_id'], {
      name: 'idx_notifications_project'
    });
    await queryInterface.addIndex('notifications', ['created_at'], {
      name: 'idx_notifications_created_at'
    });
    await queryInterface.addIndex('notifications', ['priority'], {
      name: 'idx_notifications_priority'
    });
    await queryInterface.addIndex('notifications', ['email_delivery_status'], {
      name: 'idx_notifications_email_status'
    });
    await queryInterface.addIndex('notifications', ['expires_at'], {
      name: 'idx_notifications_expires_at'
    });
    // Composite index for unread notifications query
    await queryInterface.addIndex('notifications', ['user_id', 'is_read', 'created_at'], {
      name: 'idx_notifications_user_unread'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notifications');
  }
};
