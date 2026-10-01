const db = require('../models');
const { Op, QueryTypes } = db.Sequelize;

// ==========================================
// CONSTANTS / VALIDATION ENUMS
// ==========================================
const VALID_METRICS = new Set(['gross_revenue', 'pending_revenue', 'cp_payout']);
const VALID_GROUP_BY = new Set(['day', 'month', 'year']);
const VALID_SORT_BY = new Set(['shoot', 'shoots_count', 'total_spend', 'spend']);
const VALID_PERIODS = new Set(['week', 'this_week', 'month', 'this_month', 'last_month', 'year', 'this_year']);
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ==========================================
// 1. HELPERS AT TOP
// ==========================================

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function roundOneDecimal(value) {
  const num = Number(value || 0);
  return Math.round((Number.isFinite(num) ? num : 0) * 10) / 10;
}

function toPositiveInt(value, paramName, defaultValue = null, maxLimit = null) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error(`Invalid ${paramName}. Expected a positive integer.`);
    error.statusCode = 400;
    throw error;
  }
  if (maxLimit !== null && parsed > maxLimit) {
    return maxLimit;
  }
  return parsed;
}

function validateEnum(value, validSet, paramName) {
  if (value === undefined || value === null || value === '') return;
  if (!validSet.has(value)) {
    const error = new Error(`Invalid ${paramName}: '${value}'. Allowed values: ${Array.from(validSet).join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
}

function validateStatusFilter(statusVal) {
  if (statusVal === undefined || statusVal === null || statusVal === '') return null;
  const num = Number(statusVal);
  if (!Number.isInteger(num) || num < 0 || num > 5) {
    const error = new Error('Invalid status filter. Allowed values: 0 (Initiated), 1 (PreProduction), 2 (PostProduction), 3 (Revision), 4 (Completed), 5 (Cancelled).');
    error.statusCode = 400;
    throw error;
  }
  return num;
}

function validateDateString(dateStr, paramName) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const error = new Error(`Invalid date format for ${paramName}. Expected YYYY-MM-DD.`);
    error.statusCode = 400;
    throw error;
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`Invalid date value for ${paramName}.`);
    error.statusCode = 400;
    throw error;
  }
  return dateStr;
}

/**
 * Shared date range parser helper.
 * Validates date parameters and returns inclusive [00:00:00, 23:59:59] boundaries.
 */
function parseDateFilter(filters = {}) {
  let dateFrom = filters.date_from || filters.start_date || null;
  let dateTo = filters.date_to || filters.end_date || null;

  if (dateFrom) validateDateString(dateFrom, 'date_from');
  if (dateTo) validateDateString(dateTo, 'date_to');

  if (!dateFrom && !dateTo && filters.year) {
    const yr = Number(filters.year);
    if (!Number.isInteger(yr) || yr < 2000 || yr > 2100) {
      const error = new Error('Invalid year parameter.');
      error.statusCode = 400;
      throw error;
    }
    if (filters.month) {
      const moNum = Number(filters.month);
      if (!Number.isInteger(moNum) || moNum < 1 || moNum > 12) {
        const error = new Error('Invalid month parameter.');
        error.statusCode = 400;
        throw error;
      }
      const mo = String(moNum).padStart(2, '0');
      const lastDay = new Date(yr, moNum, 0).getDate();
      dateFrom = `${yr}-${mo}-01`;
      dateTo = `${yr}-${mo}-${String(lastDay).padStart(2, '0')}`;
    } else {
      dateFrom = `${yr}-01-01`;
      dateTo = `${yr}-12-31`;
    }
  }

  if (!dateFrom && !dateTo && filters.period) {
    const p = String(filters.period).toLowerCase();
    if (!VALID_PERIODS.has(p)) {
      const error = new Error(`Invalid period filter: '${filters.period}'. Allowed values: ${Array.from(VALID_PERIODS).join(', ')}.`);
      error.statusCode = 400;
      throw error;
    }
    const now = new Date();
    if (p === 'week' || p === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      dateFrom = monday.toISOString().slice(0, 10);
      dateTo = new Date().toISOString().slice(0, 10);
    } else if (p === 'month' || p === 'this_month') {
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(yr, now.getMonth() + 1, 0).getDate();
      dateFrom = `${yr}-${mo}-01`;
      dateTo = `${yr}-${mo}-${String(lastDay).padStart(2, '0')}`;
    } else if (p === 'last_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const yr = prev.getFullYear();
      const mo = String(prev.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(yr, prev.getMonth() + 1, 0).getDate();
      dateFrom = `${yr}-${mo}-01`;
      dateTo = `${yr}-${mo}-${String(lastDay).padStart(2, '0')}`;
    } else if (p === 'year' || p === 'this_year') {
      const yr = now.getFullYear();
      dateFrom = `${yr}-01-01`;
      dateTo = `${yr}-12-31`;
    }
  }

  return { dateFrom, dateTo };
}

function formatDisputeReason(category) {
  const map = {
    quality: 'Quality Issue',
    payment_delay: 'Payment Delay',
    wrong_deliverables: 'Wrong Deliverables',
    refund: 'Refund Request',
    payout_issues: 'Payout Issues',
    other: 'Other'
  };
  if (!category) return 'Other';
  return map[category.toLowerCase()] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Safely quotes table or nested include aliases for SQL literals (e.g. `project->finance_breakdown`).
 */
function quoteAlias(alias) {
  if (!alias) return alias;
  return alias.split('.').map(part => {
    if (part.startsWith('`') && part.endsWith('`')) return part;
    return `\`${part}\``;
  }).join('.');
}

// ==========================================
// 2. CENTRALIZED RAW SQL HELPERS (RULE 2)
// ==========================================

/**
 * Named Helper for 3-Source Gross Revenue Union:
 * Source 1: Active bookings with breakdown rows (SUM of fpb.collected_amount).
 * Source 2: Active bookings without breakdown rows having succeeded Stripe payments (SUM of pt.total_amount).
 * Source 3: Active bookings without breakdown rows having manual payments (SUM of bmp.amount).
 */
function getGrossRevenueUnionSubquery() {
  return `
    SELECT fpb.booking_id, fpb.collected_amount AS amount, COALESCE(spb.payment_completed_at, spb.event_date, spb.created_at, fpb.calculated_at) AS revenue_date, spb.user_id, spb.guest_email, spb.status AS booking_status
    FROM finance_project_breakdowns fpb
    JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
    WHERE spb.is_active = 1
    UNION ALL
    SELECT spb.stream_project_booking_id AS booking_id, pt.total_amount AS amount, COALESCE(pt.created_at, spb.payment_completed_at, spb.created_at) AS revenue_date, spb.user_id, spb.guest_email, spb.status AS booking_status
    FROM stream_project_booking spb
    JOIN payment_transactions pt ON pt.payment_id = spb.payment_id
    LEFT JOIN finance_project_breakdowns fpb ON fpb.booking_id = spb.stream_project_booking_id
    WHERE spb.is_active = 1 AND fpb.booking_id IS NULL AND pt.status = 'succeeded'
    UNION ALL
    SELECT spb.stream_project_booking_id AS booking_id, bmp.amount AS amount, COALESCE(bmp.created_at, spb.created_at) AS revenue_date, spb.user_id, spb.guest_email, spb.status AS booking_status
    FROM booking_manual_payments bmp
    JOIN stream_project_booking spb ON spb.stream_project_booking_id = bmp.booking_id
    LEFT JOIN finance_project_breakdowns fpb ON fpb.booking_id = spb.stream_project_booking_id
    WHERE spb.is_active = 1 AND fpb.booking_id IS NULL
  `;
}

/**
 * Helper (a): Approved and Pending Approval creator earnings subquery.
 * Excludes cancelled/draft and selects MAX(creator_earning_id) per (booking_id, creator_id).
 */
function getApprovedDedupeCeSubquery() {
  return `
    SELECT ce.creator_earning_id, ce.booking_id, ce.creator_id, ce.net_earning_amount, ce.gross_amount, ce.created_at
    FROM creator_earnings ce
    JOIN stream_project_booking spb ON spb.stream_project_booking_id = ce.booking_id
    WHERE spb.is_active = 1
      AND ce.approval_status IN ('approved', 'pending_approval')
      AND ce.status != 'cancelled'
      AND ce.creator_earning_id IN (
        SELECT MAX(creator_earning_id)
        FROM creator_earnings
        WHERE approval_status IN ('approved', 'pending_approval') AND status != 'cancelled'
        GROUP BY booking_id, creator_id
      )
  `;
}

/**
 * Helper (b): Proportional client amount split per CP for multi-CP bookings.
 */
function getMultiCpClientSplitSql(fpbAlias = 'fpb', countAlias = 'cp_counts') {
  const qFpb = quoteAlias(fpbAlias);
  const qCount = quoteAlias(countAlias);
  return `CASE WHEN ${qFpb}.total_amount IS NOT NULL THEN (${qFpb}.total_amount / ${qCount}.num_cps) ELSE 0 END`;
}

/**
 * Helper (c): Standardized revenue transaction date column with proper backtick alias quoting.
 * Fallback chain matching transactions module: payment_completed_at -> event_date -> created_at -> calculated_at
 */
function getRevenueDateSql(spbAlias = 'spb', fpbAlias = 'fpb') {
  const qSpb = quoteAlias(spbAlias);
  const qFpb = quoteAlias(fpbAlias);
  return `COALESCE(${qSpb}.\`payment_completed_at\`, ${qSpb}.\`event_date\`, ${qSpb}.\`created_at\`, ${qFpb}.\`calculated_at\`)`;
}

/**
 * Auxiliary SQL helper for client unique grouping key.
 */
function getClientKeySql(userAlias = 'u', spbAlias = 'spb') {
  const qUser = quoteAlias(userAlias);
  const qSpb = quoteAlias(spbAlias);
  return `CASE WHEN ${qUser}.id IS NOT NULL THEN CONCAT('user_', ${qUser}.id) ELSE CONCAT('guest_', LOWER(TRIM(${qSpb}.guest_email))) END`;
}

/**
 * Auxiliary SQL helper for deterministic client table join.
 */
function getDeterministicClientJoinSql(userAlias = 'u', clientAlias = 'c') {
  const qUser = quoteAlias(userAlias);
  const qClient = quoteAlias(clientAlias);
  return `LEFT JOIN clients ${qClient} ON ${qClient}.client_id = (SELECT MIN(client_id) FROM clients WHERE user_id = ${qUser}.id)`;
}

/**
 * Date clause helper for raw replacement queries using bound parameter names.
 */
function buildDateClause(dateColumn, dateFrom, dateTo) {
  let sql = '';
  const replacements = {};
  if (dateFrom) {
    sql += ` AND ${dateColumn} >= :dateFrom `;
    replacements.dateFrom = `${dateFrom} 00:00:00`;
  }
  if (dateTo) {
    sql += ` AND ${dateColumn} <= :dateTo `;
    replacements.dateTo = `${dateTo} 23:59:59`;
  }
  return { sql, replacements };
}

function getPreviousPeriodRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) {
    const now = new Date();
    const curYr = now.getFullYear();
    const curMo = now.getMonth();
    const curStart = new Date(curYr, curMo, 1);
    const curEnd = now;

    const prevStart = new Date(curYr, curMo - 1, 1);
    const prevEnd = new Date(curYr, curMo, 0, 23, 59, 59);

    return {
      curFrom: curStart.toISOString().replace('T', ' ').slice(0, 19),
      curTo: curEnd.toISOString().replace('T', ' ').slice(0, 19),
      prevFrom: prevStart.toISOString().replace('T', ' ').slice(0, 19),
      prevTo: prevEnd.toISOString().replace('T', ' ').slice(0, 19),
      changeLabel: 'vs last month'
    };
  }

  const startMs = new Date(`${dateFrom}T00:00:00`).getTime();
  const endMs = new Date(`${dateTo}T23:59:59`).getTime();
  const durationMs = endMs - startMs;
  const prevEndMs = startMs - 1;
  const prevStartMs = prevEndMs - durationMs;

  return {
    curFrom: `${dateFrom} 00:00:00`,
    curTo: `${dateTo} 23:59:59`,
    prevFrom: new Date(prevStartMs).toISOString().replace('T', ' ').slice(0, 19),
    prevTo: new Date(prevEndMs).toISOString().replace('T', ' ').slice(0, 19),
    changeLabel: 'vs previous period'
  };
}

// ==========================================
// 3. UNIFIED GRAPH BUILDER HELPER (RULE 3)
// ==========================================

async function buildUnifiedGraph(selectedMetric, groupBy, filters) {
  const { dateFrom, dateTo } = parseDateFilter(filters);
  const dateCol = selectedMetric === 'cp_payout' ? 'ce.created_at' : 'revenue_date';

  if (groupBy === 'day') {
    const dateClause = buildDateClause(dateCol, dateFrom, dateTo);
    let sql = '';
    if (selectedMetric === 'gross_revenue') {
      sql = `
        SELECT DATE_FORMAT(revenue_date, '%Y-%m-%d') AS label_key, COALESCE(SUM(amount), 0) AS value
        FROM (${getGrossRevenueUnionSubquery()}) AS rev
        WHERE 1=1 ${dateClause.sql}
        GROUP BY label_key ORDER BY label_key ASC`;
    } else if (selectedMetric === 'pending_revenue') {
      const revDateSql = getRevenueDateSql('spb', 'fpb');
      const pendingDateClause = buildDateClause(revDateSql, dateFrom, dateTo);
      sql = `
        SELECT DATE_FORMAT(${revDateSql}, '%Y-%m-%d') AS label_key, COALESCE(SUM(fpb.outstanding_amount), 0) AS value
        FROM finance_project_breakdowns fpb
        JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
        WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0 ${pendingDateClause.sql}
        GROUP BY label_key ORDER BY label_key ASC`;
    } else {
      sql = `
        SELECT DATE_FORMAT(ce.created_at, '%Y-%m-%d') AS label_key, COALESCE(SUM(ce.net_earning_amount), 0) AS value
        FROM (${getApprovedDedupeCeSubquery()}) AS ce
        WHERE 1=1 ${dateClause.sql}
        GROUP BY label_key ORDER BY label_key ASC`;
    }
    const replacements = selectedMetric === 'pending_revenue'
      ? buildDateClause(getRevenueDateSql('spb', 'fpb'), dateFrom, dateTo).replacements
      : dateClause.replacements;
    const rows = await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    return rows.map(r => ({ label: r.label_key, value: toMoney(r.value) }));
  }

  if (groupBy === 'year') {
    let sql = '';
    if (selectedMetric === 'gross_revenue') {
      sql = `
        SELECT YEAR(revenue_date) AS label_key, COALESCE(SUM(amount), 0) AS value
        FROM (${getGrossRevenueUnionSubquery()}) AS rev
        GROUP BY label_key ORDER BY label_key ASC`;
    } else if (selectedMetric === 'pending_revenue') {
      const revDateSql = getRevenueDateSql('spb', 'fpb');
      sql = `
        SELECT YEAR(${revDateSql}) AS label_key, COALESCE(SUM(fpb.outstanding_amount), 0) AS value
        FROM finance_project_breakdowns fpb
        JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
        WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0
        GROUP BY label_key ORDER BY label_key ASC`;
    } else {
      sql = `
        SELECT YEAR(ce.created_at) AS label_key, COALESCE(SUM(ce.net_earning_amount), 0) AS value
        FROM (${getApprovedDedupeCeSubquery()}) AS ce
        GROUP BY label_key ORDER BY label_key ASC`;
    }
    const rows = await db.sequelize.query(sql, { type: QueryTypes.SELECT });
    return rows.map(r => ({ label: String(r.label_key), value: toMoney(r.value) }));
  }

  // Default: groupBy === 'month'
  if (dateFrom && dateTo) {
    const dateClause = buildDateClause(dateCol, dateFrom, dateTo);
    let sql = '';
    if (selectedMetric === 'gross_revenue') {
      sql = `
        SELECT MONTH(revenue_date) AS month_num, COALESCE(SUM(amount), 0) AS value
        FROM (${getGrossRevenueUnionSubquery()}) AS rev
        WHERE 1=1 ${dateClause.sql}
        GROUP BY MONTH(revenue_date)`;
    } else if (selectedMetric === 'pending_revenue') {
      const revDateSql = getRevenueDateSql('spb', 'fpb');
      const pendingDateClause = buildDateClause(revDateSql, dateFrom, dateTo);
      sql = `
        SELECT MONTH(${revDateSql}) AS month_num, COALESCE(SUM(fpb.outstanding_amount), 0) AS value
        FROM finance_project_breakdowns fpb
        JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
        WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0 ${pendingDateClause.sql}
        GROUP BY MONTH(${revDateSql})`;
    } else {
      sql = `
        SELECT MONTH(ce.created_at) AS month_num, COALESCE(SUM(ce.net_earning_amount), 0) AS value
        FROM (${getApprovedDedupeCeSubquery()}) AS ce
        WHERE 1=1 ${dateClause.sql}
        GROUP BY MONTH(ce.created_at)`;
    }

    const replacements = selectedMetric === 'pending_revenue'
      ? buildDateClause(getRevenueDateSql('spb', 'fpb'), dateFrom, dateTo).replacements
      : dateClause.replacements;
    const rows = await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    const monthMap = {};
    rows.forEach(r => { monthMap[r.month_num] = toMoney(r.value); });

    const startDate = new Date(`${dateFrom}T00:00:00`);
    const endDate = new Date(`${dateTo}T23:59:59`);
    const startMonth = startDate.getMonth() + 1;
    const endMonth = endDate.getMonth() + 1;

    const graph = [];
    for (let m = startMonth; m <= endMonth; m++) {
      graph.push({ label: MONTH_NAMES[m - 1], value: monthMap[m] || 0 });
    }
    return graph;
  }

  // All-time month graph
  let sql = '';
  if (selectedMetric === 'gross_revenue') {
    sql = `
      SELECT MONTH(revenue_date) AS month_num, COALESCE(SUM(amount), 0) AS value
      FROM (${getGrossRevenueUnionSubquery()}) AS rev
      GROUP BY MONTH(revenue_date)`;
  } else if (selectedMetric === 'pending_revenue') {
    const revDateSql = getRevenueDateSql('spb', 'fpb');
    sql = `
      SELECT MONTH(${revDateSql}) AS month_num, COALESCE(SUM(fpb.outstanding_amount), 0) AS value
      FROM finance_project_breakdowns fpb
      JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
      WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0
      GROUP BY MONTH(${revDateSql})`;
  } else {
    sql = `
      SELECT MONTH(ce.created_at) AS month_num, COALESCE(SUM(ce.net_earning_amount), 0) AS value
      FROM (${getApprovedDedupeCeSubquery()}) AS ce
      GROUP BY MONTH(ce.created_at)`;
  }

  const rows = await db.sequelize.query(sql, { type: QueryTypes.SELECT });
  const monthMap = {};
  rows.forEach(r => { monthMap[r.month_num] = toMoney(r.value); });

  return MONTH_NAMES.map((name, i) => ({
    label: name,
    value: monthMap[i + 1] || 0
  }));
}

// ==========================================
// 4. SERVICE METRIC LOGIC (ORM & HELPERS)
// ==========================================

async function getGrossRevenueTotal(dateFrom, dateTo) {
  const dateClause = buildDateClause('revenue_date', dateFrom, dateTo);
  const [row] = await db.sequelize.query(
    `SELECT COALESCE(SUM(amount), 0) AS total 
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     WHERE 1=1 ${dateClause.sql}`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );
  return toMoney(row?.total);
}

async function getPendingTotal(dateFrom, dateTo) {
  const revDateSql = getRevenueDateSql('booking', 'finance_project_breakdowns');
  const where = {
    outstanding_amount: { [Op.gt]: 0 }
  };
  const replacements = {};
  if (dateFrom || dateTo) {
    const conds = [];
    if (dateFrom) {
      conds.push(`${revDateSql} >= :dateFrom`);
      replacements.dateFrom = `${dateFrom} 00:00:00`;
    }
    if (dateTo) {
      conds.push(`${revDateSql} <= :dateTo`);
      replacements.dateTo = `${dateTo} 23:59:59`;
    }
    where[Op.and] = db.Sequelize.literal(conds.join(' AND '));
  }

  const result = await db.finance_project_breakdowns.findOne({
    attributes: [
      [db.Sequelize.fn('COALESCE', db.Sequelize.fn('SUM', db.Sequelize.col('finance_project_breakdowns.outstanding_amount')), 0), 'total']
    ],
    include: [{
      model: db.stream_project_booking,
      as: 'booking',
      where: { is_active: 1 },
      attributes: [],
      required: true
    }],
    where,
    replacements,
    raw: true
  });

  return toMoney(result?.total);
}

async function getCpPayoutTotal(dateFrom, dateTo) {
  const dateClause = buildDateClause('ce.created_at', dateFrom, dateTo);
  const [row] = await db.sequelize.query(
    `SELECT COALESCE(SUM(ce.net_earning_amount), 0) AS total 
     FROM (${getApprovedDedupeCeSubquery()}) AS ce
     WHERE 1=1 ${dateClause.sql}`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );
  return toMoney(row?.total);
}

async function getOverviewCards(filters) {
  const { dateFrom, dateTo } = parseDateFilter(filters);
  const { curFrom, curTo, prevFrom, prevTo, changeLabel } = getPreviousPeriodRange(dateFrom, dateTo);

  const grossTotal = await getGrossRevenueTotal(dateFrom, dateTo);
  const pendingTotal = await getPendingTotal(dateFrom, dateTo);
  const cpTotal = await getCpPayoutTotal(dateFrom, dateTo);

  const [grossCurRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(amount), 0) AS total 
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     WHERE revenue_date >= :curFrom AND revenue_date <= :curTo`,
    { replacements: { curFrom, curTo }, type: QueryTypes.SELECT }
  );
  const [grossPrevRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(amount), 0) AS total 
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     WHERE revenue_date >= :prevFrom AND revenue_date <= :prevTo`,
    { replacements: { prevFrom, prevTo }, type: QueryTypes.SELECT }
  );

  const revDateSql = getRevenueDateSql('spb', 'fpb');
  const [pendingCurRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(fpb.outstanding_amount), 0) AS total 
     FROM finance_project_breakdowns fpb
     JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
     WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0 AND ${revDateSql} >= :curFrom AND ${revDateSql} <= :curTo`,
    { replacements: { curFrom, curTo }, type: QueryTypes.SELECT }
  );
  const [pendingPrevRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(fpb.outstanding_amount), 0) AS total 
     FROM finance_project_breakdowns fpb
     JOIN stream_project_booking spb ON spb.stream_project_booking_id = fpb.booking_id
     WHERE spb.is_active = 1 AND fpb.outstanding_amount > 0 AND ${revDateSql} >= :prevFrom AND ${revDateSql} <= :prevTo`,
    { replacements: { prevFrom, prevTo }, type: QueryTypes.SELECT }
  );

  const dedupeCeSql = getApprovedDedupeCeSubquery();
  const [cpCurRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(ce.net_earning_amount), 0) AS total 
     FROM (${dedupeCeSql}) AS ce
     WHERE ce.created_at >= :curFrom AND ce.created_at <= :curTo`,
    { replacements: { curFrom, curTo }, type: QueryTypes.SELECT }
  );
  const [cpPrevRow] = await db.sequelize.query(
    `SELECT COALESCE(SUM(ce.net_earning_amount), 0) AS total 
     FROM (${dedupeCeSql}) AS ce
     WHERE ce.created_at >= :prevFrom AND ce.created_at <= :prevTo`,
    { replacements: { prevFrom, prevTo }, type: QueryTypes.SELECT }
  );

  const buildCard = (total, curVal, prevVal) => {
    const cur = Number(curVal || 0);
    const prev = Number(prevVal || 0);
    let change_percent = 0;
    if (prev > 0) {
      change_percent = roundOneDecimal(((cur - prev) / prev) * 100);
    }
    const trend = change_percent > 0 ? 'up' : change_percent < 0 ? 'down' : 'flat';
    return {
      total: toMoney(total),
      change_percent,
      trend,
      change_label: changeLabel,
      has_current_data: cur > 0
    };
  };

  return {
    gross_revenue: buildCard(grossTotal, grossCurRow?.total, grossPrevRow?.total),
    pending_revenue: buildCard(pendingTotal, pendingCurRow?.total, pendingPrevRow?.total),
    cp_payout: buildCard(cpTotal, cpCurRow?.total, cpPrevRow?.total)
  };
}

/**
 * 1) GET /finance/overview
 */
async function getOverview(filters = {}) {
  validateEnum(filters.metric, VALID_METRICS, 'metric');
  validateEnum(filters.group_by, VALID_GROUP_BY, 'group_by');
  parseDateFilter(filters);

  const selectedMetric = filters.metric || 'gross_revenue';
  const groupBy = filters.group_by || 'month';

  const cards = await getOverviewCards(filters);
  const graph = await buildUnifiedGraph(selectedMetric, groupBy, filters);

  return { cards, graph };
}

/**
 * 2) GET /finance/cp-analysis
 */
async function getCpAnalysis(filters = {}) {
  const { dateFrom, dateTo } = parseDateFilter(filters);
  const dateClause = buildDateClause('ce.created_at', dateFrom, dateTo);
  const dedupeCeSql = getApprovedDedupeCeSubquery();
  const multiCpSplitSql = getMultiCpClientSplitSql('fpb', 'cp_counts');

  const cpAnalysisRows = await db.sequelize.query(
    `SELECT 
       ce.creator_id AS cp_id,
       TRIM(CONCAT(COALESCE(cm.first_name, ''), ' ', COALESCE(cm.last_name, ''))) AS name,
       COALESCE(SUM(ce.net_earning_amount), 0) AS total_payout,
       COALESCE(SUM(${multiCpSplitSql}), 0) AS total_client_amount
     FROM (${dedupeCeSql}) AS ce
     JOIN crew_members cm ON cm.crew_member_id = ce.creator_id
     LEFT JOIN finance_project_breakdowns fpb ON fpb.booking_id = ce.booking_id
     LEFT JOIN (
       SELECT booking_id, COUNT(DISTINCT creator_id) AS num_cps
       FROM (${dedupeCeSql}) AS sub_ce
       GROUP BY booking_id
     ) cp_counts ON cp_counts.booking_id = ce.booking_id
     WHERE 1=1 ${dateClause.sql}
     GROUP BY ce.creator_id, cm.first_name, cm.last_name
     ORDER BY total_payout DESC
     LIMIT 5`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );

  const maxPayout = cpAnalysisRows.length > 0 ? Number(cpAnalysisRows[0].total_payout || 1) : 1;

  const top_cps_by_payout = cpAnalysisRows.map((row, index) => {
    const payout = toMoney(row.total_payout);
    const clientAmt = toMoney(row.total_client_amount);
    const rawMargin = clientAmt > 0 ? ((clientAmt - payout) / clientAmt) * 100 : 0;
    const marginPercent = roundOneDecimal(rawMargin); // Not clamped to 0 silently
    const barPercent = maxPayout > 0 ? roundOneDecimal((payout / maxPayout) * 100) : 0;
    return {
      rank: index + 1,
      cp_id: row.cp_id,
      name: row.name || `CP #${row.cp_id}`,
      total_payout: payout,
      margin_percent: marginPercent,
      bar_percent: barPercent
    };
  });

  const [avgStats] = await db.sequelize.query(
    `SELECT 
       COALESCE(SUM(ce.net_earning_amount), 0) AS sum_payout,
       COALESCE(SUM(${multiCpSplitSql}), 0) AS sum_client,
       COUNT(DISTINCT ce.booking_id) AS total_approved_cp_shoots,
       COUNT(ce.creator_earning_id) AS total_assignments
     FROM (${dedupeCeSql}) AS ce
     LEFT JOIN finance_project_breakdowns fpb ON fpb.booking_id = ce.booking_id
     LEFT JOIN (
       SELECT booking_id, COUNT(DISTINCT creator_id) AS num_cps
       FROM (${dedupeCeSql}) AS sub_ce
       GROUP BY booking_id
     ) cp_counts ON cp_counts.booking_id = ce.booking_id
     WHERE 1=1 ${dateClause.sql}`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );

  const sumPayout = Number(avgStats?.sum_payout || 0);
  const sumClient = Number(avgStats?.sum_client || 0);
  const totalApprovedCpShoots = Number(avgStats?.total_approved_cp_shoots || 0);
  const totalAssignments = Number(avgStats?.total_assignments || 0);

  const avg_cp_payout = totalApprovedCpShoots > 0 ? toMoney(sumPayout / totalApprovedCpShoots) : 0;
  const rawAvgMargin = sumClient > 0 ? ((sumClient - sumPayout) / sumClient) * 100 : 0;
  const avg_cp_margin_percent = roundOneDecimal(rawAvgMargin);
  const avg_cps_per_shoot = totalApprovedCpShoots > 0 ? roundOneDecimal(totalAssignments / totalApprovedCpShoots) : 0;

  return {
    top_cps_by_payout,
    averages: {
      avg_cp_payout,
      avg_cp_margin_percent,
      avg_cps_per_shoot
    }
  };
}

/**
 * 3) GET /finance/top-cps-shoots
 * Fully model-based using db.assigned_crew with inclusions and backtick-quoted Sequelize aliases with bound replacements.
 */
async function getTopCpsShoots(filters = {}) {
  const limitInput = toPositiveInt(filters.limit, 'limit', 10);
  const limit = Math.min(limitInput, 20); // capped at 20

  const { dateFrom, dateTo } = parseDateFilter(filters);
  const where = { is_active: 1 };
  const replacements = {};

  if (dateFrom || dateTo) {
    const revDateSql = getRevenueDateSql('project', 'project->finance_breakdown');
    const dateConditions = [];
    if (dateFrom) {
      dateConditions.push(`${revDateSql} >= :dateFrom`);
      replacements.dateFrom = `${dateFrom} 00:00:00`;
    }
    if (dateTo) {
      dateConditions.push(`${revDateSql} <= :dateTo`);
      replacements.dateTo = `${dateTo} 23:59:59`;
    }
    where[Op.and] = db.Sequelize.literal(dateConditions.join(' AND '));
  }

  const rows = await db.assigned_crew.findAll({
    attributes: [
      ['crew_member_id', 'cp_id'],
      [db.Sequelize.fn('COUNT', db.Sequelize.fn('DISTINCT', db.Sequelize.col('assigned_crew.project_id'))), 'shoots_count']
    ],
    include: [
      {
        model: db.crew_members,
        as: 'crew_member',
        attributes: ['first_name', 'last_name'],
        required: true
      },
      {
        model: db.stream_project_booking,
        as: 'project',
        where: { is_active: 1 },
        required: true,
        attributes: [],
        include: [
          {
            model: db.finance_project_breakdowns,
            as: 'finance_breakdown',
            required: true,
            attributes: []
          }
        ]
      }
    ],
    where,
    replacements,
    group: [
      'assigned_crew.crew_member_id',
      'crew_member.crew_member_id',
      'crew_member.first_name',
      'crew_member.last_name'
    ],
    order: [[db.Sequelize.literal('shoots_count'), 'DESC']],
    limit,
    raw: true
  });

  return rows.map((row, idx) => {
    const firstName = row['crew_member.first_name'] || row.first_name || '';
    const lastName = row['crew_member.last_name'] || row.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      rank: idx + 1,
      cp_id: row.cp_id,
      name: fullName || `CP #${row.cp_id}`,
      shoots_count: Number(row.shoots_count || 0)
    };
  });
}

/**
 * 4) GET /finance/clients
 */
async function getTopClients(filters = {}, dateClause, whereExtra, extraReplacements) {
  const page = toPositiveInt(filters.page, 'page', 1);
  const limitInput = toPositiveInt(filters.limit, 'limit', 10);
  const limit = Math.min(limitInput, 100); // capped at 100
  const offset = (page - 1) * limit;

  validateEnum(filters.sort_by, VALID_SORT_BY, 'sort_by');
  const sortBy = (filters.sort_by === 'shoot' || filters.sort_by === 'shoots_count') ? 'shoots_count' : 'total_spend';

  const clientKeySql = getClientKeySql('u', 'rev');
  const deterministicClientJoin = getDeterministicClientJoinSql('u', 'c');
  const dateSqlMapped = dateClause.sql.replace(/spb\./g, 'rev.');
  const whereExtraMapped = whereExtra.replace(/spb\./g, 'rev.');

  const countRow = await db.sequelize.query(
    `SELECT COUNT(DISTINCT ${clientKeySql}) AS total
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     LEFT JOIN users u ON u.id = rev.user_id
     ${deterministicClientJoin}
     WHERE 1=1 ${dateSqlMapped} ${whereExtraMapped}`,
    { replacements: extraReplacements, type: QueryTypes.SELECT }
  );
  const total = Number(countRow[0]?.total || 0);

  const clientRows = await db.sequelize.query(
    `SELECT 
       ${clientKeySql} AS client_key,
       COALESCE(u.id, c.client_id, 0) AS client_id,
       COALESCE(c.name, u.name, rev.guest_email) AS client_name,
       u.profile_image AS avatar,
       COUNT(DISTINCT rev.booking_id) AS shoots_count,
       COALESCE(SUM(rev.amount), 0) AS total_spend
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     LEFT JOIN users u ON u.id = rev.user_id
     ${deterministicClientJoin}
     WHERE 1=1 ${dateSqlMapped} ${whereExtraMapped}
     GROUP BY client_key, client_id, client_name, avatar
     ORDER BY ${sortBy} DESC
     LIMIT :limit OFFSET :offset`,
    {
      replacements: { ...extraReplacements, limit, offset },
      type: QueryTypes.SELECT
    }
  );

  return {
    rows: clientRows.map(r => ({
      client_key: r.client_key,
      client_id: r.client_id || 0,
      client_name: r.client_name,
      avatar: r.avatar || null,
      shoots_count: Number(r.shoots_count || 0),
      total_spend: toMoney(r.total_spend)
    })),
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit) || 1
    }
  };
}

async function getAvgClientSpend(filters = {}, dateClause) {
  const clientKeySql = getClientKeySql('u', 'rev');
  const deterministicClientJoin = getDeterministicClientJoinSql('u', 'c');
  const dateSqlMapped = dateClause.sql.replace(/spb\./g, 'rev.');

  const [activeClientStats] = await db.sequelize.query(
    `SELECT 
       COALESCE(SUM(rev.amount), 0) AS total_spend,
       COUNT(DISTINCT rev.booking_id) AS total_shoots
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     WHERE 1=1 ${dateSqlMapped}`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );

  const activeSpend = Number(activeClientStats?.total_spend || 0);
  const activeShoots = Number(activeClientStats?.total_shoots || 0);
  const total_avg = activeShoots > 0 ? toMoney(activeSpend / activeShoots) : 0;

  const [topClientRow] = await db.sequelize.query(
    `SELECT 
       ${clientKeySql} AS client_key,
       COALESCE(c.name, u.name, rev.guest_email, 'Top Client') AS client_name,
       COALESCE(SUM(rev.amount), 0) AS total_spend
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     LEFT JOIN users u ON u.id = rev.user_id
     ${deterministicClientJoin}
     WHERE 1=1 ${dateSqlMapped}
     GROUP BY client_key, client_name
     ORDER BY total_spend DESC
     LIMIT 1`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );

  const { dateFrom, dateTo } = parseDateFilter(filters);
  let spendGraphRows = [];
  if (dateFrom && dateTo) {
    spendGraphRows = await db.sequelize.query(
      `SELECT 
         MONTH(revenue_date) AS month_num,
         COALESCE(SUM(amount), 0) AS spend
       FROM (${getGrossRevenueUnionSubquery()}) AS rev
       WHERE 1=1 ${dateSqlMapped}
       GROUP BY MONTH(revenue_date)`,
      { replacements: dateClause.replacements, type: QueryTypes.SELECT }
    );
  } else {
    spendGraphRows = await db.sequelize.query(
      `SELECT 
         MONTH(revenue_date) AS month_num,
         COALESCE(SUM(amount), 0) AS spend
       FROM (${getGrossRevenueUnionSubquery()}) AS rev
       GROUP BY MONTH(revenue_date)`,
      { type: QueryTypes.SELECT }
    );
  }

  const monthSpendMap = {};
  spendGraphRows.forEach(r => { monthSpendMap[r.month_num] = toMoney(r.spend); });

  let clientSpendGraph = [];
  if (dateFrom && dateTo) {
    const startMonth = new Date(`${dateFrom}T00:00:00`).getMonth() + 1;
    const endMonth = new Date(`${dateTo}T23:59:59`).getMonth() + 1;
    for (let m = startMonth; m <= endMonth; m++) {
      clientSpendGraph.push({ label: MONTH_NAMES[m - 1], value: monthSpendMap[m] || 0 });
    }
  } else {
    clientSpendGraph = MONTH_NAMES.map((name, i) => ({
      label: name,
      value: monthSpendMap[i + 1] || 0
    }));
  }

  return {
    total_avg,
    top_client: topClientRow?.client_name || 'N/A',
    top_spend: toMoney(topClientRow?.total_spend),
    graph: clientSpendGraph
  };
}

async function getShootDistribution(filters = {}, dateClause) {
  const clientKeySql = getClientKeySql('u', 'rev');
  const deterministicClientJoin = getDeterministicClientJoinSql('u', 'c');
  const dateSqlMapped = dateClause.sql.replace(/spb\./g, 'rev.');

  const shootDistRows = await db.sequelize.query(
    `SELECT 
       ${clientKeySql} AS client_key,
       COALESCE(u.id, c.client_id, 0) AS client_id,
       COALESCE(c.name, u.name, rev.guest_email) AS client_name,
       COUNT(DISTINCT rev.booking_id) AS shoots_count
     FROM (${getGrossRevenueUnionSubquery()}) AS rev
     LEFT JOIN users u ON u.id = rev.user_id
     ${deterministicClientJoin}
     WHERE 1=1 ${dateSqlMapped}
     GROUP BY client_key, client_id, client_name
     ORDER BY shoots_count DESC
     LIMIT 8`,
    { replacements: dateClause.replacements, type: QueryTypes.SELECT }
  );

  const maxShoots = shootDistRows.length > 0 ? Number(shootDistRows[0].shoots_count || 1) : 1;
  return shootDistRows.map(r => {
    const count = Number(r.shoots_count || 0);
    return {
      client_key: r.client_key,
      client_id: r.client_id || 0,
      client_name: r.client_name,
      shoots_count: count,
      bar_percent: maxShoots > 0 ? roundOneDecimal((count / maxShoots) * 100) : 0
    };
  });
}

async function getClientAnalytics(filters = {}) {
  const statusFilter = validateStatusFilter(filters.status);
  const { dateFrom, dateTo } = parseDateFilter(filters);
  const dateClause = buildDateClause('revenue_date', dateFrom, dateTo);

  let whereExtra = '';
  const extraReplacements = { ...dateClause.replacements };

  if (filters.search) {
    whereExtra += ' AND (c.name LIKE :search OR u.name LIKE :search OR rev.guest_email LIKE :search) ';
    extraReplacements.search = `%${String(filters.search).trim()}%`;
  }
  if (statusFilter !== null) {
    whereExtra += ' AND rev.booking_status = :bookingStatus ';
    extraReplacements.bookingStatus = statusFilter;
  }

  const top_clients = await getTopClients(filters, dateClause, whereExtra, extraReplacements);
  const avg_client_spend_per_shoot = await getAvgClientSpend(filters, dateClause);
  const shoot_distribution = await getShootDistribution(filters, dateClause);

  return {
    top_clients,
    avg_client_spend_per_shoot,
    shoot_distribution
  };
}

/**
 * 5) GET /finance/disputes
 * Fully model-based using db.finance_disputes.
 */
async function getDisputeCounts(where, replacements = {}) {
  const [countsRow] = await db.finance_disputes.findAll({
    attributes: [
      [db.Sequelize.fn('COUNT', db.Sequelize.col('finance_dispute_id')), 'raised'],
      [db.Sequelize.literal(`COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0)`), 'resolved'],
      [db.Sequelize.literal(`COALESCE(SUM(CASE WHEN status IN ('open', 'in_review') THEN 1 ELSE 0 END), 0)`), 'pending'],
      [db.Sequelize.literal(`COALESCE(SUM(CASE WHEN status IN ('open', 'in_review', 'escalated') THEN 1 ELSE 0 END), 0)`), 'active']
    ],
    where,
    replacements,
    raw: true
  });

  return {
    raised: Number(countsRow?.raised || 0),
    resolved: Number(countsRow?.resolved || 0),
    pending: Number(countsRow?.pending || 0),
    active: Number(countsRow?.active || 0)
  };
}

async function getDisputeReasons(where, replacements = {}, page = 1, limit = 10) {
  const offset = (page - 1) * limit;

  const totalCategories = await db.finance_disputes.count({
    distinct: true,
    col: 'category',
    where,
    replacements
  });

  const reasonRows = await db.finance_disputes.findAll({
    attributes: [
      ['category', 'reason_code'],
      [db.Sequelize.fn('COUNT', db.Sequelize.col('finance_dispute_id')), 'cases']
    ],
    where,
    replacements,
    group: ['category'],
    order: [[db.Sequelize.literal('cases'), 'DESC']],
    limit,
    offset,
    raw: true
  });

  return {
    rows: reasonRows.map((r, idx) => {
      const cases = Number(r.cases || 0);
      return {
        rank: offset + idx + 1,
        reason_name: formatDisputeReason(r.reason_code),
        cases,
        progress_percent: 0
      };
    }),
    pagination: {
      total: totalCategories,
      page,
      limit,
      total_pages: Math.ceil(totalCategories / limit) || 1
    }
  };
}

async function getDisputesAnalytics(filters = {}) {
  const page = toPositiveInt(filters.page, 'page', 1);
  const limitInput = toPositiveInt(filters.limit, 'limit', 10);
  const limit = Math.min(limitInput, 100); // capped at 100

  const { dateFrom, dateTo } = parseDateFilter(filters);
  const where = {};
  const replacements = {};
  if (dateFrom || dateTo) {
    const conditions = [];
    if (dateFrom) {
      conditions.push(`created_at >= :dateFrom`);
      replacements.dateFrom = `${dateFrom} 00:00:00`;
    }
    if (dateTo) {
      conditions.push(`created_at <= :dateTo`);
      replacements.dateTo = `${dateTo} 23:59:59`;
    }
    where[Op.and] = db.Sequelize.literal(conditions.join(' AND '));
  }

  const counts = await getDisputeCounts(where, replacements);
  const top_dispute_reasons = await getDisputeReasons(where, replacements, page, limit);

  top_dispute_reasons.rows.forEach(r => {
    r.progress_percent = counts.raised > 0 ? roundOneDecimal((r.cases / counts.raised) * 100) : 0;
  });

  return {
    counts,
    top_dispute_reasons
  };
}

// ==========================================
// EXPORTS AT BOTTOM
// ==========================================
module.exports = {
  getOverview,
  getCpAnalysis,
  getTopCpsShoots,
  getClientAnalytics,
  getDisputesAnalytics
};
