SELECT
  *
FROM
  atlas_audit_review_sessions
WHERE
  audit_id = $1
  AND session_status = 'Returned'
  AND submitted_revision_id <> $2
ORDER BY
  completed_at DESC,
  id DESC
LIMIT
  1
