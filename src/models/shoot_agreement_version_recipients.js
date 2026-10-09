const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreement_version_recipients', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shoot_agreement_version_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreement_versions', key: 'id' } },
    shoot_agreement_recipient_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreement_recipients', key: 'id' } },
    crew_member_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'crew_members', key: 'crew_member_id' } },
    assigned_crew_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'assigned_crew', key: 'id' } },
    role_snapshot: { type: DataTypes.TEXT, allowNull: true },
    compensation_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    compensation_items_snapshot: { type: DataTypes.JSON, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreement_version_recipients', timestamps: false });
};
