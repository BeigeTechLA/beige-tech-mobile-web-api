const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('lead reminders require an explicit deadline and an unanswered assigned lead', async () => {
  const op = { ne: Symbol('ne'), lte: Symbol('lte'), notIn: Symbol('notIn') };
  const calls = [];
  let page = 0;
  const db = {
    Sequelize: { Op: op },
    sales_leads: { findAll: async (query) => {
      calls.push(query);
      return page++ ? [] : [{ lead_id: 31, booking_id: 44, assigned_sales_rep_id: 17 }];
    } },
    app_notifications: { findOne: async () => null }
  };
  const sent = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/overdue-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Date, String,
    require: (name) => name === '../models' ? db : {
      notify: async (notification) => { sent.push(notification); return { notification_id: 1 }; }
    }
  });
  const result = await module.exports.runOverdueLeadNotifications();
  assert.equal(result.sent, 1);
  assert.equal(sent[0].userId, 17);
  assert.equal(sent[0].referenceId, '31');
  assert.equal(calls[0].where.owner_responded_at, null);
  assert.ok(calls[0].where.response_due_at[op.lte] instanceof Date);
});

test('upcoming reminders target a linked client, quote owner, and confirmed shoot crew once', async () => {
  const op = { in: Symbol('in'), ne: Symbol('ne') };
  const sent = [];
  const existing = new Set();
  const db = {
    Sequelize: { Op: op },
    sales_quotes: { findAll: async () => [{ sales_quote_id: 4, quote_number: 'Q-4', client_user_id: 209, assigned_sales_rep_id: 17 }] },
    stream_project_booking: {
      findAll: async () => [{ stream_project_booking_id: 42 }],
      findByPk: async () => ({ user_id: 209 })
    },
    assigned_crew: { findAll: async (query) => {
      assert.equal(query.where.crew_accept, 1);
      return [{ crew_member_id: 7 }];
    } },
    crew_members: { findAll: async () => [{ user_id: 108 }] },
    app_notifications: { findOne: async ({ where }) => existing.has(`${where.user_id}:${where.type}:${where.reference_id}`) ? { notification_id: 1 } : null }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/overdue-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Date, String, Number, Set,
    require: (name) => name === '../models' ? db : {
      notify: async (notification) => {
        sent.push(notification);
        existing.add(`${notification.userId}:${notification.type}:${notification.referenceId}`);
        return { notification_id: sent.length };
      }
    }
  });
  const now = new Date(2026, 9, 14, 12);
  assert.equal((await module.exports.runUpcomingNotifications(now)).sent, 4);
  assert.equal((await module.exports.runUpcomingNotifications(now)).sent, 0);
  assert.deepEqual(sent.map((item) => item.userId).sort((a, b) => a - b), [17, 108, 209, 209]);
  assert.equal(sent[0].payload.valid_until, '2026-10-15');
});

test('overdue revision job only sends owner alert for a dated, undelivered request', async () => {
  const sent = [];
  let queryText = '';
  const db = {
    Sequelize: { QueryTypes: { SELECT: 'SELECT' } },
    sequelize: { query: async (sql, options) => {
      queryText = sql;
      assert.equal(options.replacements.today, '2026-10-14');
      return [{ activity_id: 501, lead_id: 31, booking_id: 44, assigned_sales_rep_id: 17, due_date: '2026-10-13' }];
    } },
    app_notifications: { findOne: async () => null }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/overdue-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Date, String,
    require: (name) => name === '../models' ? db : {
      notify: async (notification) => { sent.push(notification); return { notification_id: 1 }; }
    }
  });
  assert.equal((await module.exports.runOverdueRevisionNotifications(new Date(2026, 9, 14))).sent, 1);
  assert.equal(sent[0].userId, 17);
  assert.equal(sent[0].payload.booking_id, '44');
  assert.match(queryText, /revised_content_delivered/);
  assert.match(queryText, /revision_request_received/);
});

test('delivery follow-up requires recorded estimate and post-production status', async () => {
  const sent = [];
  let page = 0;
  const op = { lt: Symbol('lt') };
  const db = {
    Sequelize: { Op: op },
    stream_project_booking: { findAll: async ({ where }) => {
      assert.equal(where.status, 2);
      assert.equal(where.estimated_delivery_date[op.lt], '2026-10-14');
      return page++ ? [] : [{ stream_project_booking_id: 42, estimated_delivery_date: '2026-10-13' }];
    } },
    app_notifications: { findOne: async () => null }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/overdue-notification.service.js'), 'utf8'), {
    module, exports: module.exports, Date, String,
    require: (name) => name === '../models' ? db : {
      bookingOwner: async () => 17,
      notify: async (notification) => { sent.push(notification); return { notification_id: 1 }; }
    }
  });
  assert.equal((await module.exports.runDeliveryFollowUpNotifications(new Date(2026, 9, 14))).sent, 1);
  assert.equal(sent[0].userId, 17);
  assert.equal(sent[0].payload.booking_id, '42');
});
