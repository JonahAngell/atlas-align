UPDATE atlas_audit_review_sessions
SET
  session_status = 'Approved',
  final_outcome = 'Approved',
  completed_at = current_timestamp,
  updated_at = current_timestamp
WHERE
  id = $1
