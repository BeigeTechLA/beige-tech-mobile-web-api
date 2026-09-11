const Sequelize = require('sequelize');

module.exports = function offlineCustomerPaymentSubmissions(sequelize, DataTypes) {
  return sequelize.define('offline_customer_payment_submissions', {
    offline_payment_submission_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    payment_link_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    booking_id: { type: DataTypes.INTEGER, allowNull: false },
    payment_method: { type: DataTypes.ENUM('wire_transfer', 'zelle'), allowNull: false },
    submitted_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payment_reference: { type: DataTypes.STRING(255), allowNull: false },
    proof_file_url: { type: DataTypes.STRING(1024), allowNull: false },
    customer_note: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending_verification', 'paid', 'partially_paid', 'rejected', 'needs_follow_up'),
      allowNull: false,
      defaultValue: 'pending_verification'
    },
    reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    review_notes: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') }
  }, {
    sequelize,
    tableName: 'offline_customer_payment_submissions',
    timestamps: false,
    indexes: [
      { name: 'idx_offline_customer_payment_booking', fields: ['booking_id'] },
      { name: 'idx_offline_customer_payment_status', fields: ['status'] }
    ]
  });
};
