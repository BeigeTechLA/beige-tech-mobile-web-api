const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreement_sections', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shoot_agreement_version_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreement_versions', key: 'id' } },
    section_order: { type: DataTypes.INTEGER, allowNull: false },
    section_title: { type: DataTypes.STRING(255), allowNull: false },
    section_body: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreement_sections', timestamps: false });
};
