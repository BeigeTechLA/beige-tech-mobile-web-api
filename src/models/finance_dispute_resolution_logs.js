const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_dispute_resolution_logs', {
    finance_dispute_resolution_log_id: {
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
    action: {
      type: DataTypes.ENUM('created', 'updated', 'comment_added', 'attachment_added', 'payout_hold_created', 'payout_hold_released', 'resolved', 'rejected', 'refunded', 'escalated'),
      allowNull: false
    },
    from_status: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    to_status: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata_json: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    performed_by_user_id: {
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
    }
  }, {
    sequelize,
    tableName: 'finance_dispute_resolution_logs',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_dispute_resolution_log_id' }] },
      { name: 'idx_finance_dispute_logs_dispute', using: 'BTREE', fields: [{ name: 'finance_dispute_id' }] },
      { name: 'idx_finance_dispute_logs_action', using: 'BTREE', fields: [{ name: 'action' }] },
      { name: 'idx_finance_dispute_logs_created_at', using: 'BTREE', fields: [{ name: 'created_at' }] }
    ]
  });
};
