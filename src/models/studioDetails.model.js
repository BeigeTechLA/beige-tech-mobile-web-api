const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioDetails = sequelize.define('StudioDetails', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    preferred_age: { type: DataTypes.STRING(50) },
    wifi_name: { type: DataTypes.STRING(100) },
    wifi_password: { type: DataTypes.STRING(100) },
    host_activities: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Activity toggles
    activity_production: { type: DataTypes.BOOLEAN, defaultValue: true },
    activity_event: { type: DataTypes.BOOLEAN, defaultValue: true },
    activity_recreation: { type: DataTypes.BOOLEAN, defaultValue: true },
    activity_meetings: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Space basics
    guests: { type: DataTypes.INTEGER, defaultValue: 0 },
    bedrooms: { type: DataTypes.INTEGER, defaultValue: 0 },
    beds: { type: DataTypes.INTEGER, defaultValue: 0 },
    bathrooms: { type: DataTypes.INTEGER, defaultValue: 0 },
    // JSON arrays
    amenities: { type: DataTypes.JSON }, // ["WiFi", "Pool", ...]
    space_tags: { type: DataTypes.JSON }, // ["Peaceful", "Spacious"]
    // Space types selected
    selected_types: { type: DataTypes.JSON }, // ["Photography", "Podcast"]
}, {
    tableName: 'studio_details',
    timestamps: true,
});

module.exports = StudioDetails;