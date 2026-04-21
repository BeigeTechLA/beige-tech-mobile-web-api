const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_quotes', {
    sales_quote_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    quote_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "quote_number"
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    client_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'clients',
        key: 'client_id'
      }
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
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
    pricing_mode: {
      type: DataTypes.ENUM('general','wedding','both'),
      allowNull: false,
      defaultValue: "general"
    },
    status: {
      type: DataTypes.ENUM('draft','pending','partially_paid','sent','viewed','accepted','paid','rejected','expired'),
      allowNull: false,
      defaultValue: "draft"
    },
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    client_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    client_phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    client_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    project_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    video_shoot_type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    quote_validity_days: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    valid_until: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    discount_type: {
      type: DataTypes.ENUM('none','percentage','fixed_amount'),
      allowNull: false,
      defaultValue: "none"
    },
    discount_value: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    tax_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tax_rate: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: false,
      defaultValue: 0.00
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    subtotal: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    total: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    terms_conditions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    viewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    accepted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejected_at: {
      type: DataTypes.DATE,
      allowNull: true
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
    tableName: 'sales_quotes',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "sales_quote_id" },
        ]
      },
      {
        name: "quote_number",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "quote_number" },
        ]
      },
      {
        name: "idx_sales_quotes_owner",
        using: "BTREE",
        fields: [
          { name: "assigned_sales_rep_id" },
          { name: "status" },
        ]
      },
      {
        name: "idx_sales_quotes_client",
        using: "BTREE",
        fields: [
          { name: "client_id" },
          { name: "client_user_id" },
        ]
      },
      {
        name: "sales_quotes_ibfk_2",
        using: "BTREE",
        fields: [
          { name: "created_by_user_id" },
        ]
      },
    ]
  });
};
