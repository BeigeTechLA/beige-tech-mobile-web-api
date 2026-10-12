module.exports = (sequelize, DataTypes) => sequelize.define('inventory_model_units', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
  inventory_model_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('available', 'assigned', 'retired'), allowNull: false, defaultValue: 'available' },
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'inventory_model_units', timestamps: false });
