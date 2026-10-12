CREATE TABLE IF NOT EXISTS quote_pipeline_alert_logs (
  quote_pipeline_alert_log_id INT NOT NULL AUTO_INCREMENT,
  alert_type VARCHAR(80) NOT NULL,
  recipient_key VARCHAR(255) NOT NULL,
  last_sent_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (quote_pipeline_alert_log_id),
  UNIQUE KEY uq_quote_pipeline_alert_logs_recipient (alert_type, recipient_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
