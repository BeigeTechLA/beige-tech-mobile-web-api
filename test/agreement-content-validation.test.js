const test = require('node:test');
const assert = require('node:assert/strict');
const agreements = require('../src/services/agreements.service');

test('general agreements reject empty sections before writing a template', async () => {
  const base = { title: 'General Terms', content_html: '<p>Introduction</p>' };
  await assert.rejects(
    agreements.createGeneralTemplate({ ...base, content_json: { sections: [] } }, {}),
    /at least one agreement section/
  );
  await assert.rejects(
    agreements.createGeneralTemplate({ ...base, content_json: { sections: [{ title: 'Terms', content: '<p><br>&nbsp;</p>' }] } }, {}),
    /Section 1 needs a title and content/
  );
});

test('shoot agreement send rejects title-only and formatting-only sections before assignment', async () => {
  const compensation = { booking_id: 8, creators: [{ creator_id: 17 }] };
  await assert.rejects(
    agreements.assignCompensateAndSend(8, {
      compensation,
      agreement: { content_html: '<section><h2>Terms</h2><p><br></p></section>' }
    }, {}),
    /Section 1 needs a title and content/
  );
  await assert.rejects(
    agreements.assignCompensateAndSend(8, {
      compensation,
      agreement: { content_html: '<section><h2>Terms</h2></section>', content_json: { sections: [{ title: 'Terms', content: '' }] } }
    }, {}),
    /Section 1 needs a title and content/
  );
  await assert.rejects(
    agreements.assignCompensateAndSend(8, {
      compensation,
      agreement: { content_html: '<p><br>&nbsp;</p>', content_json: { sections: [{ title: 'Terms', content: 'Real content' }] } }
    }, {}),
    /Agreement content is required/
  );
});
