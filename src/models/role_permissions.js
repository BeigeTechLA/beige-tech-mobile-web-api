const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('role_permissions', {
    role_permission_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    permission_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    is_active: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    sequelize,
    tableName: 'role_permissions',
    timestamps: false
  });
};