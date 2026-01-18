'use strict';

/**
 * Notification Preferences Table Migration
 * Per-user notification settings and daily digest config
 * Controls email and in-app notification delivery
 */

const NOTIFICATION_FREQUENCIES = ['REALTIME', 'HOURLY', 'DAILY', 'WEEKLY'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_preferences', {
      preference_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'FK to users - one preference record per user'
      },
      // Email notification toggles (per notification type)
      email_state_transitions: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_new_assignments: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_feedback_received: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_deadline_approaching: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_file_uploaded: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_file_validation_failed: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_project_delivered: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_assignment_responses: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_qc_rejections: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_client_approvals: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      email_general_messages: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      // In-app notification toggles (per notification type)
      inapp_state_transitions: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_new_assignments: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_feedback_received: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_deadline_approaching: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_file_uploaded: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_file_validation_failed: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_project_delivered: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_assignment_responses: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_qc_rejections: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_client_approvals: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      inapp_general_messages: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1
      },
      // Daily digest configuration
      enable_daily_digest: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0,
        comment: 'If enabled, batch notifications into daily email'
      },
      digest_delivery_time: {
        type: Sequelize.TIME,
        allowNull: true,
        defaultValue: '09:00:00',
        comment: 'Time to send daily digest'
      },
      digest_timezone: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'America/Los_Angeles'
      },
      last_digest_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Quiet hours (no email notifications during this time)
      enable_quiet_hours: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0
      },
      quiet_hours_start: {
        type: Sequelize.TIME,
        allowNull: true,
        defaultValue: '22:00:00'
      },
      quiet_hours_end: {
        type: Sequelize.TIME,
        allowNull: true,
        defaultValue: '08:00:00'
      },
      quiet_hours_timezone: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'America/Los_Angeles'
      },
      // Global notification toggles
      enable_all_emails: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1,
        comment: 'Master switch for all email notifications'
      },
      enable_all_inapp: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 1,
        comment: 'Master switch for all in-app notifications'
      },
      // Communication preferences
      preferred_email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Override email (if different from user.email)'
      },
      notification_frequency: {
        type: Sequelize.ENUM(...NOTIFICATION_FREQUENCIES),
        allowNull: true,
        defaultValue: 'REALTIME'
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
    await queryInterface.addIndex('notification_preferences', ['user_id'], {
      name: 'idx_preferences_user'
    });
    await queryInterface.addIndex('notification_preferences', ['enable_daily_digest'], {
      name: 'idx_preferences_digest_enabled'
    });
    await queryInterface.addIndex('notification_preferences', ['last_digest_sent_at'], {
      name: 'idx_preferences_last_digest'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('notification_preferences');
  }
};
