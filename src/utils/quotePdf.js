function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value) {
  if (!value) return 'TBD';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatDurationHours(hours) {
  if (hours === null || hours === undefined || hours === '') return '-';
  const value = Number(hours);
  if (!value) return '-';
  return `${Number.isInteger(value) ? value : value.toFixed(2)} Hour`;
}

function formatCrewSize(size) {
  if (size === null || size === undefined || size === '') return '-';
  return String(size).padStart(2, '0');
}

function buildServiceRows(items) {
  if (!items.length) {
    return '<tr><td colspan="5" style="padding: 12px 0; color: #8A8A8A;">No services selected</td></tr>';
  }

  return items.map((item) => `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid #2A2A2A; color: #F8F5EF; font-size: 13px;">${escapeHtml(item.item_name || '-')}</td>
      <td style="padding: 16px 0; border-bottom: 1px solid #2A2A2A; color: #A8A8A8; font-size: 13px; text-align: center;">${String(item.quantity || 1).padStart(2, '0')}</td>
      <td style="padding: 16px 0; border-bottom: 1px solid #2A2A2A; color: #A8A8A8; font-size: 13px; text-align: center;">${formatDurationHours(item.duration_hours)}</td>
      <td style="padding: 16px 0; border-bottom: 1px solid #2A2A2A; color: #A8A8A8; font-size: 13px; text-align: center;">${formatCrewSize(item.crew_size)}</td>
      <td style="padding: 16px 0; border-bottom: 1px solid #2A2A2A; color: #D9D9D9; font-size: 13px; text-align: right;">${formatCurrency(item.line_total)}</td>
    </tr>
  `).join('');
}

function buildSimpleSectionRows(items) {
  if (!items.length) {
    return '<tr><td colspan="2" style="padding: 12px 0; color: #8A8A8A;">None</td></tr>';
  }

  return items.map((item) => `
    <tr>
      <td style="padding: 8px 0; color: #F8F5EF; font-size: 13px;">${escapeHtml(item.item_name || '-')}</td>
      <td style="padding: 8px 0; color: #D9D9D9; font-size: 13px; text-align: right;">${formatCurrency(item.line_total)}</td>
    </tr>
  `).join('');
}

function buildTerms(quote) {
  const customTerms = String(quote.terms_conditions || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const defaultTerms = [
    'All prices are in USD.',
    'Changes to the scope of work may result in additional charges.'
  ].filter(Boolean);

  const seen = new Set();
  const terms = [...customTerms, ...defaultTerms].filter((line) => {
    const normalized = String(line).toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  if (!terms.length) {
    return '<div style="color: #8A8A8A; font-size: 12px; line-height: 1.8;">No terms provided.</div>';
  }

  return terms.map((line) => `
    <div style="color: #8A8A8A; font-size: 12px; line-height: 1.8;">- ${escapeHtml(line)}</div>
  `).join('');
}

function buildQuotePdfHtml(quote) {
  const lineItems = quote.line_items || [];
  const services = lineItems.filter((item) => item.section_type === 'service');
  const addons = lineItems.filter((item) => item.section_type === 'addon');
  const logistics = lineItems.filter((item) => item.section_type === 'logistics');
  const custom = lineItems.filter((item) => item.section_type === 'custom');
  const companyName = process.env.SENDGRID_FROM_NAME || 'Beige AI';
  const companyEmail = process.env.SENDGRID_FROM_EMAIL || 'contact@beigeai.com';
  const contactName = quote.assigned_sales_rep?.name || companyName;
  const companyAddress = process.env.COMPANY_ADDRESS || '9200 Sunset Blvd. #215\nWest Hollywood, CA 90069';
  const companyAddressLines = companyAddress.split('\n').filter(Boolean);

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(quote.quote_number || 'Quote')}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          background: #111111;
          color: #F5F2EB;
        }
        .page {
          width: 100%;
          min-height: 100vh;
          background: #111111;
          padding: 36px;
        }
        .card {
          max-width: 900px;
          margin: 0 auto;
          background: #171717;
          border: 1px solid #242424;
          border-radius: 16px;
          padding: 28px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 24px;
        }
        .muted { color: #A8A8A8; }
        .small { font-size: 12px; line-height: 1.6; }
        .section-label {
          color: #7B7B7B;
          font-size: 12px;
          letter-spacing: 0.6px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }
        .divider {
          border-top: 1px solid #2A2A2A;
          margin: 24px 0;
        }
        table { width: 100%; border-collapse: collapse; }
        .project-box {
          background: #F3F1EE;
          color: #222222;
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: 8px;
        }
        .totals-box {
          background: #EAD1A5;
          border-radius: 10px;
          padding: 14px 16px;
          color: #111111;
        }
        .totals-black {
          margin-top: 12px;
          background: #111111;
          color: #F2E0BF;
          border-radius: 8px;
          padding: 12px 14px;
          font-weight: 700;
        }
        .logo-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #EAD1A5;
          color: #111111;
          font-weight: 700;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          <div class="row">
            <div style="flex:1;">
              <div style="display:flex; align-items:flex-start;">
                <div class="logo-pill">B</div>
                <div>
                  <div style="font-size: 18px; font-weight: 700; color: #F5E7C8;">${escapeHtml(companyName)}</div>
                  <div class="small muted">Production Marketplace</div>
                </div>
              </div>
              <div style="margin-top: 16px;" class="small muted">
                ${companyAddressLines.map((line) => `${escapeHtml(line)}<br>`).join('')}
                ${escapeHtml(companyEmail)}
              </div>
            </div>
            <div style="width: 240px; text-align:right;">
              <div style="font-size: 28px; font-weight: 700; color: #FFFFFF;">QUOTATION</div>
              <div class="small muted" style="margin-top: 10px;">Quote #: ${escapeHtml(quote.quote_number || 'N/A')}</div>
              <div class="small muted">Date: ${formatDate(quote.created_at)}</div>
              <div class="small muted">Valid Until: ${formatDate(quote.valid_until)}</div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="section-label">Bill To</div>
          <div style="font-size: 24px; font-weight: 700;">${escapeHtml(quote.client_name || 'N/A')}</div>
          <div class="small muted" style="margin-top: 6px;">
            ${escapeHtml(quote.client_address || '')}<br>
            ${escapeHtml(quote.client_email || '')}<br>
            ${escapeHtml(quote.client_phone || '')}
          </div>

          <div style="margin-top: 24px;">
            <div class="section-label">Project Description</div>
            <div class="project-box">${escapeHtml(quote.project_description || 'N/A')}</div>
          </div>

          <div class="divider"></div>

          <div class="section-label">Services</div>
          <table>
            <thead>
              <tr>
                <th style="text-align:left; color:#8A8A8A; font-size:12px; font-weight:500; padding-bottom:10px;">Description</th>
                <th style="text-align:center; color:#8A8A8A; font-size:12px; font-weight:500; padding-bottom:10px;">Qty</th>
                <th style="text-align:center; color:#8A8A8A; font-size:12px; font-weight:500; padding-bottom:10px;">Duration</th>
                <th style="text-align:center; color:#8A8A8A; font-size:12px; font-weight:500; padding-bottom:10px;">Crew</th>
                <th style="text-align:right; color:#8A8A8A; font-size:12px; font-weight:500; padding-bottom:10px;">Amount</th>
              </tr>
            </thead>
            <tbody>${buildServiceRows(services)}</tbody>
          </table>

          <div class="divider"></div>

          <div class="section-label">Add-Ons</div>
          <table><tbody>${buildSimpleSectionRows(addons)}</tbody></table>

          <div class="divider"></div>

          <div class="section-label">Logistics</div>
          <table><tbody>${buildSimpleSectionRows(logistics)}</tbody></table>

          ${custom.length ? `
            <div class="divider"></div>
            <div class="section-label">Additional Items</div>
            <table><tbody>${buildSimpleSectionRows(custom)}</tbody></table>
          ` : ''}

          <div style="margin-top: 28px;" class="totals-box">
            <div style="display:flex; justify-content:space-between; font-size: 13px; margin-bottom: 8px;">
              <span>Subtotal</span>
              <span>${formatCurrency(quote.subtotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 13px; margin-bottom: 8px;">
              <span>Discount</span>
              <span>${formatCurrency(quote.discount_amount)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 13px;">
              <span>${escapeHtml(quote.tax_type || 'Tax')} (${Number(quote.tax_rate || 0)}%)</span>
              <span>${formatCurrency(quote.tax_amount)}</span>
            </div>
            <div class="totals-black">
              <div style="display:flex; justify-content:space-between;">
                <span>Total</span>
                <span>${formatCurrency(quote.total)}</span>
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="section-label">Terms & Conditions</div>
          ${buildTerms(quote)}

          <div class="divider"></div>

          <div class="small muted" style="text-align:center;">
            Thank you for your business! For questions, contact ${escapeHtml(contactName)} at ${escapeHtml(companyEmail)}
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

async function generateQuotePdfBuffer(quote) {
  let puppeteer;

  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    throw new Error('PDF generation dependency is missing. Please install puppeteer.');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(buildQuotePdfHtml(quote), { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  buildQuotePdfHtml,
  generateQuotePdfBuffer
};
