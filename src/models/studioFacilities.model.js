const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioFacilities = sequelize.define('StudioFacilities', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    // Parking — JSON array e.g. ["Free Onsite Parking", "Valet"]
    parking_options: { type: DataTypes.JSON },
    parking_desc: { type: DataTypes.TEXT },
    // Access
    access_availability: { type: DataTypes.BOOLEAN, defaultValue: false },
    access_options: { type: DataTypes.JSON }, // ["Elevator", "Stairs"]
    // Feature toggles
    general_facilities: { type: DataTypes.BOOLEAN, defaultValue: false },
    photo_features: { type: DataTypes.BOOLEAN, defaultValue: false },
    video_features: { type: DataTypes.BOOLEAN, defaultValue: false },
    podcast_features: { type: DataTypes.BOOLEAN, defaultValue: false },
    product_features: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    tableName: 'studio_facilities',
    timestamps: true,
});

module.exports = StudioFacilities;