const db = require('../models');
const externalFileManager = require('../controllers/external-file-manager.controller');

const nameOf = (row) => [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || row?.email || null;
const isEditor = (value) => {
  let roles = value;
  if (typeof roles === 'string') { try { roles = JSON.parse(roles); } catch (_) { roles = roles.split(','); } }
  return (Array.isArray(roles) ? roles : [roles]).some((role) => ['3', 'editor'].includes(String(role || '').trim().toLowerCase()));
};

// Workflow is a best-effort projection of SQL assignment state. It must never
// make assignment, removal, or agreement acceptance fail when web-api-2 is down.
async function syncEditor(bookingId) {
  try {
    const [internal, external] = await Promise.all([
      db.assigned_post_production_member.findOne({
        where: { project_id: Number(bookingId), is_active: 1 },
        order: [['assigned_date', 'DESC'], ['id', 'DESC']],
        include: [{ model: db.post_production_members, as: 'post_production_member', required: true }],
      }),
      db.assigned_crew.findAll({
        where: { project_id: Number(bookingId), is_active: 1, crew_accept: 1 },
        order: [['assigned_date', 'DESC'], ['id', 'DESC']],
        include: [{ model: db.crew_members, as: 'crew_member', required: true }],
      }),
    ]);
    const selected = internal
      ? { id: internal.post_production_member?.post_production_member_id, name: nameOf(internal.post_production_member), editorType: 'internal' }
      : external.find((assignment) => isEditor(assignment.crew_member?.primary_role))
        ? (() => { const editor = external.find((assignment) => isEditor(assignment.crew_member?.primary_role)); return { id: editor.crew_member?.user_id || editor.crew_member_id, name: nameOf(editor.crew_member), editorType: Number(editor.crew_member?.is_beige_member) === 1 ? 'internal' : 'external' }; })()
        : null;
    await externalFileManager.proxyRequest(`/workflows/${encodeURIComponent(String(bookingId))}/requirements`, {
      method: 'PUT',
      body: JSON.stringify({ editorId: selected?.id || null, editorName: selected?.name || null, editorType: selected?.editorType || null }),
    });
  } catch (error) {
    console.error('Workflow editor sync failed:', error.message || error);
  }
}

module.exports = { syncEditor };
