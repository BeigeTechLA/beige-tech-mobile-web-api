const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_notes', {
    note_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
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
    parent_note_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_notes',
        key: 'note_id'
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
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_active: {
      type: DataTypes.TINYINT,
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
    tableName: 'project_notes',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'note_id' }] },
      { name: 'idx_project_notes_booking', using: 'BTREE', fields: [{ name: 'booking_id' }] },
      { name: 'idx_project_notes_lead', using: 'BTREE', fields: [{ name: 'lead_id' }] },
      { name: 'idx_project_notes_parent', using: 'BTREE', fields: [{ name: 'parent_note_id' }] },
      { name: 'idx_project_notes_created_by', using: 'BTREE', fields: [{ name: 'created_by_user_id' }] },
      { name: 'idx_project_notes_created_at', using: 'BTREE', fields: [{ name: 'created_at' }] }
    ]
  });
};
