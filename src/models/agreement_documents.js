const Sequelize = require('sequelize');

module.exports = function agreementDocuments(sequelize, DataTypes) {
  return sequelize.define('agreement_documents', {
    agreement_document_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    agreement_type: { type: DataTypes.ENUM('general', 'shoot'), allowNull: false },
    agreement_template_id: { type: DataTypes.INTEGER, allowNull: true },
    creator_id: { type: DataTypes.INTEGER, allowNull: true },
    booking_id: { type: DataTypes.INTEGER, allowNull: true },
    assignment_id: { type: DataTypes.INTEGER, allowNull: true },
    creator_earning_id: { type: DataTypes.INTEGER, allowNull: true },
    parent_document_id: { type: DataTypes.INTEGER, allowNull: true },
    version_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    display_version: { type: DataTypes.STRING(50), allowNull: false },
    status: { type: DataTypes.ENUM('draft', 'pending_acceptance', 'accepted', 'rejected', 'cancelled', 'expired'), allowNull: false, defaultValue: 'draft' },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: 1 },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content_html: { type: DataTypes.TEXT('long'), allowNull: false },
    content_json: { type: DataTypes.TEXT('long'), allowNull: true },
    content_hash: { type: DataTypes.STRING(64), allowNull: false },
    snapshot_json: { type: DataTypes.TEXT('long'), allowNull: true },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    compensation_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    due_at: { type: DataTypes.DATE, allowNull: true },
    responded_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    created_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    sent_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'agreement_documents', timestamps: false });
};
