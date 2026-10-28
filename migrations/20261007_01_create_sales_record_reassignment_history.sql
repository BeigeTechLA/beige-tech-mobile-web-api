CREATE TABLE IF NOT EXISTS sales_record_reassignment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  record_type ENUM('lead', 'quote') NOT NULL,
  record_id VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NULL,
  from_user_id INT NOT NULL,
  to_user_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sales_reassignment_from_created (from_user_id, created_at),
  KEY idx_sales_reassignment_to_created (to_user_id, created_at),
  CONSTRAINT fk_sales_reassignment_from_user FOREIGN KEY (from_user_id) REFERENCES users(id),
  CONSTRAINT fk_sales_reassignment_to_user FOREIGN KEY (to_user_id) REFERENCES users(id),
  CONSTRAINT fk_sales_reassignment_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
