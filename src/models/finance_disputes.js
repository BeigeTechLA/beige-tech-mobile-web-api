const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_disputes', {
    finance_dispute_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    dispute_code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    invoice_send_history_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'invoice_send_history',
        key: 'invoice_send_history_id'
      }
    },
    finance_transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'finance_transactions',
        key: 'finance_transaction_id'
      }
    },
    client_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    raised_by_type: {
      type: DataTypes.ENUM('client', 'creator', 'admin'),
      allowNull: false,
      defaultValue: 'admin'
    },
    raised_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    raised_by_creator_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    category: {
      type: DataTypes.ENUM('quality', 'payment_delay', 'wrong_deliverables', 'refund', 'payout_issues', 'other'),
      allowNull: false,
      defaultValue: 'other'
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('open', 'in_review', 'resolved', 'rejected', 'escalated'),
      allowNull: false,
      defaultValue: 'open'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'medium'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    disputed_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    payout_hold_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    impacted_payout_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    resolution_type: {
      type: DataTypes.ENUM('payout_release', 'refund', 'partial_refund', 'credit_compensation', 'payout_adjustment', 'no_action', 'other'),
      allowNull: true
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resolved_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata_json: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updated_by_user_id: {
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
    tableName: 'finance_disputes',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_dispute_id' }] },
      { name: 'uniq_finance_disputes_code', unique: true, using: 'BTREE', fields: [{ name: 'dispute_code' }] },
      { name: 'idx_finance_disputes_booking', using: 'BTREE', fields: [{ name: 'booking_id' }] },
      { name: 'idx_finance_disputes_invoice', using: 'BTREE', fields: [{ name: 'invoice_send_history_id' }] },
      { name: 'idx_finance_disputes_status', using: 'BTREE', fields: [{ name: 'status' }] },
      { name: 'idx_finance_disputes_category', using: 'BTREE', fields: [{ name: 'category' }] },
      { name: 'idx_finance_disputes_client', using: 'BTREE', fields: [{ name: 'client_user_id' }] },
      { name: 'idx_finance_disputes_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_finance_disputes_created_at', using: 'BTREE', fields: [{ name: 'created_at' }] }
    ]
  });
};
