SELECT
  *
FROM
  atlas_audit_review_sessions
WHERE
  id = $1
FOR UPDATE
