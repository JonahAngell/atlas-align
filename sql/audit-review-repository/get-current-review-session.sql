SELECT
  *
FROM
  atlas_audit_review_sessions
WHERE
  approval_request_id = $1
  AND submitted_revision_id = $2
ORDER BY
  id DESC
LIMIT
  1
