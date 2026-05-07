const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioMedia = sequelize.define('StudioMedia', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    url: { type: DataTypes.STRING(500), allowNull: false },
    type: { type: DataTypes.ENUM('image', 'video'), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
    tableName: 'studio_media',
    timestamps: true,
});

module.exports = StudioMedia;