const test = require('node:test');
const assert = require('node:assert/strict');
const { getCrewRequirements, matchCrewToRequirements } = require('../src/utils/crew-requirements');
const photo = { primary_role: '[10]' };
const video = { primary_role: '[9]' };
const hybrid = { primary_role: '[9,10]' };

test('role counts define positions independently of invitation count', () => {
  assert.equal(getCrewRequirements({ crew_roles: '{"photographer":1,"videographer":1,"hybrid":1}', crew_size_needed: 12 }).total, 3);
  assert.equal(getCrewRequirements({ crew_roles: '[]', crew_size_needed: 3 }).total, 3);
  assert.equal(getCrewRequirements({}).total, 0);
});

test('dual skilled CPs can fill either dedicated role without double counting', () => {
  const booking = { crew_roles: { photographer: 1, videographer: 1 } };
  for (const creators of [[hybrid, photo], [photo, hybrid], [hybrid, video], [video, hybrid], [hybrid, hybrid]]) {
    const result = matchCrewToRequirements(booking, creators);
    assert.equal(result.fits, true);
    assert.deepEqual([...result.roles].sort(), ['photographer', 'videographer']);
  }
  assert.equal(matchCrewToRequirements(booking, [photo, photo]).fits, false);
  assert.equal(matchCrewToRequirements(booking, [hybrid, photo, video]).fits, false);
});

test('photo + video + hybrid accepts exactly three eligible people in any order', () => {
  const booking = { crew_roles: { photographer: 1, videographer: 1, hybrid: 1 } };
  for (const creators of [[photo, video, hybrid], [hybrid, photo, video], [video, hybrid, photo], [hybrid, hybrid, hybrid]]) {
    const result = matchCrewToRequirements(booking, creators);
    assert.equal(result.fits, true);
    assert.deepEqual([...result.roles].sort(), ['hybrid', 'photographer', 'videographer']);
  }
  assert.equal(matchCrewToRequirements(booking, [photo, photo]).fits, false);
  assert.equal(matchCrewToRequirements(booking, [photo, video, video]).fits, false);
  assert.equal(matchCrewToRequirements(booking, [hybrid, hybrid, hybrid, hybrid]).fits, false);
});
