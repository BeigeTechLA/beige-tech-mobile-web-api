const Sequelize = require('sequelize');

module.exports = function agreementTemplates(sequelize, DataTypes) {
  return sequelize.define('agreement_templates', {
    agreement_template_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    agreement_type: { type: DataTypes.ENUM('general', 'shoot'), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    content_html: { type: DataTypes.TEXT('long'), allowNull: false },
    content_json: { type: DataTypes.TEXT('long'), allowNull: true },
    version: { type: DataTypes.STRING(50), allowNull: false },
    content_hash: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.ENUM('draft', 'published', 'retired'), allowNull: false, defaultValue: 'draft' },
    is_mandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: 1 },
    effective_at: { type: DataTypes.DATE, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
    published_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    created_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'agreement_templates', timestamps: false });
};
