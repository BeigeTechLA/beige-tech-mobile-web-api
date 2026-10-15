// Matches the Paid branch of salesLeadBookingStatus using indexed booking and
// payment summary records before loading the expensive lead associations.
const paidSalesLeadSql = `
  sales_leads.lead_status <> 'abandoned'
  AND NOT EXISTS (
    SELECT 1 FROM stream_project_booking paid_booking_cancelled
    WHERE paid_booking_cancelled.stream_project_booking_id = sales_leads.booking_id
      AND paid_booking_cancelled.is_cancelled = 1
  )
  AND (
    EXISTS (
      SELECT 1 FROM booking_payment_summary paid_summary
      WHERE paid_summary.booking_id = sales_leads.booking_id
        AND paid_summary.due_amount <= 0.009
        AND (
          COALESCE(paid_summary.paid_amount, 0) + COALESCE(paid_summary.credit_used_amount, 0) > 0
          OR paid_summary.payment_status IN ('paid', 'no_payment_due', 'completed', 'success')
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM booking_payment_summary unpaid_summary
        WHERE unpaid_summary.booking_id = sales_leads.booking_id
      )
      AND (
        sales_leads.lead_status = 'booked'
        OR EXISTS (
          SELECT 1 FROM stream_project_booking paid_booking
          WHERE paid_booking.stream_project_booking_id = sales_leads.booking_id
            AND paid_booking.payment_id IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM sales_lead_activities manual_payment
          WHERE manual_payment.lead_id = sales_leads.lead_id
            AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(manual_payment.activity_data), manual_payment.activity_data, '{}'), '$.payment_method')) = 'manual'
            AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(manual_payment.activity_data), manual_payment.activity_data, '{}'), '$.payment_type')) = 'full'
        )
      )
    )
  )
`;

const closedLostSalesLeadSql = `
  sales_leads.lead_status = 'abandoned'
  OR EXISTS (
    SELECT 1 FROM stream_project_booking lost_booking
    WHERE lost_booking.stream_project_booking_id = sales_leads.booking_id
      AND lost_booking.is_cancelled = 1
  )
`;

const openSalesLeadSql = `
  NOT (${paidSalesLeadSql})
  AND NOT (${closedLostSalesLeadSql})
`;

module.exports = { paidSalesLeadSql, closedLostSalesLeadSql, openSalesLeadSql };
