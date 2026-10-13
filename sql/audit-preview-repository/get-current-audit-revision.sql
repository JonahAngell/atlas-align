SELECT
  a.id,
  a.current_revision_id,
  r.document,
  r.document_sha256
FROM
  atlas_audits a
  JOIN atlas_audit_revisions r ON r.id = a.current_revision_id
WHERE
  a.id = $1
  AND a.archived_at IS NULL
