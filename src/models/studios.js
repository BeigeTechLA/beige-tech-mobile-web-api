const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('studios', {
    studio_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    owner_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    host_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    host_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    studio_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    brand_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: 'uq_studios_slug'
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive', 'pending_review', 'rejected'),
      allowNull: false,
      defaultValue: 'draft'
    },
    verification_status: {
      type: DataTypes.ENUM('unverified', 'verified'),
      allowNull: false,
      defaultValue: 'unverified'
    },
    space_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    short_description: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    address_line1: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address_line2: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    zip_code: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    latitude: {
      type: DataTypes.DECIMAL(10,8),
      allowNull: true
    },
    longitude: {
      type: DataTypes.DECIMAL(11,8),
      allowNull: true
    },
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    hourly_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    overtime_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    minimum_booking_hours: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true
    },
    buffer_time_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    capacity_min: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    capacity_max: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    square_feet: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    height: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    width: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    length: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    main_floor_number: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    overnight_stays_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    security_recording_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    security_recording_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    wifi_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    wifi_password: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    preferred_age: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    parking_options: {
      type: DataTypes.JSON,
      allowNull: true
    },
    access_features: {
      type: DataTypes.JSON,
      allowNull: true
    },
    facility_features: {
      type: DataTypes.JSON,
      allowNull: true
    },
    supported_shoot_types: {
      type: DataTypes.JSON,
      allowNull: true
    },
    suggested_type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    activities: {
      type: DataTypes.JSON,
      allowNull: true
    },
    space_basics: {
      type: DataTypes.JSON,
      allowNull: true
    },
    amenities: {
      type: DataTypes.JSON,
      allowNull: true
    },
    description_tags: {
      type: DataTypes.JSON,
      allowNull: true
    },
    house_rules: {
      type: DataTypes.JSON,
      allowNull: true
    },
    policies: {
      type: DataTypes.JSON,
      allowNull: true
    },
    pricing_settings: {
      type: DataTypes.JSON,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
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
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
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
    tableName: 'studios',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'studio_id' }]
      },
      {
        name: 'uq_studios_slug',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'slug' }]
      },
      {
        name: 'idx_studios_status',
        using: 'BTREE',
        fields: [{ name: 'status' }]
      },
    ]
  });
};
