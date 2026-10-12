-- Track the handover/return lifecycle on the existing request item history row.
-- NULL means the parent request has not been approved for issue yet.
ALTER TABLE `inventory_request_items`
  ADD COLUMN `fulfillment_status` ENUM('pending_issue','issued','returned') NULL AFTER `issued_at`;

UPDATE `inventory_request_items` ri
LEFT JOIN `inventory_requests` r ON r.id = ri.request_id
SET ri.fulfillment_status = CASE
  WHEN ri.returned_at IS NOT NULL THEN 'returned'
  WHEN ri.issued_at IS NOT NULL THEN 'issued'
  WHEN r.status = 'accepted' THEN 'pending_issue'
  ELSE NULL
END;
