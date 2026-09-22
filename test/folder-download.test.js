const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup({ folders = [], assigned = true, clientOwns = true } = {}) {
  const requests = [];
  const db = {
    users: { findByPk: async () => ({ email: 'creator@example.com' }) },
    crew_members: { findOne: async () => ({ crew_member_id: 42 }) },
    assigned_crew: { findOne: async () => assigned ? { id: 1 } : null },
    stream_project_booking: { findOne: async () => clientOwns ? { stream_project_booking_id: 5401 } : null },
    sequelize: { query: async (sql, options) => {
      if (!sql.includes('FROM file_manager_common_event_creator_folders')) return [[]];
      assert.equal(options.replacements[1], 7);
      return [folders.filter((row) => !options.replacements[2] || row.phase === options.replacements[2])];
    } },
  };
  const controller = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/external-file-manager.controller.js'), 'utf8'), {
    exports: controller, process: { env: {} }, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    require: (name) => name === '../models' ? db : ['crypto', 'stream'].includes(name) ? require(name) : {},
    fetch: async (url, options) => {
      requests.push({ url, body: options.body && JSON.parse(options.body) });
      return { ok: true, headers: new Map(), body: null, json: async () => ({ success: true, data: { url: 'http://localhost:5002/v1/gcp/download-folder?folderpath=owned' } }) };
    },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
  async function download(body, userRole = 'creator') {
    await controller.getFolderDownloadUrl({ body, userRole, userId: 7, headers: { host: 'api.beige.test' } }, res);
    return res;
  }
  return { controller, download, requests, res };
}

const owned = (folder_path, phase = 'root') => ({ folder_path, phase, root_path: 'Event - Demo', event_name: 'Demo' });

for (const role of ['creator', 'creative', 'Creative']) {
  test(`${role} can download an event root scoped to their own folder`, async () => {
    const { download, requests } = setup({ folders: [owned('Event - Demo/Rachana')] });
    const res = await download({ externalId: 'event_demo' }, role);
    assert.equal(res.code, 200);
    assert.deepEqual(requests[0].body, { externalId: 'event_demo', phase: 'root', path: 'Rachana' });
    assert.match(res.body.data.url, /^http:\/\/api.beige.test\//);
  });
}

test('event root download includes all owned phases and folders', async () => {
  const { download, requests } = setup({ folders: [owned('Rachana'), owned('Rachana', 'pre'), owned('Rachana', 'post')] });
  assert.equal((await download({ externalId: 'event_demo' })).code, 200);
  assert.deepEqual(requests[0].body.folders, [
    { phase: 'root', path: 'Rachana' }, { phase: 'pre', path: 'Rachana' }, { phase: 'post', path: 'Rachana' },
  ]);
});

test('phase and ancestor downloads select only matching owned folders', async () => {
  const { download, requests } = setup({ folders: [owned('Team/Rachana', 'post'), owned('Other', 'pre')] });
  assert.equal((await download({ externalId: 'event_demo', phase: 'post-production', path: 'Team' })).code, 200);
  assert.deepEqual(requests[0].body, { externalId: 'event_demo', phase: 'post', path: 'Team/Rachana' });
});

test('nested folder downloads keep the requested subfolder', async () => {
  const { download, requests } = setup({ folders: [owned('Rachana')] });
  assert.equal((await download({ externalId: 'event_demo', path: 'Rachana/Final' })).code, 200);
  assert.equal(requests[0].body.path, 'Rachana/Final');
});

for (const input of [{ folders: [] }, { folders: [owned('Rachana')], path: 'Another Creator' }]) {
  test(`unauthorized event folders do not reach storage: ${input.path || 'no ownership'}`, async () => {
    const { download, requests } = setup(input);
    assert.equal((await download({ externalId: 'event_demo', path: input.path })).code, 403);
    assert.equal(requests.length, 0);
  });
}

for (const role of ['admin', 'sales_admin', 'sales_rep', 'client']) {
  test(`${role} retains event root downloads`, async () => {
    const { download, requests } = setup();
    assert.equal((await download({ externalId: 'event_demo' }, role)).code, 200);
    assert.deepEqual(requests[0].body, { externalId: 'event_demo' });
  });
}

for (const role of ['creator', 'client']) {
  test(`${role} retains authorized project downloads`, async () => {
    const { download, requests } = setup();
    assert.equal((await download({ externalId: '5401', phase: 'post' }, role)).code, 200);
    assert.deepEqual(requests[0].body, { externalId: '5401', phase: 'post' });
  });
}

test('unassigned creator cannot download project folders', async () => {
  const { download, requests } = setup({ assigned: false });
  assert.equal((await download({ externalId: '5401' })).code, 403);
  assert.equal(requests.length, 0);
});

test('ZIP proxy preserves multiple folder paths including spaces', async () => {
  const { controller, requests, res } = setup();
  const folderpath = ['Event - Demo/Rachana/', 'Event - Demo/Pre-Production/Rachana/'];
  await controller.downloadFolderZip({ query: { folderpath } }, res);
  assert.deepEqual(new URL(requests[0].url).searchParams.getAll('folderpath'), folderpath);
});
