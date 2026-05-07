const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioRevenueSnapshot = sequelize.define('StudioRevenueSnapshot', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    studio_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    snapshot_month: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    total_revenue: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    total_bookings: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    avg_booking_value: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
    overtime_revenue: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00,
    },
}, {
    tableName: 'studio_revenue_snapshots',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = StudioRevenueSnapshot;