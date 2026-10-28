const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ ownerId = 17, creatorUserId = 108 } = {}) {
  const sent = [];
  const db = {
    users: { findByPk: async (id) => ({ user_type: id === creatorUserId ? 2 : 1, is_active: 1 }) },
    sales_leads: { findOne: async () => ownerId ? { assigned_sales_rep_id: ownerId } : null },
    crew_members: { findByPk: async () => ({ user_id: creatorUserId }) },
    app_notifications: { findOne: async () => null }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/business-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Number, String, console,
    require: (name) => name === '../models' ? db : {
      createAndPushNotification: async (notification) => { sent.push(notification); return { notification_id: sent.length }; }
    }
  });
  return { service: module.exports, sent };
}

test('booking alerts go only to the assigned owner', async () => {
  const { service, sent } = harness();
  await service.notifyBookingOwner(42, { title: 'Test', message: 'Test', topic: 'shoots', type: 'test' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, 17);
  assert.deepEqual(Array.from(sent[0].deliverySurfaces), ['web_app']);
});

test('shoot change reaches client and confirmed creator but not actor', async () => {
  const sent = [];
  const db = {
    users: { findByPk: async (id) => ({ user_type: id === 108 ? 2 : 3, is_active: 1 }) },
    stream_project_booking: { findByPk: async () => ({ user_id: 209 }) },
    assigned_crew: { findAll: async ({ where }) => {
      assert.equal(where.crew_accept, 1);
      return [{ crew_member_id: 7 }];
    } },
    crew_members: { findAll: async () => [{ user_id: 108 }] }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/business-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Number, String, Set, console,
    require: (name) => name === '../models' ? db : {
      createAndPushNotification: async (notification) => { sent.push(notification); return notification; }
    }
  });
  await module.exports.notifyShootAudience(42, { title: 'Changed', message: 'Changed', topic: 'shoots', type: 'shoot_changed' }, { excludeUserId: 209 });
  assert.deepEqual(sent.map((item) => item.userId), [108]);
});

test('unassigned bookings do not broadcast to admins', async () => {
  const { service, sent } = harness({ ownerId: null });
  await service.notifyBookingOwner(42, { title: 'Test', message: 'Test', topic: 'shoots', type: 'test' });
  assert.equal(sent.length, 0);
});

test('creator dispute updates use creator login identity and portal type', async () => {
  const { service, sent } = harness();
  await service.notifyDisputeParticipant({
    dispute_id: 9, booking_id: 42, raised_by: { type: 'creator' }, creator: { id: 7 }
  }, 'dispute_updated', 'Your dispute changed');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, 108);
  assert.equal(sent[0].appUserType, '2');
  assert.equal(sent[0].referenceId, '9');
});

test('guest quotes cannot create a client push without a linked account', async () => {
  const { service, sent } = harness();
  await service.notifyQuoteClient({ client_user_id: null }, { title: 'Quote ready', message: 'Ready', topic: 'shoots', type: 'quote_sent' });
  assert.equal(sent.length, 0);
  await service.notifyQuoteClient({ client_user_id: 209 }, { title: 'Quote ready', message: 'Ready', topic: 'shoots', type: 'quote_sent' });
  assert.equal(sent[0].userId, 209);
});
