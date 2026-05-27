const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('notification_center_muted_rules', {
    notification_center_muted_rule_id: {
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
    notification_type: {
      type: DataTypes.ENUM(
        'CP_REGISTRATION_APPROVAL',
        'QUOTE_CHANGE_APPROVAL',
        'GENERAL'
      ),
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('approvals', 'system', 'projects', 'payments', 'files', 'messages'),
      allowNull: false
    },
    muted_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
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
    tableName: 'notification_center_muted_rules',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'notification_center_muted_rule_id' }]
      },
      {
        name: 'uniq_notification_center_muted_rule',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'user_id' }, { name: 'notification_type' }, { name: 'category' }]
      },
      {
        name: 'idx_notification_center_muted_rules_user',
        using: 'BTREE',
        fields: [{ name: 'user_id' }]
      }
    ]
  });
};
