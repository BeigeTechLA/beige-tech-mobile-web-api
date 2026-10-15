const Sequelize = require('sequelize');

module.exports = (sequelize, DataTypes) => sequelize.define('internal_password_expiry_settings', {
  internal_password_expiry_setting_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
  is_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  expiry_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
  enabled_at: { type: DataTypes.DATE, allowNull: true },
  updated_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') }
}, { sequelize, tableName: 'internal_password_expiry_settings', timestamps: false });
