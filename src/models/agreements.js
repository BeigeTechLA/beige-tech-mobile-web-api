const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('agreements', {
    agreement_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    agreement_type: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      validate: {
        isIn: [[1, 2]]
      },
      comment: '1 = Shoot Agreement, 2 = General Agreement'
    },
    agreement_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    agreement_title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    effective_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    sections: {
      type: DataTypes.JSON,
      allowNull: false
    },
    version_no: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
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
    tableName: 'agreements',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'agreement_id' }]
      },
      {
        name: 'idx_agreements_type',
        using: 'BTREE',
        fields: [{ name: 'agreement_type' }]
      },
      {
        name: 'idx_agreements_status',
        using: 'BTREE',
        fields: [{ name: 'status' }]
      },
      {
        name: 'idx_agreements_created_by',
        using: 'BTREE',
        fields: [{ name: 'created_by_user_id' }]
      }
    ]
  });
};
