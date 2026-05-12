const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('studio_reviews', {
    studio_review_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    studio_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'studios',
        key: 'studio_id'
      }
    },
    reviewer_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    reviewer_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reviewer_avatar_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rating: {
      type: DataTypes.DECIMAL(2,1),
      allowNull: false,
      defaultValue: 5.0
    },
    cleanliness_rating: {
      type: DataTypes.DECIMAL(2,1),
      allowNull: true
    },
    communication_rating: {
      type: DataTypes.DECIMAL(2,1),
      allowNull: true
    },
    check_in_rating: {
      type: DataTypes.DECIMAL(2,1),
      allowNull: true
    },
    review_text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reviewed_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
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
    tableName: 'studio_reviews',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'studio_review_id' }]
      },
      {
        name: 'idx_studio_reviews_studio',
        using: 'BTREE',
        fields: [{ name: 'studio_id' }]
      },
      {
        name: 'idx_studio_reviews_active',
        using: 'BTREE',
        fields: [{ name: 'is_active' }]
      }
    ]
  });
};
