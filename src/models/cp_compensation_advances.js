const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('cp_compensation_advances', {
        advance_id: {
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
        advance_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        remaining_balance: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        payment_date: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'processed', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending'
        },
        created_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
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
        tableName: 'cp_compensation_advances',
        timestamps: false,
        indexes: [
            {
                name: 'PRIMARY',
                unique: true,
                using: 'BTREE',
                fields: [{ name: 'advance_id' }]
            },
            {
                name: 'idx_adv_compensation',
                using: 'BTREE',
                fields: [{ name: 'compensation_id' }]
            },
            {
                name: 'idx_adv_booking',
                using: 'BTREE',
                fields: [{ name: 'booking_id' }]
            },
            {
                name: 'idx_adv_crew',
                using: 'BTREE',
                fields: [{ name: 'crew_member_id' }]
            },
            {
                name: 'idx_adv_status',
                using: 'BTREE',
                fields: [{ name: 'status' }]
            }
        ]
    });
};