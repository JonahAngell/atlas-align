SELECT
  *
FROM
  atlas_audit_publications
WHERE
  audit_id = $1
  AND version_number = $2
FOR UPDATE
