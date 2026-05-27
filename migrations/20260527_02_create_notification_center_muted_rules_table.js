'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_center_muted_rules', {
      notification_center_muted_rule_id: {
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
        onUpdate: 'CASCADE'
      },
      notification_type: {
        type: Sequelize.ENUM(
          'CP_REGISTRATION_APPROVAL',
          'QUOTE_CHANGE_APPROVAL',
          'GENERAL'
        ),
        allowNull: false
      },
      category: {
        type: Sequelize.ENUM(
          'approvals',
          'system',
          'projects',
          'payments',
          'files',
          'messages'
        ),
        allowNull: false
      },
      muted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
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

    await queryInterface.addIndex('notification_center_muted_rules', ['user_id'], {
      name: 'idx_notification_center_muted_rules_user'
    });

    await queryInterface.addIndex('notification_center_muted_rules', ['user_id', 'notification_type', 'category'], {
      name: 'uniq_notification_center_muted_rule',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification_center_muted_rules');
  }
};
