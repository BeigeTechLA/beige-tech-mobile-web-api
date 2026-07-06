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

  const itemRows = items
    .map((item) => `
      <tr>
        <td class="desc">${escapeHtml(item.name || 'Item')}</td>
        <td class="qty">${escapeHtml(item.quantity || 1)}</td>
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
  const paymentUrl = String(data.paymentUrl || data.payment_url || '').trim();
  const finalPaymentUrl = paymentUrl || '#';
  const showPaymentButton = pendingAmount > 0.009 && !isFullyPaid;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Manual Receipt</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          font-family: "Arial", "Helvetica", sans-serif;
          color: #1f2937;
          background: #f3f4f6;
        }

        .page {
          width: 794px;
          min-height: 1123px;
          margin: 0 auto;
          background: #f2f2f2;
          border: 3px solid #1e293b;
          position: relative;
          overflow: hidden;
        }

        /* Beige accent line at top */
        .beige-accent-top {
          height: 5px;
          background: linear-gradient(90deg, #d8be93, #e6d1aa, #d8be93);
          width: 100%;
        }

        /* Beige accent line at bottom */
        .beige-accent-bottom {
          height: 5px;
          background: linear-gradient(90deg, #d8be93, #e6d1aa, #d8be93);
          width: 100%;
          position: absolute;
          bottom: 0;
          left: 0;
        }

        /* ─── HEADER ─── */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: stretch;
          height: 128px;
          color: #fff;
          background: linear-gradient(145deg, #101010 0%, #1d1d1d 58%, #0f172a 100%);
          position: relative;
          overflow: hidden;
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
        }

        .header-wave svg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .brand {
          padding: 24px 26px;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 14px;
          z-index: 1;
        }

        .brand-logo {
          width: 48px;
          height: 48px;
          background: #e6d1aa;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .brand-logo svg {
          width: 28px;
          height: 28px;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .brand-title {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.2px;
          margin-bottom: 2px;
        }

        .brand-sub {
          font-size: 13px;
          color: #d1d5db;
        }

        .inv-head {
          width: 320px;
          background: rgba(17, 17, 17, 0.6);
          padding: 14px 22px 16px;
          border-left: 2px solid #d8be93;
          display: flex;
          flex-direction: column;
          justify-content: center;
          z-index: 1;
        }

        .inv-title {
          font-size: 36px;
          line-height: 1;
          letter-spacing: 5px;
          color: #e6d1aa;
          margin-bottom: 8px;
          font-weight: 600;
          font-style: italic;
        }

        .inv-meta {
          font-size: 11px;
          line-height: 1.6;
          color: #f3f4f6;
        }

        .inv-meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .inv-meta b {
          color: #e6d1aa;
          display: inline-block;
          min-width: 105px;
          font-weight: 500;
        }

        .inv-meta span {
          color: #e2e8f0;
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* ─── BOOKING STRIP ─── */
        .booking-strip {
          min-height: 38px;
          background: #e7d7bc;
          display: flex;
          align-items: center;
          padding: 0 26px;
          font-size: 14px;
          color: #2f2f2f;
          letter-spacing: 1px;
          border-bottom: 1px solid #d7c19d;
          line-height: 1.25;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .booking-strip b {
          margin-left: 6px;
          letter-spacing: 1.5px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* ─── CONTENT ─── */
        .content {
          padding: 18px 22px 22px;
        }

        /* ─── BILL GRID ─── */
        .bill-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .bill-label {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 5px;
          text-transform: none;
        }

        .bill-card {
          background: #f8f8f8;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 10px 11px;
          min-height: 108px;
          position: relative;
          overflow: hidden;
        }

        .bill-card.has-stamp {
          padding-right: 78px;
        }

        .bill-title {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #111827;
          line-height: 1.25;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .bill-line {
          font-size: 11px;
          color: #4b5563;
          line-height: 1.45;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .bill-line.receipt-label {
          color: #6b7280;
          font-size: 10.5px;
          margin-bottom: 4px;
        }

        .bill-line.receipt-label b {
          color: #111827;
          font-weight: 700;
        }

        /* ─── RECEIVED PAID STAMP ─── */
        .stamp {
          position: absolute;
          top: 20px;
          right: -28px;
          background: #22c55e;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          padding: 5px 40px;
          transform: rotate(30deg);
          box-shadow: 0 2px 6px rgba(34, 197, 94, 0.35);
          z-index: 2;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          line-height: 1.2;
        }

        /* ─── ITEMS TABLE ─── */
        .table-wrap {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fbfbfb;
          overflow: hidden;
          margin-bottom: 16px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        .items th {
          background: #f6f7f9;
          color: #6b7280;
          font-size: 11px;
          font-weight: 700;
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #eceef2;
        }

        .items td {
          font-size: 12px;
          color: #111827;
          padding: 11px 12px;
          border-bottom: 1px solid #f1f3f7;
        }

        .items tr:last-child td {
          border-bottom: 0;
        }

        .items .desc {
          font-weight: 500;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .items .qty {
          text-align: center;
          width: 80px;
        }

        .items .money {
          text-align: right;
          width: 140px;
          color: #4b5563;
        }

        .items .total {
          font-weight: 500;
          color: #111827;
        }

        /* ─── TOTALS BOX ─── */
        .totals {
          width: 300px;
          margin-left: auto;
          background: #e6d1aa;
          border-radius: 12px;
          border: 1px solid #d8be93;
          padding: 12px 14px;
          margin-bottom: 18px;
        }

        .tot-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #2f2f2f;
          padding: 7px 0;
          border-bottom: 1px solid rgba(44, 44, 44, 0.16);
        }

        .tot-row:last-child {
          border-bottom: 0;
        }

        .amount-paid {
          font-size: 12px;
          font-weight: 600;
        }

        .amount-paid b {
          font-size: 20px;
          letter-spacing: 0.2px;
          color: #2f2f2f;
          font-weight: 600;
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
          color: #374151;
          font-weight: 700;
          letter-spacing: 0.4px;
          margin: 0 0 8px 0;
        }

        .history-wrap {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          background: #fbfbfb;
          margin-bottom: 14px;
        }

        .history th {
          background: #f6f7f9;
          color: #6b7280;
          font-size: 10px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 9px 10px;
          text-align: left;
        }

        .history td {
          padding: 10px;
          border-top: 1px solid #eef1f5;
          font-size: 12px;
          color: #111827;
          font-weight: 600;
        }

        .history .empty-history {
          color: #6b7280;
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
          grid-template-columns: 1fr 240px;
          gap: 14px;
          align-items: end;
        }

        .terms {
          border-top: 1px solid #dfe3ea;
          padding-top: 10px;
        }

        .terms h4 {
          margin: 0 0 6px 0;
          font-size: 11px;
          color: #374151;
        }

        .terms p {
          margin: 0 0 6px 0;
          font-size: 10px;
          color: #6b7280;
          line-height: 1.55;
        }

        .terms .thank-you {
          margin-top: 10px;
          font-size: 10px;
          color: #6b7280;
          line-height: 1.55;
        }

        .terms .thank-you b {
          color: #111827;
        }

        .signature {
          border: 1px solid #e5e7eb;
          background: #f7f7f7;
          border-radius: 8px;
          min-height: 92px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 8px;
        }

        .signature .name {
          font-size: 12px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 4px;
        }

        .signature .role {
          font-size: 10px;
          color: #6b7280;
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
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#e6d1aa"/>
                <path d="M7 6h5.5c1.38 0 2.5.56 3.36 1.42.56.56.86 1.3.86 2.08 0 1.2-.7 2.1-1.72 2.7.02 0 .04.02.06.02 1.38.56 2.44 1.7 2.44 3.28 0 1.1-.42 2-1.14 2.7C15.5 19.04 14.18 19.5 12.5 19.5H7V6zm3 5.5h2.5c.56 0 1.02-.18 1.36-.52.34-.34.52-.78.52-1.28s-.18-.92-.52-1.26c-.34-.34-.8-.54-1.36-.54H10v3.6zm0 5.6h2.5c.7 0 1.3-.2 1.72-.6.42-.38.64-.9.64-1.5 0-.62-.22-1.12-.64-1.5-.42-.4-1.02-.6-1.72-.6H10V17.1z" fill="#1e1e1e"/>
              </svg>
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

        <div class="booking-strip">
          Booking Ref: <b>${escapeHtml(data.bookingRef || data.invoiceNumber || 'N/A')}</b>
        </div>

        <div class="content">
          <div class="bill-grid">
            <div>
              <div class="bill-label">Bill from:</div>
              <div class="bill-card">
                <div class="bill-title">Beige AI</div>
                <div class="bill-line">(844) 678 - 0902</div>
                <div class="bill-line">9200 West Sunset Boulevard Suite</div>
                <div class="bill-line">650 West Hollywood, California 90069</div>
                <div class="bill-line">United States</div>
                <div class="bill-line">sales@beigecorporation.io</div>
              </div>
            </div>
            <div>
              <div class="bill-label">Bill to:</div>
              <div class="bill-card${showPaidStamp ? ' has-stamp' : ''}">
                ${showPaidStamp ? '<div class="stamp">Received Paid</div>' : ''}
                <div class="bill-title">${escapeHtml(data.clientName || 'Client')}</div>
                <div class="bill-line receipt-label">Payment Receipt: <b>${escapeHtml(data.projectTitle || 'Project')}</b></div>
                <div class="bill-line">${escapeHtml(data.location || 'Location not available')}</div>
                <div class="bill-line">${escapeHtml(data.clientEmail || '')}</div>
              </div>
            </div>
          </div>

          <div class="table-wrap">
            <table class="items">
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="qty">Quantity</th>
                  <th class="money">Unit price</th>
                  <th class="money">Total Amount</th>
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
                href="${escapeHtml(finalPaymentUrl)}"
                target="_blank"
                class="pay-online"
              >
                Pay Online
              </a>
            ` : ''}
          </div>

          <h3 class="section-title">PAYMENT HISTORY</h3>
          <div class="history-wrap">
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
        <div class="beige-accent-bottom"></div>
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
