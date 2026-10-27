const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');

const notificationPath = require.resolve('../src/services/business-notification.service');
const notifications = { notify: async () => null };
require.cache[notificationPath] = { id: notificationPath, filename: notificationPath, loaded: true, exports: notifications };
const compensationPath = require.resolve('../src/services/cp-compensation.service');
const compensation = {};
require.cache[compensationPath] = { id: compensationPath, filename: compensationPath, loaded: true, exports: compensation };
const agreements = require('../src/services/agreements.service');

test('publishing a new general version gives prior CPs a pending document and notification', async () => {
  const originals = {
    transaction: db.sequelize.transaction,
    templateByPk: db.agreement_templates.findByPk,
    templateFindOne: db.agreement_templates.findOne,
    templateUpdate: db.agreement_templates.update,
    documentsFindAll: db.agreement_documents.findAll,
    documentsFindOne: db.agreement_documents.findOne,
    documentsCreate: db.agreement_documents.create,
    creatorFindByPk: db.crew_members.findByPk,
    eventCreate: db.agreement_events.create,
    notify: notifications.notify
  };
  const sent = [];
  const created = [];
  const next = {
    agreement_template_id: 2, agreement_type: 'general', status: 'draft', version: 'v2',
    title: 'General Agreement', content_html: '<p>v2</p>', content_json: null, content_hash: 'new-hash', is_mandatory: true,
    async update(values) { Object.assign(this, values); }
  };
  try {
    db.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
    db.agreement_templates.findByPk = async () => next;
    db.agreement_templates.findOne = async (options) => options.where.status === 'published'
      ? (next.status === 'published' ? next : { agreement_template_id: 1 }) : null;
    db.agreement_templates.update = async () => [1];
    db.agreement_documents.findAll = async () => [{ creator_id: 17 }, { creator_id: 17 }];
    db.agreement_documents.findOne = async () => null;
    db.agreement_documents.create = async (values) => { const row = { agreement_document_id: 22, ...values }; created.push(row); return row; };
    db.crew_members.findByPk = async () => ({ crew_member_id: 17, first_name: 'A', last_name: 'CP', email: 'a@example.com', user_id: 99 });
    db.agreement_events.create = async () => ({});
    notifications.notify = async (payload) => { sent.push(payload); return {}; };

    await agreements.publishGeneralTemplate(2, { userId: 3 });
    assert.equal(created.length, 1);
    assert.equal(created[0].status, 'pending_acceptance');
    assert.equal(created[0].agreement_template_id, 2);
    assert.equal(sent.length, 1);
    assert.match(sent[0].title, /General agreement updated/);
    assert.equal(sent[0].payload.agreement_type, 'general');
    assert.equal(sent[0].payload.agreement_document_id, '22');
  } finally {
    db.sequelize.transaction = originals.transaction;
    db.agreement_templates.findByPk = originals.templateByPk;
    db.agreement_templates.findOne = originals.templateFindOne;
    db.agreement_templates.update = originals.templateUpdate;
    db.agreement_documents.findAll = originals.documentsFindAll;
    db.agreement_documents.findOne = originals.documentsFindOne;
    db.agreement_documents.create = originals.documentsCreate;
    db.crew_members.findByPk = originals.creatorFindByPk;
    db.agreement_events.create = originals.eventCreate;
    notifications.notify = originals.notify;
  }
});

test('cancelling a pending shoot revision restores the last accepted version', async () => {
  const originals = {
    transaction: db.sequelize.transaction,
    bookingFindByPk: db.stream_project_booking.findByPk,
    documentFindByPk: db.agreement_documents.findByPk,
    assignmentUpdate: db.assigned_crew.update,
    eventCreate: db.agreement_events.create
  };
  const previous = { agreement_document_id: 4, status: 'accepted', is_current: false,
    async update(values) { Object.assign(this, values); } };
  const revision = { agreement_document_id: 5, agreement_type: 'shoot', status: 'pending_acceptance',
    parent_document_id: 4, assignment_id: 10, booking_id: 8, is_current: true,
    async update(values) { Object.assign(this, values); } };
  let assignmentChange;
  try {
    db.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
    db.stream_project_booking.findByPk = async () => ({ stream_project_booking_id: 8 });
    db.agreement_documents.findByPk = async (id) => Number(id) === 5 ? revision : previous;
    db.assigned_crew.update = async (values) => { assignmentChange = values; return [1]; };
    db.agreement_events.create = async () => ({});
    await agreements.cancelAgreement(5, { userId: 3 });
    assert.equal(revision.status, 'cancelled');
    assert.equal(previous.is_current, 1);
    assert.equal(assignmentChange.crew_accept, 1);
  } finally {
    db.sequelize.transaction = originals.transaction;
    db.stream_project_booking.findByPk = originals.bookingFindByPk;
    db.agreement_documents.findByPk = originals.documentFindByPk;
    db.assigned_crew.update = originals.assignmentUpdate;
    db.agreement_events.create = originals.eventCreate;
  }
});

test('agreement send can assign more CPs than the shoot role count', async () => {
  const originals = {
    transaction: db.sequelize.transaction,
    bookingFindByPk: db.stream_project_booking.findByPk,
    creatorsFindAll: db.crew_members.findAll,
    creatorFindByPk: db.crew_members.findByPk,
    assignmentsFindAll: db.assigned_crew.findAll,
    assignmentCreate: db.assigned_crew.create,
    documentCreate: db.agreement_documents.create,
    eventCreate: db.agreement_events.create,
    submit: compensation.submitSalesAdminCompensation,
    notify: notifications.notify
  };
  const partners = [1, 2].map((id) => ({ crew_member_id: id, primary_role: '[1]', first_name: `CP${id}`, user_id: id + 100 }));
  const documents = [];
  try {
    db.sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
    db.stream_project_booking.findByPk = async () => ({ stream_project_booking_id: 8, project_name: 'Shoot', crew_roles: '{"videographer":1}' });
    db.crew_members.findAll = async () => partners;
    db.crew_members.findByPk = async (id) => partners.find((partner) => partner.crew_member_id === id);
    db.assigned_crew.findAll = async () => [];
    db.assigned_crew.create = async (values) => ({ id: values.crew_member_id + 10, ...values });
    compensation.submitSalesAdminCompensation = async () => ({ creators: partners.map((partner) => ({
      creator_id: partner.crew_member_id, creator_earning_id: partner.crew_member_id + 20, total_compensation: 100
    })) });
    db.agreement_documents.create = async (values) => {
      const row = { agreement_document_id: documents.length + 1, ...values };
      documents.push(row);
      return row;
    };
    db.agreement_events.create = async () => ({});
    notifications.notify = async () => ({});
    const result = await agreements.assignCompensateAndSend(8, {
      compensation: { booking_id: 8, creators: partners.map((partner) => ({ creator_id: partner.crew_member_id })) },
      agreement: { content_html: '<p>Agreement</p>' }
    }, { userId: 3 });
    assert.deepEqual(result.agreement_document_ids, [1, 2]);
    assert.equal(documents.length, 2);
  } finally {
    db.sequelize.transaction = originals.transaction;
    db.stream_project_booking.findByPk = originals.bookingFindByPk;
    db.crew_members.findAll = originals.creatorsFindAll;
    db.crew_members.findByPk = originals.creatorFindByPk;
    db.assigned_crew.findAll = originals.assignmentsFindAll;
    db.assigned_crew.create = originals.assignmentCreate;
    db.agreement_documents.create = originals.documentCreate;
    db.agreement_events.create = originals.eventCreate;
    compensation.submitSalesAdminCompensation = originals.submit;
    notifications.notify = originals.notify;
  }
});
