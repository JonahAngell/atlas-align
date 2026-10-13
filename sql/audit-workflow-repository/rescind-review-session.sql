UPDATE atlas_audit_review_sessions
SET
  session_status = 'Rescinded',
  final_outcome = 'Rescinded',
  completed_at = current_timestamp,
  updated_at = current_timestamp
WHERE
  id = $1
