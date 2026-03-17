const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('client_lead_activities', {
    activity_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'client_leads',
        key: 'lead_id'
      }
    },
    activity_type: {
      type: DataTypes.ENUM(
        'created',
        'booking_updated',
        'status_changed',
        'assigned',
        'contacted_sales',
        'payment_link_generated',
        'discount_code_generated',
        'payment_link_opened',
        'discount_applied',
        'payment_completed',
        'intent_updated'
      ),
      allowNull: false
    },
    activity_data: {
      type: DataTypes.JSON,
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
    tableName: 'client_lead_activities',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'activity_id' },
        ]
      },
      {
        name: 'idx_client_lead_activity_lead',
        using: 'BTREE',
        fields: [
          { name: 'lead_id' },
        ]
      },
      {
        name: 'idx_client_lead_activity_type',
        using: 'BTREE',
        fields: [
          { name: 'activity_type' },
        ]
      },
      {
        name: 'idx_client_lead_activity_created_at',
        using: 'BTREE',
        fields: [
          { name: 'created_at' },
        ]
      },
    ]
  });
};
