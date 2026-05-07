const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioInfo = sequelize.define('StudioInfo', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    space_title: { type: DataTypes.STRING(200), allowNull: false },
    brand_name: { type: DataTypes.STRING(200) },
    description: { type: DataTypes.TEXT },
    suggest_type: { type: DataTypes.STRING(200) },
    property_size: { type: DataTypes.STRING(50) },
    height: { type: DataTypes.STRING(50) },
    width: { type: DataTypes.STRING(50) },
    length: { type: DataTypes.STRING(50) },
    max_floor: { type: DataTypes.STRING(50) },
    overnight_stays: { type: DataTypes.BOOLEAN, defaultValue: false },
    security_camera: { type: DataTypes.BOOLEAN, defaultValue: false },
    security_desc: { type: DataTypes.TEXT },
}, {
    tableName: 'studio_info',
    timestamps: true,
});

module.exports = StudioInfo;