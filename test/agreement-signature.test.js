const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validateAgreementSignature } = require('../src/utils/agreement-signature');

// A tiny PNG produced by a canvas. The server stores exactly the bytes signed.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('accepts a PNG signature and hashes the stored bytes', () => {
  const signed = validateAgreementSignature(`data:image/png;base64,${png}`);
  assert.equal(signed.dataUrl, `data:image/png;base64,${png}`);
  assert.equal(signed.sha256, crypto.createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
});

test('rejects missing, non-PNG, and oversized signatures', () => {
  for (const value of [null, 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,AAAA', `data:image/png;base64,${'A'.repeat(700001)}`]) {
    assert.throws(() => validateAgreementSignature(value), { statusCode: 400 });
  }
});
