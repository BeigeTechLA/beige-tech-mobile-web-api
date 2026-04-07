const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_quote_activities', {
    activity_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    sales_quote_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'sales_quotes',
        key: 'sales_quote_id'
      }
    },
    activity_type: {
      type: DataTypes.ENUM('created','updated','status_changed','sent','viewed','accepted','rejected'),
      allowNull: false
    },
    performed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    message: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    tableName: 'sales_quote_activities',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "activity_id" },
        ]
      },
      {
        name: "idx_sales_quote_activities_quote",
        using: "BTREE",
        fields: [
          { name: "sales_quote_id" },
          { name: "created_at" },
        ]
      },
      {
        name: "sales_quote_activities_ibfk_2",
        using: "BTREE",
        fields: [
          { name: "performed_by_user_id" },
        ]
      },
    ]
  });
};
