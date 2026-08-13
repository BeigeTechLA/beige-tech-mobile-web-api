-- Allow file manager workspace dashboard access to be invited by email.
-- Registered clients continue to resolve through client_user_id; unregistered
-- recipients resolve through shared_email once they sign up with that address.

ALTER TABLE file_manager_workspace_access
  MODIFY COLUMN client_user_id BIGINT UNSIGNED DEFAULT NULL;

ALTER TABLE file_manager_workspace_access
  ADD COLUMN IF NOT EXISTS shared_email VARCHAR(255) DEFAULT NULL AFTER client_user_id;

ALTER TABLE file_manager_workspace_access
  ADD UNIQUE KEY uq_workspace_email_access (external_id, shared_email);

ALTER TABLE file_manager_workspace_access
  ADD KEY idx_workspace_access_shared_email (shared_email);
