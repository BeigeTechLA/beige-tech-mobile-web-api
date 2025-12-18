const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment', {
    equipment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    equipment_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'equipment_category',
        key: 'category_id'
      }
    },
    manufacturer: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    // Alias for backwards compatibility with controllers expecting 'brand'
    brand: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'manufacturer'  // Maps to the same 'manufacturer' column in database
    },
    model_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    storage_location: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    initial_status_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    purchase_price: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    daily_rental_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    // Alias for backwards compatibility with controllers expecting 'rental_price_per_day'
    rental_price_per_day: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true,
      field: 'daily_rental_rate'  // Maps to the same 'daily_rental_rate' column in database
    },
    rental_price_per_hour: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    availability_status: {
      type: DataTypes.ENUM('available', 'unavailable', 'maintenance', 'rented'),
      allowNull: true,
      defaultValue: 'available'
    },
    condition_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    purchase_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    last_maintenance_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    next_maintenance_due: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    is_draft: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'equipment',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "equipment_id" },
        ]
      },
      {
        name: "category_id",
        using: "BTREE",
        fields: [
          { name: "category_id" },
        ]
      },
    ]
  });
};
