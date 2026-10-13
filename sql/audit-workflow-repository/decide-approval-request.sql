UPDATE atlas_audit_approval_requests
SET
  request_status = $3,
  reviewer_response = $4,
  decision_actor_user_id = $5,
  decision_actor_username = $6,
  decision_at = current_timestamp,
  updated_at = current_timestamp
WHERE
  id = $1
  AND audit_id = $2
