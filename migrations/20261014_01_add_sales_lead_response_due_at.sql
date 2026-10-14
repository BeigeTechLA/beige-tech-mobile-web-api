-- Explicit lead-response deadlines; null means no overdue reminder.
ALTER TABLE sales_leads
    ADD COLUMN response_due_at DATETIME DEFAULT NULL AFTER contacted_sales_at,
    ADD COLUMN owner_responded_at DATETIME DEFAULT NULL AFTER response_due_at;

CREATE INDEX idx_sales_leads_response_due_at
    ON sales_leads(response_due_at, assigned_sales_rep_id, is_active);
