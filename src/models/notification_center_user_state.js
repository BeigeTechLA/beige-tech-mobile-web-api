const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('notification_center_user_state', {
    notification_center_user_state_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    notification_center_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'notification_center',
        key: 'notification_center_id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
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
    muted_at: {
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
    tableName: 'notification_center_user_state',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'notification_center_user_state_id' }]
      },
      {
        name: 'uniq_notification_center_user',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'notification_center_id' }, { name: 'user_id' }]
      },
      {
        name: 'idx_notification_center_user_state_user',
        using: 'BTREE',
        fields: [{ name: 'user_id' }, { name: 'is_read' }, { name: 'is_archived' }]
      }
    ]
  });
};
