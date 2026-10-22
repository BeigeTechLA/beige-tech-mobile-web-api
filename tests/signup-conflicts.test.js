const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeSignupConflicts, findSignupConflicts } = require('../src/utils/signup-conflicts');

test('signup conflict messages identify each submitted identifier', () => {
  const existing = [
    { email: 'old@example.com', phone_number: '+15550001111' },
    { email: 'another@example.com', phone_number: '+15550002222', instagram_handle: '@taken' }
  ];
  const cases = [
    [{ email: 'new@example.com', phone_number: '+15550001111' }, 'Phone number already exists.', ['phone_number']],
    [{ email: 'OLD@example.com', phone_number: '+15550003333' }, 'Email already exists.', ['email']],
    [{ email: 'old@example.com', phone_number: '+15550001111' }, 'Email and phone number already exist.', ['email', 'phone_number']],
    [{ email: 'old@example.com', phone_number: '+15550002222' }, 'Email and phone number already exist.', ['email', 'phone_number']],
    [{ email: 'new@example.com', instagram_handle: '@taken' }, 'Instagram handle already exists.', ['instagram_handle']]
  ];
  for (const [submitted, message, conflicts] of cases) {
    const result = describeSignupConflicts(existing, submitted);
    assert.equal(result.message, message);
    assert.deepEqual(result.conflicts, conflicts);
  }
  assert.equal(describeSignupConflicts(existing, { email: 'new@example.com', phone_number: '+15550003333' }), null);
});

test('signup lookup includes inactive accounts and all matching rows', async () => {
  let options;
  const User = { scope(name) {
    assert.equal(name, 'all');
    return { findAll: async (query) => {
      options = query;
      return [{ email: 'old@example.com' }, { phone_number: '+15550002222' }];
    } };
  } };
  const result = await findSignupConflicts(User, { email: 'old@example.com', phone_number: '+15550002222' });
  assert.equal(result.code, 'EMAIL_AND_PHONE_EXISTS');
  assert.equal(options.attributes.includes('phone_number'), true);
});
