'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_login_history', {
      login_history_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      login_method: { type: Sequelize.STRING(30), allowNull: false },
      user_agent: { type: Sequelize.STRING(512), allowNull: true },
      logged_in_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('user_login_history', ['user_id', 'logged_in_at'], { name: 'idx_user_login_history_user_time' });
    await queryInterface.addIndex('user_login_history', ['ip_address', 'logged_in_at'], { name: 'idx_user_login_history_ip_time' });
    await queryInterface.addIndex('user_login_history', ['logged_in_at'], { name: 'idx_user_login_history_logged_in_at' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('user_login_history');
  }
};
