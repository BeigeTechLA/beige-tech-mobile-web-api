const crypto = require('crypto');

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });

function validateAgreementSignature(value) {
  const raw = String(value || '');
  if (raw.length > 700000) throw invalid('Signature image must be a valid PNG under 512 KB');
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!match) throw invalid('A drawn PNG signature is required to accept the agreement');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 512 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw invalid('Signature image must be a valid PNG under 512 KB');
  }
  return {
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

module.exports = { validateAgreementSignature };
