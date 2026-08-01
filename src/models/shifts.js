const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('shifts', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    start_time: { type: DataTypes.TIME, allowNull: false },
    end_time: { type: DataTypes.TIME, allowNull: false },
    active_days: {
      type: DataTypes.JSON,
      allowNull: false,
      get() {
        const value = this.getDataValue('active_days');
        if (Array.isArray(value)) return value;
        if (!value) return [];
        try { return JSON.parse(value); } catch (_) { return []; }
      }
    },
    is_enabled: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: true, defaultValue: 'active' },
    next_assignee_sales_rep_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') }
  }, {
    sequelize,
    tableName: 'shifts',
    timestamps: false
  });
};
