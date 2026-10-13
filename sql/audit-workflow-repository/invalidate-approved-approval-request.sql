UPDATE atlas_audit_approval_requests
SET
  request_status = 'Invalidated',
  invalidated_by_user_id = $3,
  invalidated_by_username = $4,
  invalidated_at = current_timestamp,
  invalidation_reason = $5,
  updated_at = current_timestamp
WHERE
  id = $1
  AND audit_id = $2
  AND request_status = 'Approved'
