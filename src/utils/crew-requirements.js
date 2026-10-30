function parse(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function getCrewRequirements(booking = {}) {
  const raw = parse(booking.crew_roles);
  const counts = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const role of ['hybrid', 'photographer', 'videographer', 'cinematographer']) {
      const count = Number(raw[role] ?? (role === 'hybrid' ? raw.photoVideoCreator : 0));
      if (Number.isInteger(count) && count > 0) counts[role] = count;
    }
  }
  const slots = Object.entries(counts).flatMap(([role, count]) => Array(count).fill(role));
  if (!slots.length) {
    const count = Number(booking.crew_size_needed);
    if (Number.isInteger(count) && count > 0) slots.push(...Array(count).fill('any'));
  }
  return { counts, slots, total: slots.length };
}

function getCreatorSkills(primaryRole) {
  const parsed = parse(primaryRole) ?? primaryRole;
  const roles = (Array.isArray(parsed) ? parsed : String(parsed ?? '').split(','))
    .map((role) => String(role).trim().toLowerCase());
  const photo = roles.some((role) => ['2', '10', 'photographer', 'photography', 'hybrid'].includes(role));
  const video = roles.some((role) => ['1', '9', 'videographer', 'videography', 'hybrid'].includes(role));
  return new Set([
    'any', ...(photo ? ['photographer'] : []), ...(video ? ['videographer'] : []),
    ...(photo && video ? ['hybrid'] : []),
    ...(roles.some((role) => ['3', '11', 'cinematographer'].includes(role)) ? ['cinematographer'] : [])
  ]);
}

// Match people to distinct positions. Reassigning flexible matches lets a dual
// skilled CP and a photo-only CP cover video + photo in either acceptance order.
function matchCrewToRequirements(booking, creators) {
  const { slots, total } = getCrewRequirements(booking);
  if (!total || creators.length > total) return { fits: false, total, roles: [] };
  const skills = creators.map((creator) => getCreatorSkills(creator.primary_role));
  const occupied = Array(total).fill(-1);
  function place(person, visited) {
    for (let slot = 0; slot < total; slot += 1) {
      if (visited.has(slot) || !skills[person].has(slots[slot])) continue;
      visited.add(slot);
      if (occupied[slot] === -1 || place(occupied[slot], visited)) {
        occupied[slot] = person;
        return true;
      }
    }
    return false;
  }
  const fits = creators.every((_, person) => place(person, new Set()));
  const roles = creators.map((_, person) => slots[occupied.indexOf(person)] || null);
  return { fits, total, roles };
}

module.exports = { getCrewRequirements, getCreatorSkills, matchCrewToRequirements };
