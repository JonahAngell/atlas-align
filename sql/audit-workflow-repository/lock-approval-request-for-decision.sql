SELECT
  *
FROM
  atlas_audit_approval_requests
WHERE
  id = $1
  AND audit_id = $2
FOR UPDATE
