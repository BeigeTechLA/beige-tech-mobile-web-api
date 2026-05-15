CREATE TABLE IF NOT EXISTS sales_quote_preview_links (
  sales_quote_preview_link_id INT AUTO_INCREMENT PRIMARY KEY,
  sales_quote_id INT NOT NULL,
  quote_key VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by_user_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_quote_preview_links_quote_key (quote_key),
  KEY idx_sales_quote_preview_links_quote_id (sales_quote_id),
  KEY idx_sales_quote_preview_links_expires_at (expires_at),
  CONSTRAINT fk_sales_quote_preview_links_quote
    FOREIGN KEY (sales_quote_id) REFERENCES sales_quotes(sales_quote_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_sales_quote_preview_links_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);
