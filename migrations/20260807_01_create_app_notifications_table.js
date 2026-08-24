'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('app_notifications', {
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
        onUpdate: 'CASCADE'
      },
      sender_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      topic: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      delivery_surface: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'web_app'
      },
      app_user_type: {
        type: Sequelize.STRING(30),
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      type: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      reference_id: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      payload: {
        type: Sequelize.JSON,
        allowNull: true
      },
      action_label: {
        type: Sequelize.STRING(80),
        allowNull: true
      },
      priority: {
        type: Sequelize.STRING(30),
        allowNull: true
      },
      is_read: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1
      },
      read_at: {
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

    await queryInterface.addIndex('app_notifications', ['user_id', 'is_read', 'created_at'], {
      name: 'idx_app_notifications_user_read_created'
    });
    await queryInterface.addIndex('app_notifications', ['delivery_surface', 'app_user_type'], {
      name: 'idx_app_notifications_surface'
    });
    await queryInterface.addIndex('app_notifications', ['user_id', 'category'], {
      name: 'idx_app_notifications_user_category'
    });
    await queryInterface.addIndex('app_notifications', ['type'], {
      name: 'idx_app_notifications_type'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('app_notifications');
  }
};
