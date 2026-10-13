SELECT
  document_sha256
FROM
  atlas_audit_revisions
WHERE
  id = $1
