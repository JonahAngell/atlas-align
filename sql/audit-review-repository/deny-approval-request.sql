UPDATE atlas_audit_approval_requests
SET
  request_status = 'Denied',
  reviewer_response = 'Returned through item-level review',
  decision_actor_user_id = $2,
  decision_actor_username = $3,
  decision_at = now(),
  updated_at = now()
WHERE
  id = $1
  AND request_status = 'Pending'
RETURNING
  id
