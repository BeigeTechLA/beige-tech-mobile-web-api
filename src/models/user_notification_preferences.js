const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_notification_preferences', {
    preference_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'uniq_notification_preferences_user',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    push_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    email_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    topics: {
      type: DataTypes.JSON,
      allowNull: true
    },
    email_topics: {
      type: DataTypes.JSON,
      allowNull: true
    },
    raw_preferences: {
      type: DataTypes.JSON,
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
    tableName: 'user_notification_preferences',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'preference_id' },
        ]
      },
      {
        name: 'uniq_notification_preferences_user',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'user_id' },
        ]
      },
      {
        name: 'idx_notification_preferences_user',
        using: 'BTREE',
        fields: [
          { name: 'user_id' },
        ]
      }
    ]
  });
};
