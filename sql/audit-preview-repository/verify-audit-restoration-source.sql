SELECT
  document_sha256 hash
FROM
  atlas_audit_revisions
WHERE
  audit_id = $1
  AND id = $2
