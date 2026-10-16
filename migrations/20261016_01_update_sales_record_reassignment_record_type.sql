ALTER TABLE sales_record_reassignment_history
  MODIFY record_type ENUM('lead','quote','post_production') NOT NULL;
