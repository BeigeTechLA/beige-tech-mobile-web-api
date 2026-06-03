const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_note_reactions', {
    reaction_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    note_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'project_notes',
        key: 'note_id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    reaction_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'like'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'project_note_reactions',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'reaction_id' }] },
      { name: 'uniq_project_note_reaction_user', unique: true, using: 'BTREE', fields: [{ name: 'note_id' }, { name: 'user_id' }, { name: 'reaction_type' }] },
      { name: 'idx_project_note_reactions_note', using: 'BTREE', fields: [{ name: 'note_id' }] },
      { name: 'idx_project_note_reactions_user', using: 'BTREE', fields: [{ name: 'user_id' }] }
    ]
  });
};
