-- Guest self-service payment links have no authenticated user to attribute.
-- Keep the existing foreign key: it remains enforced whenever a creator ID is present.
ALTER TABLE payment_links
  MODIFY COLUMN created_by_user_id INT NULL;
