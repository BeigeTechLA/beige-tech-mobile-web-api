module.exports = (sequelize, DataTypes) => sequelize.define('inventory_models', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
  inventory_item_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  hourly_rental_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  daily_rental_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  total_quantity: { type: DataTypes.INTEGER, allowNull: false },
  image_urls: { type: DataTypes.JSON, allowNull: true },
  is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'inventory_models', timestamps: false });
