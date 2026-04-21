const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('invoice_send_history', {
    invoice_send_history_id: {
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
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_quotes',
        key: 'sales_quote_id'
      }
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_leads',
        key: 'lead_id'
      }
    },
    client_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'client_leads',
        key: 'lead_id'
      }
    },
    assigned_sales_rep_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    client_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    invoice_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    invoice_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    invoice_pdf: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    stripe_invoice_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    payment_status: {
      type: DataTypes.ENUM('paid', 'pending'),
      allowNull: false,
      defaultValue: 'pending'
    },
    invoice_type: {
      type: DataTypes.ENUM('invoice', 'additional_invoice', 'receipt'),
      allowNull: false,
      defaultValue: 'invoice'
    },
    sent_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'invoice_send_history',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'invoice_send_history_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_booking',
        using: 'BTREE',
        fields: [
          { name: 'booking_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_quote',
        using: 'BTREE',
        fields: [
          { name: 'quote_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_lead',
        using: 'BTREE',
        fields: [
          { name: 'lead_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_client_lead',
        using: 'BTREE',
        fields: [
          { name: 'client_lead_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_assigned_rep',
        using: 'BTREE',
        fields: [
          { name: 'assigned_sales_rep_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_payment_status',
        using: 'BTREE',
        fields: [
          { name: 'payment_status' }
        ]
      },
      {
        name: 'idx_invoice_send_history_invoice_type',
        using: 'BTREE',
        fields: [
          { name: 'invoice_type' }
        ]
      },
      {
        name: 'idx_invoice_send_history_stripe_invoice_id',
        using: 'BTREE',
        fields: [
          { name: 'stripe_invoice_id' }
        ]
      },
      {
        name: 'idx_invoice_send_history_sent_at',
        using: 'BTREE',
        fields: [
          { name: 'sent_at' }
        ]
      }
    ]
  });
};
