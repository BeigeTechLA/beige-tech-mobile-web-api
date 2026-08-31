const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('signup_credit_promo_history', {
    signup_credit_promo_history_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    signup_credit_promotion_setting_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'signup_credit_promotion_settings',
        key: 'signup_credit_promotion_setting_id'
      }
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 250.00
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    changed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    changed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    change_reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    change_details_json: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'signup_credit_promo_history',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'signup_credit_promo_history_id' }]
      },
      {
        name: 'idx_signup_credit_promo_history_setting',
        using: 'BTREE',
        fields: [{ name: 'signup_credit_promotion_setting_id' }]
      },
      {
        name: 'idx_signup_credit_promo_history_changed_at',
        using: 'BTREE',
        fields: [{ name: 'changed_at' }]
      },
      {
        name: 'idx_signup_credit_promo_history_changed_by',
        using: 'BTREE',
        fields: [{ name: 'changed_by_user_id' }]
      }
    ]
  });
};
