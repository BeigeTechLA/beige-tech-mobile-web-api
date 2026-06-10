const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
    return sequelize.define('creator_earning_timeline_events', {
        timeline_event_id: {
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
        event_type: {
            type: DataTypes.ENUM(
                'shoot_assigned',
                'shoot_accepted',
                'advance_payment_processed',
                'shoot_completed',
                'awaiting_finance_approval',
                'final_payment_processed'
            ),
            allowNull: false
        },
        label: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        sub_label: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        is_completed: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        event_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
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
        tableName: 'creator_earning_timeline_events',
        timestamps: false,
        indexes: [
            { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "timeline_event_id" }] },
            { name: "idx_cete_earning", using: "BTREE", fields: [{ name: "creator_earning_id" }] },
            { name: "idx_cete_booking", using: "BTREE", fields: [{ name: "booking_id" }] },
            { name: "idx_cete_creator", using: "BTREE", fields: [{ name: "creator_id" }] }
        ]
    });
};