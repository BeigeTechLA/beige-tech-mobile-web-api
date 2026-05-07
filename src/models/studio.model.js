const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Studio = sequelize.define('Studio', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false, 
    },
    status: {
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        defaultValue: 'draft',
    },
    current_step: {
        type: DataTypes.STRING(20),
        defaultValue: 'address', 
    },
}, {
    tableName: 'studios',
    timestamps: true,
});

module.exports = Studio;