const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('permissions', {
    permission_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    module_key: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    action_key: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    permission_key: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    is_active: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    sequelize,
    tableName: 'permissions',
    timestamps: false
  });
};