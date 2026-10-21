const { Op } = require('sequelize');

const fields = [
  { key: 'email', code: 'EMAIL', label: 'Email' },
  { key: 'phone_number', code: 'PHONE', label: 'phone number' },
  { key: 'instagram_handle', code: 'INSTAGRAM', label: 'Instagram handle' }
];

function describeSignupConflicts(matches, submitted) {
  const conflicts = fields.filter(({ key }) => {
    const value = String(submitted[key] || '').trim();
    if (!value) return false;
    return matches.some((match) => String(match[key] || '').trim().toLowerCase() === value.toLowerCase());
  });
  if (!conflicts.length) return null;

  const labels = conflicts.map(({ label }) => label);
  const rawSubject = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  const subject = rawSubject[0].toUpperCase() + rawSubject.slice(1);
  return {
    success: false,
    code: `${conflicts.map(({ code }) => code).join('_AND_')}_EXISTS`,
    conflicts: conflicts.map(({ key }) => key),
    message: `${subject} already ${conflicts.length === 1 ? 'exists' : 'exist'}.`
  };
}

async function findSignupConflicts(User, submitted, transaction) {
  const conditions = fields
    .filter(({ key }) => String(submitted[key] || '').trim())
    .map(({ key }) => ({ [key]: String(submitted[key]).trim() }));
  if (!conditions.length) return null;
  const matches = await User.scope('all').findAll({
    where: { [Op.or]: conditions },
    attributes: ['email', 'phone_number', 'instagram_handle'],
    ...(transaction ? { transaction } : {})
  });
  return describeSignupConflicts(matches, submitted);
}

module.exports = { describeSignupConflicts, findSignupConflicts };
