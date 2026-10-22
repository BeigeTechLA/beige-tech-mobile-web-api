const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadService({ pushAllowed = true, pushFails = false } = {}) {
  const saved = [];
  const pushed = [];
  const model = {
    create: async (row) => {
      const notification = { ...row, notification_id: saved.length + 1 };
      saved.push(notification);
      return notification;
    }
  };
  const push = {
    isPushCategoryAllowedForUser: async () => pushAllowed,
    sendPushToUser: async (payload) => {
      pushed.push(payload);
      if (pushFails) throw new Error('FCM unavailable');
    }
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/app-notification.service.js'), 'utf8');
  vm.runInNewContext(source, {
    module, exports: module.exports, Date, Math, Number, String, Set, Promise,
    console: { error: () => {} },
    require: (name) => {
      if (name === 'sequelize') return { Op: { in: Symbol('in'), gte: Symbol('gte') } };
      if (name === '../models') return { app_notifications: model };
      if (name === '../utils/constants') return { BAD_REQUEST: { code: 400 }, INTERNAL_SERVER_ERROR: { code: 500 } };
      if (name === './push-notification.service') return push;
      throw new Error(`Unexpected require: ${name}`);
    }
  });
  return { service: module.exports, saved, pushed };
}

const notification = {
  userId: 17,
  title: 'New lead',
  message: 'A lead was assigned to you.',
  topic: 'shoots',
  category: 'leads',
  type: 'lead_assigned',
  referenceType: 'sales_lead',
  referenceId: '42',
  deliverySurfaces: ['web_app']
};

test('muting a category skips push but retains its dashboard inbox row', async () => {
  const { service, saved, pushed } = loadService({ pushAllowed: false });
  const result = await service.createAndPushNotification(notification);
  assert.equal(result.notification_id, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].category, 'leads');
  assert.equal(saved[0].delivery_surface, 'web_app');
  assert.equal(pushed.length, 0);
});

test('enabled category saves before sending push with the inbox ID', async () => {
  const { service, saved, pushed } = loadService();
  await service.createAndPushNotification(notification);
  assert.equal(saved.length, 1);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].data.notification_id, '1');
});

test('FCM failure does not remove the saved dashboard notification', async () => {
  const { service, saved, pushed } = loadService({ pushFails: true });
  const result = await service.createAndPushNotification(notification);
  assert.equal(result.notification_id, 1);
  assert.equal(saved.length, 1);
  assert.equal(pushed.length, 1);
});

test('stored category mutes suppress normal push, but critical push bypasses them', async () => {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/push-notification.service.js'), 'utf8');
  vm.runInNewContext(source, {
    module, exports: module.exports, Date, Number, String, Set, Object,
    require: (name) => {
      if (name === '../models') return {
        user_notification_preferences: { findOne: async () => ({ muted_categories: ['leads'] }) },
        users: {}
      };
      if (name === '../utils/constants') return { BAD_REQUEST: { code: 400 } };
      throw new Error(`Unexpected require: ${name}`);
    }
  });
  const service = module.exports;
  assert.equal(await service.isPushCategoryAllowedForUser({ userId: 17, category: 'leads' }), false);
  assert.equal(await service.isPushCategoryAllowedForUser({ userId: 17, category: 'payments' }), true);
  assert.equal(await service.isPushCategoryAllowedForUser({ userId: 17, category: 'leads', priority: 'critical' }), true);
});

test('all categories shown by the web preference screen are accepted by the API', async () => {
  const categories = [
    'shoots', 'leads', 'payments', 'payouts', 'messages', 'meetings',
    'proposals', 'agreements', 'files', 'disputes', 'reviews', 'system'
  ];
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/push-notification.service.js'), 'utf8');
  vm.runInNewContext(source, {
    module, exports: module.exports, Date, Number, String, Set, Object,
    require: (name) => {
      if (name === '../models') return {
        user_notification_preferences: {
          findOne: async () => null,
          create: async (row) => row
        },
        users: {}
      };
      if (name === '../utils/constants') return { BAD_REQUEST: { code: 400 } };
      throw new Error(`Unexpected require: ${name}`);
    }
  });
  const result = await module.exports.updateInboxNotificationPreferences({ userId: 17, mutedCategories: categories });
  assert.deepEqual(Array.from(result.muted_categories), categories);
});
