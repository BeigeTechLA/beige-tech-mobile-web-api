const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioBookingMedia = sequelize.define('StudioBookingMedia', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    booking_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    url: {
        type: DataTypes.STRING(500),
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('image', 'video'),
        defaultValue: 'image',
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
}, {
    tableName: 'studio_booking_media',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = StudioBookingMedia;