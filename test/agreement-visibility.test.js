const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
// Visibility queries do not send notifications or submit compensation.
for (const dependency of ['../src/services/business-notification.service', '../src/services/cp-compensation.service']) {
  const filename = require.resolve(dependency);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: {} };
}
const agreements = require('../src/services/agreements.service');

test('creator agreement list excludes drafts and cancelled records', async () => {
  const original = db.agreement_documents.findAll;
  let query;
  db.agreement_documents.findAll = async (options) => { query = options; return []; };
  try {
    await agreements.listDocuments({}, 42);
    assert.equal(query.where.creator_id, 42);
    assert.deepEqual(query.where.status[db.Sequelize.Op.notIn], ['draft', 'cancelled']);

    await agreements.listDocuments({ status: 'draft' }, 42);
    assert.deepEqual(query.where.status[db.Sequelize.Op.notIn], ['draft', 'cancelled']);
  } finally {
    db.agreement_documents.findAll = original;
  }
});

test('creator cannot open a draft agreement by ID', async () => {
  const original = db.agreement_documents.findByPk;
  db.agreement_documents.findByPk = async () => ({ creator_id: 42, status: 'draft' });
  try {
    await assert.rejects(() => agreements.getDocumentDetail(1, 42), { statusCode: 404 });
  } finally {
    db.agreement_documents.findByPk = original;
  }
});
