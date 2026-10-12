# Finance Analytics API

## Purpose

This API supplies all data required by the Admin Finance Analytics dashboard:

- Revenue, pending balance, refunds, and CP payout summary
- Creative Partner ranking, payout, overdue, and timeline analytics
- Client ranking and payment-status analytics
- Dispute summary and common dispute reasons

It is a single dashboard endpoint so every card uses the same selected date range and timezone.

## Endpoint

```http
GET /v1/finance/admin/analytics
```

### Authorization

```http
Authorization: Bearer <admin-jwt>
```

Required permission:

```text
admin_finances_analytics.view
```

The permission is created by [20261012_01_add_admin_finance_analytics_permissions.sql](../migrations/20261012_01_add_admin_finance_analytics_permissions.sql). Users may need to sign in again after the migration because their `permissions_version` is incremented.

## Query parameters

| Parameter | Required | Format | Description |
|---|---:|---|---|
| `start_date` | No | `YYYY-MM-DD` | First selected day, inclusive. Must be sent with `end_date`. |
| `end_date` | No | `YYYY-MM-DD` | Last selected day, inclusive. Must be sent with `start_date`. |
| `timezone` | No | IANA timezone | Defaults to `Asia/Kolkata`. Used to convert timestamped events into calendar days. |

If no dates are supplied, the endpoint returns all-time data.

Examples:

```http
GET /v1/finance/admin/analytics?timezone=Asia%2FKolkata
GET /v1/finance/admin/analytics?start_date=2026-09-01&end_date=2026-09-30&timezone=Asia%2FKolkata
```

Invalid date ranges return `400`:

```json
{
  "success": false,
  "message": "start_date and end_date must be provided together"
}
```

## Response shape

```json
{
  "success": true,
  "data": {
    "filters": {
      "start_date": "2026-09-01",
      "end_date": "2026-09-30",
      "timezone": "Asia/Kolkata"
    },
    "revenue": {},
    "creative_partners": {},
    "clients": {},
    "disputes": {}
  }
}
```

All monetary amounts are numbers, rounded to two decimal places. The current finance dashboard is USD-based; this endpoint does not convert or combine different currencies.

### `data.revenue`

```json
{
  "gross_revenue": { "amount": 120000 },
  "refund_amount": 5000,
  "net_revenue": { "amount": 115000 },
  "pending_revenue": { "amount": 18000 },
  "cp_payout": {
    "paid_amount": 43000,
    "payable_amount": 7000,
    "total_amount": 50000
  },
  "series": [
    {
      "date": "2026-09-01",
      "gross": 12000,
      "pending": 2000,
      "cp_payout": 5000,
      "refunds": 0,
      "net_revenue": 12000
    }
  ]
}
```

| Field | Dashboard usage | Definition |
|---|---|---|
| `gross_revenue.amount` | Gross Revenue card | Sum of `finance_project_breakdowns.total_amount` for `paid` and `partially_paid` shoots. |
| `refund_amount` | Optional refund display | Paid/refunded `finance_transactions` where `transaction_type = refund`. |
| `net_revenue.amount` | Gross Revenue card value | `gross_revenue - refund_amount`. |
| `pending_revenue.amount` | Pending Revenue card | Sum of `outstanding_amount` from `unpaid`, `pending`, and `partially_paid` finance records. |
| `cp_payout` | CP Payout card | CP earnings split into completed payments (`paid_amount`) and unpaid/payable earnings (`payable_amount`). |
| `series` | Revenue Overview chart | Calendar-day values in the requested timezone. |

### `data.creative_partners`

```json
{
  "top_by_payout": [
    {
      "id": "2010",
      "name": "Creative Partner",
      "payout": 12000,
      "shoots": 8,
      "shoot_revenue": 40000,
      "margin": 30
    }
  ],
  "top_by_shoots": [
    { "id": "2010", "name": "Creative Partner", "shoots": 8 }
  ],
  "averages": {
    "payout_per_assignment": 1500,
    "cp_payout_percent_of_revenue": 30,
    "cps_per_shoot": 1.5
  },
  "payout_timeline": [
    {
      "id": "this_week",
      "label": "This Week",
      "segments": { "upcoming": 3000, "dueSoon": 0, "later": 0, "overdue": 0 }
    }
  ],
  "top_overdue": [
    { "id": "2010", "name": "Creative Partner", "amount": 2500, "days_overdue": 5 }
  ]
}
```

| Field | Dashboard usage | Definition |
|---|---|---|
| `top_by_payout` | Top CPs by Payout | Five CPs with highest total CP earning. `margin = CP payout / revenue of that CP's assigned shoots × 100`. |
| `top_by_shoots` | Top CPs by Shoots | Ten CPs with the most distinct eligible bookings. |
| `averages.payout_per_assignment` | Average CP Payout | Total CP payout ÷ CP earning/assignment count. |
| `averages.cp_payout_percent_of_revenue` | Average CP Margin | Total CP payout ÷ total eligible shoot revenue × 100. |
| `averages.cps_per_shoot` | Average CPs per Shoot | CP earning/assignment count ÷ distinct CP-assigned bookings. |
| `payout_timeline` | CP Payout Timeline | Outstanding CP amount bucketed by due date. `this_week` = 0–6 days; `next_week` = 7–13 days; `2_4_weeks` = 14–27 days; `overdue` = before today. |
| `top_overdue` | Top Overdue CPs | Five CPs with the largest unpaid amount past their due date. |

For paid CP earnings, the date filter uses the payout finance transaction date. For payable earnings, it uses the CP due date. The due date comes from `creator_earnings.metadata_json.due_date` / `payout_due_date`; if absent, it defaults to 15 days after the booking event date.

### `data.clients`

```json
{
  "top_by_shoots": [
    {
      "id": "user:245",
      "name": "Client Name",
      "shoots": 6,
      "spend": 22000,
      "collected": 18000,
      "outstanding": 4000,
      "status": "partially_paid"
    }
  ],
  "top_by_spend": [],
  "average_spend_per_shoot": { "amount": 4200 },
  "payment_overview": [
    { "id": "fully_paid", "label": "Fully Paid", "clients": 52 },
    { "id": "partially_paid", "label": "Partially Paid", "clients": 18 },
    { "id": "pending", "label": "Pending", "clients": 30 }
  ],
  "outstanding": {
    "collected_amount": 102000,
    "outstanding_amount": 18000,
    "recovered_amount": 14000,
    "recovered_series": [{ "name": "2026-09-01", "value": 2400 }]
  }
}
```

| Field | Dashboard usage | Definition |
|---|---|---|
| `top_by_shoots` | Top Clients — By Shoot | Top ten unique clients by distinct paid/partially-paid shoots. |
| `top_by_spend` | Top Clients — By Spend | Top ten unique clients by total amount of paid/partially-paid shoots. |
| `average_spend_per_shoot.amount` | Average Client Spend per Shoot | Gross revenue ÷ eligible paid/partially-paid shoot count. |
| `payment_overview` | Client Payment Overview donut | Unique client count, never booking count. Includes clients with all finance payment statuses. |
| `outstanding` | Outstanding Payment | Client collected and remaining amounts; `recovered_series` is successful client-payment activity by day. |

Each client is classified only once by aggregating all of their finance records in the selected range:

```text
Fully Paid:     outstanding_amount <= 0
Partially Paid: collected_amount > 0 and outstanding_amount > 0
Pending:        collected_amount = 0 and outstanding_amount > 0
```

Authenticated clients are grouped by user ID. Guest bookings are grouped by normalized guest email.

### `data.disputes`

```json
{
  "raised": 18,
  "resolved": 11,
  "pending": 4,
  "active": 3,
  "top_reasons": [
    { "id": "payment_delay", "name": "payment delay", "cases": 6 }
  ]
}
```

| Field | Definition |
|---|---|
| `raised` | Disputes whose `created_at` is in the selected date range. |
| `resolved` | Disputes with `status = resolved` whose `resolved_at` is in the selected date range. |
| `pending` | Raised disputes currently in `open` status. |
| `active` | Raised disputes currently in `in_review` or `escalated` status. |
| `top_reasons` | Five most common dispute `category` values among raised disputes. |

## Frontend integration

Fetch once when the page first loads and whenever the dashboard date range changes.

```ts
const params = new URLSearchParams({
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  timezone: 'Asia/Kolkata',
});

const response = await apiClient.get(`/finance/admin/analytics?${params}`);
const analytics = response.data.data;
```

Recommended mapping for the existing finance components:

| Component | Response data |
|---|---|
| `RevenueOverviewChart` | `analytics.revenue` |
| `TopCPsByPayout` | `analytics.creative_partners.top_by_payout` |
| `TopCPsByShoots` | `analytics.creative_partners.top_by_shoots` |
| `AvgPayoutMarginCount` | `analytics.creative_partners.averages` |
| `CPPayoutTimeline` | `analytics.creative_partners.payout_timeline` |
| `TopOverdueCPs` | `analytics.creative_partners.top_overdue` |
| `TopClients` | `top_by_shoots` or `top_by_spend`, depending on selected tab |
| `AvgClientSpendPerShoot` | `analytics.clients.average_spend_per_shoot` |
| `ClientPaymentOverview` | `analytics.clients.payment_overview` |
| `OutstandingPayment` | `analytics.clients.outstanding` |
| `DisputesSummary` | `analytics.disputes` |
| `TopDisputeReasons` | `analytics.disputes.top_reasons` |

The existing page's `selectedDate` is a single day. Change it to a start/end date range (or a preset that resolves to one) before calling this endpoint.

## Backend implementation

| File | Responsibility |
|---|---|
| `src/routes/finance.routes.js` | Registers authenticated admin route. |
| `src/controllers/finance.controller.js` | Returns the standard `{ success, data }` response and maps validation errors to HTTP 400. |
| `src/services/finance-analytics.service.js` | Loads finance records and performs all aggregation/calculation rules. |
| `migrations/20261012_01_add_admin_finance_analytics_permissions.sql` | Creates and grants the view permission. |
| `test/finance-analytics.service.test.js` | Tests paid/partial revenue, refunds, unique-client classification, and CP margin. |

## Testing

Postman/REST Client requests are in [postman.http](../postman.http) under **Admin Finance Analytics**.

```bash
node test/finance-analytics.service.test.js
```

Manual checks:

1. Use an admin user with `admin_finances_analytics.view`.
2. Call all-time analytics and a custom date range.
3. Confirm the Gross Revenue card excludes unpaid-only shoots.
4. Confirm Pending Revenue includes pending, unpaid, and partial balances.
5. Confirm each client appears in only one payment overview bucket.
6. Confirm a refund decreases `net_revenue` but does not change `gross_revenue`.
7. Confirm CP overdue rows use the due date configured in CP Compensation.

## Known scope

- The API is read-only.
- No currency conversion is performed; do not aggregate multiple currencies in the UI without a conversion policy.
- Frontend card growth percentages are not returned yet. If required, add a comparison-period contract after product confirms the comparison rules for custom ranges.
