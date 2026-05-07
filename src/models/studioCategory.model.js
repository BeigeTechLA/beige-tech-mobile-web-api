const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioCategory = sequelize.define('StudioCategory', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    price_per_hour: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    min_hours: { type: DataTypes.INTEGER, defaultValue: 1 },
    max_people: { type: DataTypes.INTEGER, defaultValue: 10 },
    is_selected: { type: DataTypes.TINYINT(1), defaultValue: 0 },
    includes: { type: DataTypes.JSON },
}, {
    tableName: 'studio_categories',
    timestamps: true,
});

module.exports = StudioCategory;