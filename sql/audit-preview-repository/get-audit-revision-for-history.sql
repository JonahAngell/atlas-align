SELECT
  id,
  document,
  document_sha256
FROM
  atlas_audit_revisions
WHERE
  audit_id = $1
  AND id = $2
