SELECT
  *
FROM
  atlas_audit_approvals
WHERE
  id = $1
  AND audit_id = $2
FOR UPDATE
