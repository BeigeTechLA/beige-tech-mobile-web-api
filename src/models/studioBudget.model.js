const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioBudget = sequelize.define('StudioBudget', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    hourly_rate: { type: DataTypes.DECIMAL(10, 2) },
    overtime_rate: { type: DataTypes.DECIMAL(10, 2) },
    minimum_booking: { type: DataTypes.STRING(50) }, // "2 hours"
    buffer_time: { type: DataTypes.STRING(50) },     // "30 minutes"
}, {
    tableName: 'studio_budget',
    timestamps: true,
});

module.exports = StudioBudget;