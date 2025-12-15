const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('crew_members', {
    crew_member_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    first_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: "email"
    },
    phone_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    location: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    working_distance: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    primary_role: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    years_of_experience: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    hourly_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    availability: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    skills: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    certifications: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    equipment_ownership: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_beige_member: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_available: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    rating: {
      type: DataTypes.DECIMAL(2,1),
      allowNull: true
    },
    is_draft: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
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
    },
    social_media_links: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'crew_members',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "crew_member_id" },
        ]
      },
      {
        name: "email",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "email" },
        ]
      },
    ]
  });
};
