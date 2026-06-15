const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
    return sequelize.define('creator_earning_advances', {
        advance_id: {
            autoIncrement: true,
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        creator_earning_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'creator_earnings',
                key: 'creator_earning_id'
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
        creator_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'crew_members',
                key: 'crew_member_id'
            }
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('pending', 'processed', 'failed'),
            allowNull: false,
            defaultValue: 'pending'
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        created_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('current_timestamp')
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('current_timestamp')
        }
    }, {
        sequelize,
        tableName: 'creator_earning_advances',
        timestamps: false,
        indexes: [
            { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "advance_id" }] },
            { name: "idx_cea_earning", using: "BTREE", fields: [{ name: "creator_earning_id" }] },
            { name: "idx_cea_booking", using: "BTREE", fields: [{ name: "booking_id" }] },
            { name: "idx_cea_creator", using: "BTREE", fields: [{ name: "creator_id" }] }
        ]
    });
};