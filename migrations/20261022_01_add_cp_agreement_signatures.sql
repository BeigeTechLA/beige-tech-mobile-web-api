ALTER TABLE agreement_responses
  ADD COLUMN signature_data_url LONGTEXT NULL AFTER signer_name,
  ADD COLUMN signature_sha256 CHAR(64) NULL AFTER signature_data_url;
