const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('assignment_history', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shift_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shifts', key: 'id' } },
    sales_rep_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    client_name: { type: DataTypes.STRING(150), allowNull: false },
    status: { type: DataTypes.STRING(50), allowNull: false },
    source: { type: DataTypes.ENUM('web_form', 'api', 'import', 'manual'), allowNull: false },
    assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') }
  }, {
    sequelize,
    tableName: 'assignment_history',
    timestamps: false
  });
};
