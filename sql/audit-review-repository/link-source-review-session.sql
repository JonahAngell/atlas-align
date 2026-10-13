UPDATE atlas_audit_review_sessions
SET
  source_review_session_id = $2,
  updated_at = now()
WHERE
  id = $1
