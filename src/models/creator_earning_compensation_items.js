const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
    return sequelize.define('creator_earning_compensation_items', {
        compensation_item_id: {
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
        item_label: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        is_active: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 1
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
        tableName: 'creator_earning_compensation_items',
        timestamps: false,
        indexes: [
            { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "compensation_item_id" }] },
            { name: "idx_ceci_earning", using: "BTREE", fields: [{ name: "creator_earning_id" }] },
            { name: "idx_ceci_booking", using: "BTREE", fields: [{ name: "booking_id" }] },
            { name: "idx_ceci_creator", using: "BTREE", fields: [{ name: "creator_id" }] }
        ]
    });
};