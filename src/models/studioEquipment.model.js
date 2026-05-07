const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioEquipment = sequelize.define('StudioEquipment', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    cost: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
}, {
    tableName: 'studio_equipment',
    timestamps: true,
});

module.exports = StudioEquipment;