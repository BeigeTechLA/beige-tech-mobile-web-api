const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_dispute_comments', {
    finance_dispute_comment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    finance_dispute_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'finance_disputes',
        key: 'finance_dispute_id'
      }
    },
    comment_type: {
      type: DataTypes.ENUM('internal', 'status_update', 'resolution', 'system'),
      allowNull: false,
      defaultValue: 'internal'
    },
    visibility: {
      type: DataTypes.ENUM('internal', 'client', 'creator', 'all'),
      allowNull: false,
      defaultValue: 'internal'
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_by_creator_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
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
    tableName: 'finance_dispute_comments',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_dispute_comment_id' }] },
      { name: 'idx_finance_dispute_comments_dispute', using: 'BTREE', fields: [{ name: 'finance_dispute_id' }] },
      { name: 'idx_finance_dispute_comments_created_at', using: 'BTREE', fields: [{ name: 'created_at' }] }
    ]
  });
};
