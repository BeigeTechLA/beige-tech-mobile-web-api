ALTER TABLE sales_record_reassignment_history
  ADD COLUMN batch_id CHAR(36) NULL AFTER id,
  ADD KEY idx_sales_reassignment_batch (batch_id);
