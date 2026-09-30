const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric'
}) : 'Not specified';

function buildGeneralAgreementPdfHtml({ agreement, version, sections, acceptance, creativePartner }) {
  const acceptanceSummary = acceptance?.status === 'accepted'
    ? `Accepted by ${escapeHtml([creativePartner?.first_name, creativePartner?.last_name].filter(Boolean).join(' ') || creativePartner?.email || 'Creative Partner')} on ${escapeHtml(formatDate(acceptance.accepted_at))}`
    : 'Not yet accepted';

  return `<!doctype html>
  <html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; color: #1f1f1f; font-size: 11pt; line-height: 1.55; }
    h1 { font-size: 22pt; margin: 0 0 4px; } h2 { font-size: 14pt; margin: 26px 0 8px; }
    .meta, .acceptance { color: #555; margin: 4px 0; } .acceptance { border-top: 1px solid #ccc; margin-top: 32px; padding-top: 12px; }
    .section-body { white-space: pre-wrap; } .name { font-weight: bold; }
  </style></head><body>
    <h1>${escapeHtml(agreement.agreement_title)}</h1>
    <div class="name">${escapeHtml(agreement.agreement_name)}</div>
    <div class="meta">Effective date: ${escapeHtml(formatDate(version.effective_date || agreement.effective_date))}</div>
    <div class="meta">Version: ${escapeHtml(version.version_number)}</div>
    ${(sections || []).map((section) => `<section><h2>${escapeHtml(section.section_title)}</h2><div class="section-body">${escapeHtml(section.section_body)}</div></section>`).join('')}
    <div class="acceptance">${acceptanceSummary}</div>
  </body></html>`;
}

async function generateGeneralAgreementPdfBuffer(data) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(buildGeneralAgreementPdfHtml(data), { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '24px', right: '28px', bottom: '24px', left: '28px' } });
  } finally {
    await browser.close();
  }
}

module.exports = { generateGeneralAgreementPdfBuffer };
