const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('newsletter_subscribers', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: 'uq_newsletter_subscribers_email'
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'press-blogs'
    },
    status: {
      type: DataTypes.ENUM('active', 'unsubscribed'),
      allowNull: false,
      defaultValue: 'active'
    },
    subscribed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    last_subscribed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    notification_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_notification_error: {
      type: DataTypes.TEXT,
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
    tableName: 'newsletter_subscribers',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'id' }
        ]
      },
      {
        name: 'uq_newsletter_subscribers_email',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'email' }
        ]
      },
      {
        name: 'idx_newsletter_subscribers_status',
        using: 'BTREE',
        fields: [
          { name: 'status' }
        ]
      },
      {
        name: 'idx_newsletter_subscribers_created_at',
        using: 'BTREE',
        fields: [
          { name: 'created_at' }
        ]
      }
    ]
  });
};
