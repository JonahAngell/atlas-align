SELECT
  id
FROM
  atlas_audit_review_sessions
WHERE
  audit_id = $1
  AND approval_request_id = $2
  AND session_status = 'Draft'
FOR UPDATE
