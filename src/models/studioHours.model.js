const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioHours = sequelize.define('StudioHours', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    day: {
        type: DataTypes.ENUM('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'),
        allowNull: false,
    },
    is_open: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_24hrs: { type: DataTypes.BOOLEAN, defaultValue: false },
    opening_time: { type: DataTypes.STRING(20) }, // "09:00 AM"
    closing_time: { type: DataTypes.STRING(20) }, // "06:00 PM"
}, {
    tableName: 'studio_hours',
    timestamps: true,
});

module.exports = StudioHours;