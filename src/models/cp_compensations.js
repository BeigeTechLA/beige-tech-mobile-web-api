const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('cp_compensations', {
        compensation_id: {
            autoIncrement: true,
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        booking_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'stream_project_booking',
                key: 'stream_project_booking_id'
            }
        },
        crew_member_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'crew_members',
                key: 'crew_member_id'
            }
        },
        compensation_method: {
            type: DataTypes.ENUM('equal_split', 'role_based', 'manual'),
            allowNull: false,
            defaultValue: 'equal_split'
        },
        rate_type: {
            type: DataTypes.ENUM('flat', 'hourly'),
            allowNull: false,
            defaultValue: 'flat'
        },
        base_payout: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        editing_payout: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        travel_adjustment: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        bonus_adjustment: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        hourly_rate: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: null
        },
        hours_worked: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            defaultValue: null
        },
        total_compensation: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('draft', 'submitted', 'approved', 'paid'),
            allowNull: false,
            defaultValue: 'draft'
        },
        submitted_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        submitted_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        approved_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        approved_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        is_active: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.Sequelize.fn('current_timestamp')
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.Sequelize.fn('current_timestamp')
        }
    }, {
        sequelize,
        tableName: 'cp_compensations',
        timestamps: false,
        indexes: [
            {
                name: 'PRIMARY',
                unique: true,
                using: 'BTREE',
                fields: [{ name: 'compensation_id' }]
            },
            {
                name: 'uniq_compensation_booking_crew',
                unique: true,
                using: 'BTREE',
                fields: [{ name: 'booking_id' }, { name: 'crew_member_id' }]
            },
            {
                name: 'idx_compensation_booking',
                using: 'BTREE',
                fields: [{ name: 'booking_id' }]
            },
            {
                name: 'idx_compensation_crew',
                using: 'BTREE',
                fields: [{ name: 'crew_member_id' }]
            },
            {
                name: 'idx_compensation_status',
                using: 'BTREE',
                fields: [{ name: 'status' }]
            },
            {
                name: 'idx_compensation_method',
                using: 'BTREE',
                fields: [{ name: 'compensation_method' }]
            }
        ]
    });
};