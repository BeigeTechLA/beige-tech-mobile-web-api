'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  async up(queryInterface) {
    const sqlPath = path.join(__dirname, '20260919_01_create_agreement_module_tables.sql');
    const statements = fs.readFileSync(sqlPath, 'utf8')
      .replace(/^--.*$/gm, '')
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await queryInterface.sequelize.query(statement);
    }
  },

  async down(queryInterface) {
    const tables = [
      'agreement_activity_log',
      'shoot_agreement_versions',
      'shoot_agreements',
      'shoot_requests',
      'cp_general_agreement_acceptance',
      'agreement_sections',
      'agreement_versions',
      'agreements'
    ];

    for (const table of tables) {
      await queryInterface.dropTable(table);
    }
  }
};
