const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('notification_center', {
    notification_center_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    recipient_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    recipient_scope: {
      type: DataTypes.ENUM('user', 'role', 'all'),
      allowNull: false,
      defaultValue: 'user'
    },
    recipient_roles: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notification_type: {
      type: DataTypes.ENUM(
        'CP_REGISTRATION_APPROVAL',
        'QUOTE_CHANGE_APPROVAL',
        'GENERAL'
      ),
      allowNull: false,
      defaultValue: 'GENERAL'
    },
    category: {
      type: DataTypes.ENUM('approvals', 'system', 'projects', 'payments', 'files', 'messages'),
      allowNull: false,
      defaultValue: 'system'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'medium'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    entity_type: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    action_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    action_label: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    actor_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    actor_name: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    actor_avatar_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    metadata_json: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_read: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_archived: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_muted: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    expires_at: {
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
    tableName: 'notification_center',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'notification_center_id' }]
      },
      {
        name: 'idx_notification_center_recipient',
        using: 'BTREE',
        fields: [{ name: 'recipient_user_id' }, { name: 'created_at' }]
      },
      {
        name: 'idx_notification_center_scope',
        using: 'BTREE',
        fields: [{ name: 'recipient_scope' }]
      },
      {
        name: 'idx_notification_center_unread',
        using: 'BTREE',
        fields: [{ name: 'recipient_user_id' }, { name: 'is_read' }]
      },
      {
        name: 'idx_notification_center_type',
        using: 'BTREE',
        fields: [{ name: 'notification_type' }]
      },
      {
        name: 'idx_notification_center_entity',
        using: 'BTREE',
        fields: [{ name: 'entity_type' }, { name: 'entity_id' }]
      }
    ]
  });
};
