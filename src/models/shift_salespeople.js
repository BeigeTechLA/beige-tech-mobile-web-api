const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('shift_salespeople', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shift_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shifts', key: 'id' } },
    sales_rep_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    assignment_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    user_status: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    last_activity: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') }
  }, {
    sequelize,
    tableName: 'shift_salespeople',
    timestamps: false
  });
};
