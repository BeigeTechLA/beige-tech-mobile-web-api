const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('app_notifications', {
    notification_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sender_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    topic: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    delivery_surface: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'web_app'
    },
    app_user_type: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    reference_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: true
    },
    action_label: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    priority: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'app_notifications',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'notification_id' }]
      },
      {
        name: 'idx_app_notifications_user_read_created',
        using: 'BTREE',
        fields: [
          { name: 'user_id' },
          { name: 'is_read' },
          { name: 'created_at' }
        ]
      },
      {
        name: 'idx_app_notifications_surface',
        using: 'BTREE',
        fields: [
          { name: 'delivery_surface' },
          { name: 'app_user_type' }
        ]
      },
      {
        name: 'idx_app_notifications_user_category',
        using: 'BTREE',
        fields: [
          { name: 'user_id' },
          { name: 'category' }
        ]
      },
      {
        name: 'idx_app_notifications_type',
        using: 'BTREE',
        fields: [{ name: 'type' }]
      }
    ]
  });
};
