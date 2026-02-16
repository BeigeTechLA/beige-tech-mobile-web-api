const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('stream_project_booking', {
    stream_project_booking_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'quotes',
        key: 'quote_id'
      }
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    project_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    shoot_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    content_type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    duration_hours: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    budget: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    expected_viewers: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stream_quality: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    crew_size_needed: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    event_location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    streaming_platforms: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    crew_roles: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    skills_needed: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    equipments_needed: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reference_links: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    edits_needed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    video_edit_types: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const val = this.getDataValue('video_edit_types');
        return val ? JSON.parse(val) : [];
      },
      set(val) {
        this.setDataValue('video_edit_types', JSON.stringify(val));
      }
    },
    photo_edit_types: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const val = this.getDataValue('photo_edit_types');
        return val ? JSON.parse(val) : [];
      },
      set(val) {
        this.setDataValue('photo_edit_types', JSON.stringify(val));
      }
    },
    special_instructions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_draft: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_cancelled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'payment_transactions',
        key: 'payment_id'
      }
    },
    payment_completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '0=Initiated,1=PreProduction,2=PostProduction,3=Revision,4=Completed,5=Cancelled'
    }
  }, {
    sequelize,
    tableName: 'stream_project_booking',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "stream_project_booking_id" },
        ]
      },
    ]
  });
};
