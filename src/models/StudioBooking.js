const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioBooking = sequelize.define('StudioBooking', {
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
        allowNull: true,
    },
    project_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    contact_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    contact_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    crew_count: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    booking_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    start_time: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    end_time: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    hours: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0.00,
    },
    base_revenue: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    overtime_amount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    platform_fee: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    net_earnings: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    status: {
        type: DataTypes.ENUM('upcoming', 'completed', 'cancelled'),
        defaultValue: 'upcoming',
    },
}, {
    tableName: 'studio_bookings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});



module.exports = StudioBooking;