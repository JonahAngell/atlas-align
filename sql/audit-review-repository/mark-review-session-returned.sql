UPDATE atlas_audit_review_sessions
SET
  session_status = 'Returned',
  final_outcome = 'Returned',
  completed_at = now(),
  returned_analyst_user_id = $2,
  returned_analyst_username = $3,
  updated_at = now()
WHERE
  id = $1
