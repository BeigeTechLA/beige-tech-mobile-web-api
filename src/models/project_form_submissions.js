const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_form_submissions', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking', // Linking to your main booking table
        key: 'stream_project_booking_id'
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    full_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    time_zone: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    onsite_contact_info: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Name and Phone Number'
    },
    project_types: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const val = this.getDataValue('project_types');
        return val ? JSON.parse(val) : [];
      },
      set(val) {
        this.setDataValue('project_types', JSON.stringify(val));
      }
    },
    project_type_other: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    brief_overview: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    num_people_attending: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    additional_dates: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    event_agenda: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Program flow or TBD'
    },
    service_times: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'e.g. 10:00 am (PST) - 1:00 pm (PST)'
    },
    location_address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    google_maps_link: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    location_specification: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Indoors, Outdoors, or Both',
      get() {
        const val = this.getDataValue('location_specification');
        try {
          return val ? JSON.parse(val) : [];
        } catch (e) {
          return val ? [val] : [];
        }
      },
      set(val) {
        this.setDataValue('location_specification', JSON.stringify(val));
      }
    },
    location_scouting_refs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    shot_list: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Must be taken shots or TBD'
    },
    visual_references: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Links to samples or TBD'
    },
    specific_instructions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    creative_dress_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: "None"
    },
    post_production_ideas: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    preferred_songs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    additional_info: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    wants_to_learn_more: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    form_user_friendliness_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    is_active: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'project_form_submissions',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
      {
        name: "project_id_idx",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      }
    ]
  });
};