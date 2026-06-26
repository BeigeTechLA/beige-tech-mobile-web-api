const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('cp_compensation_logs', {
        log_id: {
            autoIncrement: true,
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        compensation_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'cp_compensations',
                key: 'compensation_id'
            }
        },
        booking_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        action: {
            type: DataTypes.ENUM('created', 'updated', 'submitted', 'approved', 'rejected', 'advance_added'),
            allowNull: false
        },
        performed_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        snapshot_json: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.Sequelize.fn('current_timestamp')
        }
    }, {
        sequelize,
        tableName: 'cp_compensation_logs',
        timestamps: false,
        indexes: [
            {
                name: 'PRIMARY',
                unique: true,
                using: 'BTREE',
                fields: [{ name: 'log_id' }]
            },
            {
                name: 'idx_log_compensation',
                using: 'BTREE',
                fields: [{ name: 'compensation_id' }]
            },
            {
                name: 'idx_log_booking',
                using: 'BTREE',
                fields: [{ name: 'booking_id' }]
            },
            {
                name: 'idx_log_action',
                using: 'BTREE',
                fields: [{ name: 'action' }]
            }
        ]
    });
};