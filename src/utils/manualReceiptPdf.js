const fs = require('fs');
const path = require('path');

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
  return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyBold(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatHours(value) {
  if (value === null || value === undefined || value === '') return '';
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return '';
  const formatted = Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${formatted} ${hours === 1 ? 'hour' : 'hours'}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateForHeader(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function addDays(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

function toTitleCase(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatDiscountMeta(type, value) {
  if (!type || value == null || Number.isNaN(Number(value))) return '';
  const normalizedType = String(type).toLowerCase();
  const numericValue = Number(value);
  if (normalizedType === 'percentage') {
    return `${numericValue}%`;
  }
  return formatCurrency(numericValue);
}

function getBrandLogoDataUri() {
  const logoCandidates = [
    path.resolve(__dirname, '..', 'Group 2087330257.png'),
    path.resolve(__dirname, '..', '..', '..', 'beige-tech-mobile-web-api-2', 'src', 'Group 2087330257.png')
  ];

  for (const logoPath of logoCandidates) {
    try {
      if (fs.existsSync(logoPath)) {
        return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
      }
    } catch (_) {
      // Fall back to the text mark if the logo file cannot be read.
    }
  }

  return '';
}

function buildManualReceiptHtml(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const history = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
  const totalAmount = Number(data.total || 0);
  const totalPaidFromHistory = history.reduce((sum, entry) => {
    const amount = Number(entry?.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const fallbackPaidAmount = Number(data.paidAmount || 0);
  const totalPaidAmount = Math.min(
    totalAmount,
    Math.max(totalPaidFromHistory > 0 ? totalPaidFromHistory : fallbackPaidAmount, 0)
  );
  const visibleHistory = history.filter((entry) => {
    const amount = Number(entry?.amount || 0);
    const method = String(entry?.method || '').toLowerCase();
    return (Number.isFinite(amount) && amount > 0.009) || method.includes('net 30') || method.includes('net30');
  });
  const pendingAmount = Math.max(totalAmount - totalPaidAmount, 0);
  const hasPositivePaidAmount = totalPaidAmount > 0.009;
  const isFullyPaid = Boolean(data.isPaid) && hasPositivePaidAmount && pendingAmount <= 0.009;
  const showPaidStamp = isFullyPaid;
  const discountAmount = Math.max(0, Number(data.discountAmount || 0));
  const discountCode = data.discountCode ? String(data.discountCode) : '';
  const discountMeta = formatDiscountMeta(data.discountType, data.discountValue);
  const discountLabel = discountCode
    ? `Discount (${escapeHtml(discountCode)}${discountMeta ? `, ${escapeHtml(discountMeta)}` : ''})`
    : (discountMeta ? `Discount (${escapeHtml(discountMeta)})` : 'Discount');
  const taxAmount = Math.max(0, Number(data.taxAmount || 0));
  const taxType = String(data.taxType || 'Tax').trim() || 'Tax';
  const taxRate = Number(data.taxRate || 0);
  const taxLabel = Number.isFinite(taxRate) && taxRate > 0
    ? `${taxType} (${taxRate}%)`
    : taxType;
  const hasHourlyItems = items.some((item) => formatHours(item.hours));

  const itemRows = items
    .map((item) => `
      <tr>
        <td class="desc">${escapeHtml(item.name || 'Item')}</td>
        <td class="qty">${escapeHtml(item.quantity || 1)}</td>
        ${hasHourlyItems ? `<td class="hours">${escapeHtml(formatHours(item.hours) || '-')}</td>` : ''}
        <td class="money">${formatCurrency(item.unitPrice || 0)}</td>
        <td class="money total">${formatCurrency(item.total || 0)}</td>
      </tr>
    `)
    .join('');

  const hasReceiptActions = visibleHistory.some((item) => item?.receiptUrl || item?.receiptDownloadUrl);
  const historyRows = visibleHistory.length > 0
    ? visibleHistory
    .map((entry) => `
      <tr>
        <td>${escapeHtml(toTitleCase(entry.method || 'Manual'))}</td>
        <td>${escapeHtml(entry.date || 'N/A')}</td>
        <td>${formatCurrency(entry.amount || 0)}</td>
        ${hasReceiptActions ? `
          <td>
            <span class="receipt-actions">
              ${entry.receiptUrl ? `<a class="receipt-link" href="${escapeHtml(entry.receiptUrl)}" target="_blank">View Receipt</a>` : ''}
              ${entry.receiptDownloadUrl ? `
                <a class="receipt-download" href="${escapeHtml(entry.receiptDownloadUrl)}" target="_blank" title="Download Receipt" aria-label="Download Receipt">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 17v2h14v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </a>
              ` : ''}
            </span>
          </td>
        ` : ''}
      </tr>
    `)
    .join('')
    : `
      <tr>
        <td colspan="${hasReceiptActions ? 4 : 3}" class="empty-history">No payments recorded yet</td>
      </tr>
    `;

  const invoiceDate = toDateForHeader(data.invoiceDate || new Date());
  const receiptNo = escapeHtml(String(data.receiptNumber || data.bookingRef || '').replace(/[^\w-]/g, '').slice(-8) || 'N/A');
  const hasNet30 = history.some((entry) => String(entry?.method || '').toLowerCase().includes('net 30') || String(entry?.method || '').toLowerCase().includes('net30'));
  const net30DueDate = hasNet30 ? toDateForHeader(addDays(data.invoiceDate || new Date(), 30)) : null;
  const paidLabel = isFullyPaid ? 'Paid in Full' : 'Pending';
  const transactionRef = escapeHtml(data.transactionReference || data.confirmationNumber || '');
  const documentTitle = escapeHtml(data.documentTitle || 'INVOICE');
  const paymentUrl = String(data.paymentUrl || '').trim();
  const showPaymentButton = paymentUrl && pendingAmount > 0.009;
  const brandLogoDataUri = getBrandLogoDataUri();
  const brandLogoMarkup = brandLogoDataUri
    ? `<img src="${brandLogoDataUri}" alt="Beige AI" />`
    : '<span>B</span>';

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Manual Receipt</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Plus Jakarta Sans', 'Outfit', 'Inter', sans-serif;
          color: #1f2937;
          background: #f3f4f6;
        }

        .page {
          width: 794px;
          min-height: 1123px;
          margin: 0 auto;
          background: #f4f4f6;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
        }

        .beige-accent-top {
          height: 32px;
          background: linear-gradient(90deg, #d8be93, #e6d1aa, #d8be93);
          width: 380px;
          clip-path: polygon(0 0, 100% 0, 100% 100%, 40px 100%);
          position: absolute;
          top: 0;
          right: 0;
          z-index: 5;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 150px;
          color: #fff;
          background: radial-gradient(circle at 80% 20%, #1c1c1f 0%, #0c0c0c 100%);
          position: relative;
          overflow: hidden;
          padding: 34px 26px 8px;
        }

        /* Gold wave SVG container */
        .header-wave {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 0;
          opacity: 0.15;
        }

        .header-wave svg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .brand {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 14px;
          z-index: 1;
          transform: translateY(9px);
        }

        .brand-logo {
          width: 48px;
          height: 48px;
          background: #18181b;
          border: 1.5px solid rgba(230, 209, 170, 0.5);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        }

        .brand-logo span {
          font-family: "Georgia", "Times New Roman", serif;
          font-style: italic;
          font-weight: bold;
          font-size: 26px;
          color: #e6d1aa;
          line-height: 1;
          transform: translateY(-1px);
        }

        .brand-logo img {
          width: 34px;
          height: 34px;
          object-fit: contain;
          display: block;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .brand-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          color: #fff;
        }

        .brand-sub {
          font-size: 12px;
          color: #a1a1aa;
        }

        .inv-head {
          display: flex;
          flex-direction: column;
          justify-content: center;
          z-index: 1;
          text-align: right;
          transform: translateY(9px);
        }

        .inv-title {
          font-size: 28px;
          line-height: 1;
          letter-spacing: 12px;
          color: #e6d1aa;
          margin-bottom: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .inv-meta {
          font-size: 11px;
          color: #a1a1aa;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .inv-meta-row {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          align-items: center;
        }

        .inv-meta b {
          color: #d4d4d8;
          font-weight: 500;
        }

        .inv-meta span {
          color: #f4f4f5;
          font-weight: 600;
          min-width: 100px;
          text-align: right;
        }

        .booking-strip-container {
          height: 38px;
          background: radial-gradient(circle at 80% -130px, #1c1c1f 0%, #0c0c0c 100%);
          position: relative;
          width: 100%;
          overflow: hidden;
        }

        .booking-strip-gold {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 580px;
          background: linear-gradient(90deg, #d8be93, #e6d1aa, #d8be93);
          clip-path: polygon(0 0, 540px 0, 580px 100%, 0 100%);
          display: flex;
          align-items: center;
          padding-left: 26px;
          padding-right: 54px;
          font-size: 11.5px;
          color: #1c1c1e;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          line-height: 1.2;
        }

        .booking-strip-gold b {
          margin-left: 6px;
          font-weight: 800;
          letter-spacing: 1px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* ─── CONTENT ─── */
        .content {
          padding: 20px 26px 56px;
        }

        /* ─── BILL GRID ─── */
        .bill-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
          align-items: stretch;
        }

        .bill-grid > div {
          display: flex;
          flex-direction: column;
        }

        .bill-label {
          font-size: 11px;
          color: #71717a;
          margin-bottom: 6px;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .bill-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 20px;
          min-height: 116px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
          flex: 1;
        }

        .bill-card.has-paid-ribbon {
          padding-right: 84px;
        }

        .bill-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #09090b;
        }

        .bill-line {
          font-size: 11.5px;
          color: #52525b;
          line-height: 1.5;
        }

        .bill-line.receipt-label {
          color: #71717a;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .bill-line.receipt-label b {
          color: #18181b;
          font-weight: 700;
        }

        /* ─── RECEIVED PAID STAMP ─── */
        .paid-ribbon {
          position: absolute;
          top: 25px;
          right: -40px;
          background: #10b981;
          color: #ffffff;
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.65px;
          line-height: 1;
          padding: 7px 0;
          width: 154px;
          text-align: center;
          transform: rotate(45deg);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
          z-index: 10;
          white-space: nowrap;
        }

        /* ─── ITEMS TABLE ─── */
        .table-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 12px 0;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
          margin-bottom: 16px;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        .items th {
          padding: 10px 20px;
          text-align: left;
          border-bottom: none;
        }

        .th-badge {
          display: inline-block;
          background: #f7f3eb;
          color: #8a6a3d;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 4px 12px;
          border-radius: 99px;
          line-height: 1.1;
          white-space: nowrap;
        }

        .items th.qty, .items th.money, .items th.hours {
          text-align: right;
        }

        .items td {
          padding: 12px 20px;
          font-size: 13px;
          color: #18181b;
          border-bottom: none;
        }

        .items .desc {
          font-weight: 700;
          color: #09090b;
        }

        .items .qty {
          text-align: center;
          width: 80px;
          font-weight: 500;
          color: #52525b;
        }

        .items .hours {
          text-align: center;
          width: 90px;
          color: #52525b;
        }

        .items .money {
          text-align: right;
          width: 150px;
          color: #52525b;
          white-space: nowrap;
        }

        .items .total {
          font-weight: 700;
          color: #09090b;
        }

        /* ─── TOTALS BOX ─── */
        .totals {
          width: 320px;
          margin-left: auto;
          background: #e9d8b6;
          border-radius: 16px;
          padding: 12px 18px;
          margin-bottom: 12px;
          box-shadow: 0 4px 15px rgba(233, 216, 182, 0.15);
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .tot-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          font-size: 12px;
          color: #27272a;
          padding: 7px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          white-space: nowrap;
        }

        .tot-row:last-child {
          border-bottom: 0;
        }

        .amount-paid {
          font-size: 13px;
          font-weight: 700;
          color: #09090b;
        }

        .amount-paid b {
          font-size: 22px;
          color: #09090b;
          font-weight: 800;
          line-height: 1;
        }

        .pay-online {
          display: block;
          margin-top: 10px;
          background: #111827;
          color: #e6d1aa;
          text-decoration: none;
          text-align: center;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.6px;
        }

        /* ─── PAYMENT HISTORY ─── */
        .section-title {
          font-size: 11px;
          color: #71717a;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin: 0 0 8px 0;
          text-transform: uppercase;
          break-after: avoid;
          page-break-after: avoid;
        }

        .payment-history-section {
          padding-top: 8px;
        }

        .payment-history-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 14px 20px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
          margin-bottom: 16px;
          overflow: visible;
        }

        .history th {
          color: #71717a;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 8px 0 12px;
          text-align: left;
          border-bottom: 1px solid #f4f4f5;
        }

        .history td {
          padding: 11px 0;
          border-top: none;
          font-size: 13px;
          color: #18181b;
          font-weight: 700;
        }

        .items tr,
        .history tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .history .empty-history {
          color: #71717a;
          font-weight: 500;
          text-align: center;
        }

        .receipt-link {
          color: #8a6a3d;
          font-size: 11px;
          font-weight: 700;
          text-decoration: underline;
        }

        .receipt-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .receipt-download {
          display: inline-flex;
          width: 16px;
          height: 16px;
          align-items: center;
          justify-content: center;
          color: #8a6a3d;
          text-decoration: none;
          vertical-align: middle;
        }

        .receipt-download svg {
          width: 15px;
          height: 15px;
        }

        /* ─── FOOTER ─── */
        .foot-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: end;
        }

        .terms {
          border-top: 1px solid #e4e4e7;
          padding-top: 16px;
          margin-top: 10px;
        }

        .terms h4 {
          margin: 0 0 6px 0;
          font-size: 11px;
          color: #27272a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .terms p {
          margin: 0 0 8px 0;
          font-size: 10px;
          color: #71717a;
          line-height: 1.6;
        }

        .terms .thank-you {
          margin-top: 12px;
          font-size: 11px;
          color: #52525b;
          line-height: 1.6;
        }

        .terms .thank-you b {
          color: #18181b;
        }

        .bottom-accent-container {
          height: 38px;
          background: #0c0c0c;
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          overflow: hidden;
        }

        .bottom-accent-gold {
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          width: 440px;
          background: linear-gradient(90deg, #d8be93, #e6d1aa, #d8be93);
          clip-path: polygon(0 0, 100% 0, 100% 100%, 40% 100%);
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="beige-accent-top"></div>
        <div class="topbar">
          <div class="header-wave">
            <svg viewBox="0 0 794 128" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M0 90 C150 40, 350 110, 500 55 C600 25, 700 70, 794 45" stroke="rgba(214,186,140,0.35)" stroke-width="1.5" fill="none"/>
              <path d="M0 95 C150 45, 350 115, 500 60 C600 30, 700 75, 794 50" stroke="rgba(214,186,140,0.15)" stroke-width="1" fill="none"/>
              <path d="M0 100 C200 60, 400 120, 550 70 C650 40, 750 80, 794 60" fill="rgba(214,186,140,0.06)"/>
            </svg>
          </div>
          <div class="brand">
            <div class="brand-logo">
              ${brandLogoMarkup}
            </div>
            <div class="brand-text">
              <div class="brand-title">Beige AI</div>
              <div class="brand-sub">Production Marketplace</div>
            </div>
          </div>
          <div class="inv-head">
            <div class="inv-title">${documentTitle}</div>
            <div class="inv-meta">
              <div class="inv-meta-row"><b>Invoice:</b> <span>${escapeHtml(data.invoiceNumber || 'N/A')}</span></div>
              <div class="inv-meta-row"><b>Receipt No:</b> <span>${receiptNo}</span></div>
              <div class="inv-meta-row"><b>Date Paid:</b> <span>${invoiceDate}</span></div>
              <div class="inv-meta-row"><b>Payment Status:</b> <span>${paidLabel}</span></div>
            </div>
          </div>
        </div>

        <div class="booking-strip-container">
          <div class="booking-strip-gold">
            Booking Ref: <b>${escapeHtml(data.bookingRef || data.invoiceNumber || 'N/A')}</b>
          </div>
        </div>

        <div class="content">
          <div class="bill-grid">
            <div>
              <div class="bill-label">Bill from:</div>
              <div class="bill-card">
                <div class="bill-title">Beige AI</div>
                <div class="bill-line">323-826-7230</div>
                <div class="bill-line">9200 West Sunset Boulevard Suite</div>
                <div class="bill-line">650 West Hollywood, California 90069</div>
                <div class="bill-line">United States</div>
                <div class="bill-line">sales@beigecorporation.io</div>
              </div>
            </div>
            <div>
              <div class="bill-label">Bill to:</div>
              <div class="bill-card${showPaidStamp ? ' has-paid-ribbon' : ''}">
                ${showPaidStamp ? '<div class="paid-ribbon">Marked as Paid</div>' : ''}
                <div class="bill-title">${escapeHtml(data.clientName || 'Client')}</div>
                <div class="bill-line receipt-label">Payment Receipt: <b>${escapeHtml(data.projectTitle || 'Project')}</b></div>
                <div class="bill-line">${escapeHtml(data.location || 'Location not available')}</div>
                <div class="bill-line">${escapeHtml(data.clientEmail || '')}</div>
              </div>
            </div>
          </div>

          <div class="table-card">
            <table class="items">
              <thead>
                <tr>
                  <th><span class="th-badge">Description</span></th>
                  <th class="qty"><span class="th-badge">Quantity</span></th>
                  ${hasHourlyItems ? `<th class="hours"><span class="th-badge">Hours</span></th>` : ''}
                  <th class="money"><span class="th-badge">Unit price</span></th>
                  <th class="money"><span class="th-badge">Total Amount</span></th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </div>

          <div class="totals">
            <div class="tot-row"><span>Subtotal</span><span>${formatCurrency(data.subtotal || 0)}</span></div>
            ${discountAmount > 0 ? `<div class="tot-row"><span>${discountLabel}</span><span>- ${formatCurrency(discountAmount)}</span></div>` : ''}
            ${taxAmount > 0 ? `<div class="tot-row"><span>${escapeHtml(taxLabel)}</span><span>${formatCurrency(taxAmount)}</span></div>` : ''}
            <div class="tot-row"><span><b>Total</b></span><span><b>${formatCurrency(totalAmount)}</b></span></div>
            <div class="tot-row amount-paid"><span>Amount Paid</span><b>${formatCurrencyBold(totalPaidAmount)}</b></div>
            <div class="tot-row"><span>Pending Amount</span><span><b>${formatCurrency(pendingAmount)}</b></span></div>
            ${showPaymentButton ? `
              <a
                href="${escapeHtml(paymentUrl)}"
                target="_blank"
                class="pay-online"
              >
                Pay Online
              </a>
            ` : ''}
          </div>

          <div class="payment-history-section">
            <h3 class="section-title">PAYMENT HISTORY</h3>
            <div class="payment-history-card">
              <table class="history">
                <thead>
                  <tr>
                    <th>Payment Method</th>
                    <th>Date</th>
                    <th>Amount</th>
                    ${hasReceiptActions ? '<th>Receipt</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${historyRows}
                </tbody>
              </table>
            </div>
          </div>

          <div class="foot-grid">
            <div class="terms">
              <h4>Terms & Conditions:</h4>
              <p>Fees and payment terms will be established in the contract or agreement prior to the commencement of the project. An initial deposit will be required before any design work begins. We reserve the right to suspend or halt work in the event of non-payment.</p>
              <div class="thank-you">
                ${hasNet30
      ? `Thank you for your business! This invoice is on <b>Net 30</b> terms. Payment of <b>${formatCurrencyBold(totalAmount)}</b> is due within 30 days${net30DueDate ? ` (due by <b>${escapeHtml(net30DueDate)}</b>)` : ''}.`
      : `Thank you for your business! Total paid amount of <b>${formatCurrencyBold(totalPaidAmount)}</b> has been received and processed manually.${transactionRef ? ` <b>Transaction Reference: ${transactionRef}.</b>` : ''}`
    }
              </div>
            </div>
          </div>
        </div>
        <div class="bottom-accent-container">
          <div class="bottom-accent-gold"></div>
        </div>
      </div>
    </body>
  </html>
  `;
}

async function generateManualReceiptPdfBuffer(data) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    throw new Error('PDF generation dependency is missing. Please install puppeteer.');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
    await page.setContent(buildManualReceiptHtml(data), { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });
  } finally {
    await browser.close();
  }
}

module.exports = {
  generateManualReceiptPdfBuffer,
  formatDate
};
