SELECT
  *
FROM
  atlas_audit_revisions
WHERE
  id = $1
  AND audit_id = $2
FOR SHARE
