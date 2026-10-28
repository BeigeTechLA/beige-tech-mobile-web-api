const Sequelize = require('sequelize');

module.exports = function agreementResponses(sequelize, DataTypes) {
  return sequelize.define('agreement_responses', {
    agreement_response_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    agreement_document_id: { type: DataTypes.INTEGER, allowNull: false },
    creator_id: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.ENUM('accepted', 'rejected'), allowNull: false },
    accepted_terms: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: 0 },
    signer_name: { type: DataTypes.STRING(255), allowNull: true },
    signature_data_url: { type: DataTypes.TEXT('long'), allowNull: true },
    signature_sha256: { type: DataTypes.STRING(64), allowNull: true },
    rejection_reason: { type: DataTypes.STRING(100), allowNull: true },
    comments: { type: DataTypes.TEXT, allowNull: true },
    content_hash_at_response: { type: DataTypes.STRING(64), allowNull: false },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
    responded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'agreement_responses', timestamps: false });
};
