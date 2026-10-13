UPDATE atlas_audit_approval_requests
SET
  request_status = 'Approved',
  reviewer_response = NULL,
  decision_actor_user_id = $3,
  decision_actor_username = $4,
  decision_at = current_timestamp,
  updated_at = current_timestamp
WHERE
  id = $1
  AND audit_id = $2
