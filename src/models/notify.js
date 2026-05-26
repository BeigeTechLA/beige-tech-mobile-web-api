module.exports = function (sequelize, DataTypes) {
    return sequelize.define('notifications', {
        notification_id: {
            autoIncrement: true,
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        type: {
            type: DataTypes.ENUM(
                'book_a_shoot',
                'quote_approval',
                'quote_rejected',
                'cp_booking_request',
                'cp_request_approved',
                'cp_request_rejected',
                'cp_accepted',
                'cp_rejected',
                'quote_change_request',   
                'quote_change_approved',  
                'quote_change_rejected'
            ),
            allowNull: false
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        data: {
            type: DataTypes.JSON,
            allowNull: true
        },
        is_read: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.fn('current_timestamp')
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.fn('current_timestamp')
        }
    }, {
        sequelize,
        tableName: 'notifications_reverge',
        timestamps: false,
        indexes: [
            { name: 'PRIMARY', unique: true, fields: [{ name: 'notification_id' }] },
            { name: 'idx_notifications_user_id', fields: [{ name: 'user_id' }] },
            { name: 'idx_notifications_type', fields: [{ name: 'type' }] },
            { name: 'idx_notifications_is_read', fields: [{ name: 'is_read' }] },
        ]
    });
};
