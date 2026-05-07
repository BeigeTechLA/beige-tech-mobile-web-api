const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioRequest = sequelize.define('StudioRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    studio_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending',
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'studio_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = StudioRequest;