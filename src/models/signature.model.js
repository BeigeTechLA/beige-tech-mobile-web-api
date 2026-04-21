const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('signatures', {
        id: {
            autoIncrement: true,
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        quote_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'quotes',
                key: 'quote_id'
            }
        },
        signer_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        signer_email: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        signature_base64: {
            type: DataTypes.TEXT('long'),
            allowNull: false
        },
        pdf_path: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'signed'),
            defaultValue: 'signed'
        },
        signed_at: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.Sequelize.fn('current_timestamp')
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
        tableName: 'signatures',
        timestamps: false,
        indexes: [
            {
                name: "PRIMARY",
                unique: true,
                using: "BTREE",
                fields: [{ name: "id" }]
            },
            {
                name: "idx_signatures_quote",
                using: "BTREE",
                fields: [{ name: "quote_id" }]
            }
        ]
    });
};