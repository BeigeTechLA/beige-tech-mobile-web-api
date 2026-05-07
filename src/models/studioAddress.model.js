const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioAddress = sequelize.define('StudioAddress', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    country: { type: DataTypes.STRING(100), defaultValue: 'United States' },
    address: { type: DataTypes.STRING(255), allowNull: false },
    apartment: { type: DataTypes.STRING(100) },
    city: { type: DataTypes.STRING(100), allowNull: false },
    state: { type: DataTypes.STRING(100) },
    zip_code: { type: DataTypes.STRING(20) },
    latitude: { type: DataTypes.DECIMAL(10, 8) },
    longitude: { type: DataTypes.DECIMAL(11, 8) },
}, {
    tableName: 'studio_addresses',
    timestamps: true,
});

module.exports = StudioAddress;