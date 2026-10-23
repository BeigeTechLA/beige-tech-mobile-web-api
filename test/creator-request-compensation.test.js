const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/models');
const { getCreatorRequestCompensation } = require('../src/services/creator-request-compensation.service');

test('request compensation uses the CP finance amount and a sent agreement fallback', async () => {
  const originalEarnings = db.creator_earnings.findAll;
  const originalAgreements = db.agreement_documents.findAll;
  let earningsQuery;
  let agreementsQuery;
  try {
    db.creator_earnings.findAll = async (options) => {
      earningsQuery = options;
      return [
        { booking_id: 10, net_earning_amount: '562.50', gross_amount: '2050.00', currency: 'USD' },
        { booking_id: 11, net_earning_amount: '0.00', gross_amount: '100.00', currency: 'USD' }
      ];
    };
    db.agreement_documents.findAll = async (options) => {
      agreementsQuery = options;
      return [
        { booking_id: 10, compensation_amount: '500.00', currency: 'USD' },
        { booking_id: 12, compensation_amount: '275.00', currency: 'EUR' }
      ];
    };

    const amounts = await getCreatorRequestCompensation(7, [10, 11, 12, 13]);
    assert.equal(earningsQuery.where.creator_id, 7);
    assert.equal(agreementsQuery.where.creator_id, 7);
    assert.deepEqual(amounts.get(10), { compensation_amount: 562.5, compensation_currency: 'USD' });
    assert.deepEqual(amounts.get(11), { compensation_amount: 0, compensation_currency: 'USD' });
    assert.deepEqual(amounts.get(12), { compensation_amount: 275, compensation_currency: 'EUR' });
    assert.equal(amounts.has(13), false);
  } finally {
    db.creator_earnings.findAll = originalEarnings;
    db.agreement_documents.findAll = originalAgreements;
  }
});
