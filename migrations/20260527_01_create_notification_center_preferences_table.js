'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_center_preferences', {
      notification_center_preference_id: {
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
        onUpdate: 'CASCADE'
      },
      push_enabled: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1
      },
      email_enabled: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
      approvals_push_enabled: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1
      },
      approvals_email_enabled: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
      smart_delivery_enabled: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1
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

    await queryInterface.addIndex('notification_center_preferences', ['user_id'], {
      name: 'uniq_notification_center_preferences_user',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_center_preferences');
  }
};
