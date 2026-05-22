const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_dispute_attachments', {
    finance_dispute_attachment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    finance_dispute_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'finance_disputes',
        key: 'finance_dispute_id'
      }
    },
    file_name: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    file_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    file_size_bytes: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    attachment_type: {
      type: DataTypes.ENUM('evidence', 'invoice', 'deliverable', 'refund_proof', 'payout_proof', 'other'),
      allowNull: false,
      defaultValue: 'evidence'
    },
    uploaded_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    metadata_json: {
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
    tableName: 'finance_dispute_attachments',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_dispute_attachment_id' }] },
      { name: 'idx_finance_dispute_attachments_dispute', using: 'BTREE', fields: [{ name: 'finance_dispute_id' }] },
      { name: 'idx_finance_dispute_attachments_created_at', using: 'BTREE', fields: [{ name: 'created_at' }] }
    ]
  });
};
