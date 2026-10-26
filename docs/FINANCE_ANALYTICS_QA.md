# Finance Analytics: verification from admin modules

This is a **screen/export reconciliation guide** for QA. Start with **All time** in Finance Analytics. Compare exact dollar amounts in the other modules, not the rounded `$K` labels. Use shoot ID, client ID/email, and CP ID to match rows; names alone are unsafe.

## One-click QA check

On **Finances → Finance Analytics**, select a date range (or All time) and click **Download QA reconciliation**. The workbook uses the same calculation rules and date range as the dashboard, reading current records when the file is generated. Refresh the page before comparing it with the screen if records may have changed.

1. Open **Summary**. `Dashboard` is the Analytics value; `Source Total` is calculated from the exported source rows; `Difference` should be zero. Ranking checks show `1` when the ranked IDs and amounts match and still have zero difference.
2. For a nonzero difference, open the named **Source Sheet** and filter by Shoot ID, CP ID, client ID, or dispute ID. The **Revenue** sheet shows full total, collected amount, payment date/status, and separate Gross/Pending contribution columns. **Transactions Source** includes transaction type, status, date, and amount. **CP Compensation**, **Client Bookings**, and **Disputes** show the other source rows.
3. Check the underlying record in Shoots, Transactions, CP Compensation, Clients, or Disputes. Exported rows marked `In Range = No` or `Included In Ranking = No` have zero contribution to that metric.

**A zero Difference confirms the dashboard calculation agrees with the workbook's source rows. It does not prove that a source record itself is correct.** If a shoot's total, payment status, or date is wrong, correct that source record and rerun the export. The workbook is a read-only QA aid.

For the `$4.1M` Gross Revenue example, choose **All time**, download the workbook, and read **Summary → Gross Revenue** for the exact amount. To reproduce it in Excel, open **Revenue**, filter `In Range = Yes` and `Payment Status = paid/partially_paid`, then sum `Full Total`. The Shoots CSV total and Transactions CSV total are different measures and are not the expected comparison.

## What each module can prove

| Admin module | Use it for | What its current export cannot prove |
|---|---|---|
| **Shoots → Export CSV** | Identify shoot ID, client email, quoted/booking `Amount`, event status, assigned CP names. Open a shoot to inspect payment history and receipts. | The CSV has no payment status, collected amount, balance, refund, or payment date. Its date range filters **shoot event date**, and `Amount` may come from quote/budget. Its `Amount` column is **not** a direct Gross Revenue total. |
| **Finances → Transactions → Export CSV** | Verify successful payment events, amounts, and transaction dates. In the screen, use **Transaction ID** or **Shoot ID** view and open a shoot's transaction list. | The CSV has only Transaction Date, Transaction ID, Client Name, Total Amount, Payment Method, Receipt URL. It has no shoot ID, payment status, transaction type, quote total, or remaining balance. Even after identifying successful client payments, their sum is **cash collected**, not Gross Revenue. Clear search/status/method filters before exporting unless they are part of your test. |
| **Finances → CP Compensation** | Verify each creator's agreed compensation, paid amount, payable amount, due date, and payment history. Use Shoot and Creator views; open a shoot for detailed history. | There is no working bulk compensation CSV on this page. Its period filter is based on compensation activity and does not use the Analytics due-date rule for unpaid earnings. |
| **Users → Clients → client profile** | Verify paid shoots belonging to a client and group by client ID. **Clients → Export CSV** helps map user IDs/emails to shoot IDs. | Clients CSV has no shoot amount or payment balance; its date filter is not the Analytics payment activity filter. |
| **Finances → Disputes** | Verify status, reason, created date, and resolved date for each dispute. | The visible **Export** button currently has no download handler. Use the screen and its detail view. |

**Practical result:** the older Shoots and Transactions CSV exports do **not** support an exact one-file reconciliation of every Analytics total. Use the new QA workbook for the complete row list and inspect individual module records only when a difference or suspicious source value appears. A mismatch from summing Shoots CSV or Transactions CSV alone is not evidence of an Analytics bug.

## Revenue and client payments: build one row per shoot

In **Shoots**, export all records or locate the shoots you want. For each shoot, open its detail/payment history and cross-check **Finances → Transactions**. In a sheet record: Shoot ID, client ID/email, shoot event date, first successful payment date, finance payment status, total shoot amount, collected amount, and successful refund amount. Use the same timezone and selected date range as Analytics. If a payment record and the shoot's displayed quote/amount disagree, record both; Analytics uses the finance payment breakdown's total, not necessarily the Shoots CSV `Amount`.

| Analytics item | Include these rows and calculate |
|---|---|
| **Gross Revenue** | Include shoots whose finance payment status is **Paid** or **Partially Paid**, and whose first successful payment activity date is in the Analytics range. **Sum the full shoot total**, including the unpaid part of partially paid shoots. Exclude pending-only shoots. Formula: `Σ eligible shoot total`. Example: $1,000 fully paid + $800 partially paid ($300 received) = **$1,800 gross**, not $1,300. |
| **Pending Revenue** | Include every non-refunded finance shoot record in range with a positive balance, including pending and partially paid. Formula for each: `max(shoot total − collected, 0)`; then sum. In the example, the partial shoot contributes **$500 pending**. Pending-only shoots contribute their full unpaid balance. |
| **Refunds** | In payment/transaction history, include successful refunds whose **refund transaction date** is in range. Sum absolute refund amounts. The original shoot/payment may be outside the selected range. |
| **Net Revenue** | `Gross Revenue − successful refunds`. Analytics returns this value even though the Gross Revenue card displays gross. A refund-only date range can have negative net. |
| **Outstanding Payment** | The large **Total Outstanding** value equals Pending Revenue. Its green paid portion uses collected amounts from the finance shoot records; the red portion uses remaining balances. Do not interpret green plus red as the outstanding amount. |
| **Recovered payments** | Sum successful **client payment transactions** by transaction date. This is cash/payment activity, including a later installment on an older shoot. It is not the same as Gross Revenue or the collected snapshot. |
| **Average Client Spend per Shoot** | `Gross Revenue ÷ number of paid/partially-paid finance shoot records` in range. |
| **Client Payment Overview** | Group the finance shoot rows by client ID, or lowercase guest email. Sum each client's collected and remaining balance. Count each client **once**: fully paid if balance = 0; partially paid if balance > 0 and collected > 0; pending if balance > 0 and collected = 0. |
| **Top Clients / Shoot Distribution** | In **Users → Clients → client profile**, count distinct paid/partially-paid shoots for each client and sum their shoot totals. Pending-only shoots do not count. Rankings use confirmed booking payment evidence, so a missing/stale finance breakdown can make their spend differ from breakdown-based Gross Revenue. |

**Date warning:** Shoots CSV date filter uses **event date**. Analytics Gross Revenue uses the first successful payment transaction date for a shoot, otherwise its payment completion date, otherwise the finance calculation date. Therefore export Shoots with **All records**, then filter your sheet using the relevant payment date. Transactions CSV date filter uses transaction date and can be used directly for payment-event checks.

## CP payouts: build one row per CP and shoot

In **Finances → CP Compensation**, use the Shoot view and open each relevant shoot. Record Shoot ID, CP ID/name, current approved compensation, amount paid, amount still payable, payout date, and due date. If a CP has multiple revisions for one shoot, use the **latest submitted/approved record**, not every historical row. Draft, rejected, and cancelled compensation is excluded. For old records marked Paid without a payout request, the paid status supplies the paid amount.

| Analytics item | Formula and module check |
|---|---|
| **CP Payout card** | `Σ paid CP amounts + Σ remaining payable CP amounts`. These are compensation commitments, so the total need not equal payments in Transactions CSV. |
| **Top CPs By Payout** | Group **paid amounts only** by CP, sort high to low, take five. An approved but wholly unpaid CP is absent. |
| **Top CPs By Shoots** | For each CP with paid compensation, count **distinct shoot IDs**, sort high to low, take ten. Check the graph bar/hover value against that count. |
| **Average CP Payout** | `Σ paid CP amounts ÷ number of CP/shoot compensation rows with paid amount > 0`. |
| **Average CP Margin** | `Σ paid CP amounts ÷ Gross Revenue × 100`. This is a payout-to-revenue ratio, **not business profit margin**. It can look unusual in a narrow date range because revenue and payout dates differ. |
| **Average CPs per Shoot** | `number of paid CP/shoot compensation rows ÷ number of distinct shoot IDs among those rows`. |
| **CP Payout Timeline** | Sum **remaining payable**, never original full compensation, by due date relative to today: overdue = before today; This Week = 0–6 days; Next Week = 7–13; 2–4 Weeks = 14–27. Amounts due 28+ days out or lacking a due date are outside these four buckets. |
| **Top Overdue CPs** | For each CP, sum remaining payable for assignments due before today; sort by amount. Days overdue is based on that CP's oldest unpaid due date. |

For paid CP amounts, Analytics uses payout transaction/activity date. For unpaid CP amounts, Analytics uses **due date**. If no due date is configured, it uses shoot event date + 15 days. Do not apply the shoot event-date filter to every CP metric.

## Disputes: check in Finances → Disputes

| Analytics item | Filter and count in the Disputes module |
|---|---|
| **Raised** | Disputes **created** in the Analytics date range, any current status. |
| **Resolved** | Disputes currently Resolved whose **resolution date** is in range. They may have been created earlier, so this can exceed Raised. |
| **Pending** | Among disputes created in range, count current **Open** status. |
| **Active** | Among disputes created in range, count current **In Review** or **Escalated** status. |
| **Top Reasons** | Among disputes created in range, group by category/reason, sort by count, take five. |

## QA procedure for a reported mismatch

1. Capture the Analytics date range and timezone, the exact card amount, and the comparable module's filters. Clear unrelated search/status filters.
2. Match records by **Shoot ID / CP ID / Client ID**, then write down each included amount and the **date field used by that metric**. Avoid comparing event-date exports with payment-date Analytics totals.
3. Calculate with exact dollar values to two decimals. Compare the resulting total with the card's full value/detail, since compact `$K` labels round.
4. Report a bug with the missing or extra IDs, their payment/approval statuses, amounts, transaction/due dates, and the expected formula. A total-only screenshot is not enough to locate the cause.

Example bug report: “For October in Asia/Kolkata, shoot 123 is Partially Paid; total $800, collected $300, first successful payment October 5. Expected Gross Revenue contribution $800 and Pending Revenue contribution $500. Analytics shows a different contribution.”

The automated calculation suite is `node test/finance-analytics.service.test.js` in `beige-tech-mobile-web-api`. It checks formulas with known records; QA still needs the module-level checks above for the environment being tested.
