const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_login_history', {
    login_history_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    city: { type: DataTypes.STRING(120), allowNull: true },
    country: { type: DataTypes.STRING(120), allowNull: true },
    login_method: { type: DataTypes.STRING(30), allowNull: false },
    user_agent: { type: DataTypes.STRING(512), allowNull: true },
    logged_in_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'user_login_history',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'login_history_id' }] },
      { name: 'idx_user_login_history_user_time', using: 'BTREE', fields: [{ name: 'user_id' }, { name: 'logged_in_at' }] },
      { name: 'idx_user_login_history_ip_time', using: 'BTREE', fields: [{ name: 'ip_address' }, { name: 'logged_in_at' }] },
      { name: 'idx_user_login_history_logged_in_at', using: 'BTREE', fields: [{ name: 'logged_in_at' }] }
    ]
  });
};
