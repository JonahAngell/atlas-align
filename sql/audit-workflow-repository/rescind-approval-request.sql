UPDATE atlas_audit_approval_requests
SET
  request_status = 'Rescinded',
  rescinded_by_user_id = $3,
  rescinded_by_username = $4,
  rescinded_at = current_timestamp,
  rescission_reason = $5,
  updated_at = current_timestamp
WHERE
  id = $1
  AND audit_id = $2
