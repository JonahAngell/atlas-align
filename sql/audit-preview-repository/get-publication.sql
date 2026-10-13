SELECT
  p.*,
  ar.document approved_document,
  ar.document_sha256 approved_sha256
FROM
  atlas_audit_publications p
  JOIN atlas_audit_revisions ar ON ar.id = p.approved_revision_id
  AND ar.audit_id = p.audit_id
WHERE
  p.audit_id = $1
  AND p.version_number = $2
