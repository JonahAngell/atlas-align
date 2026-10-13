SELECT
  id,
  audit_revision_id,
  step_revision_number,
  step_document,
  step_sha256
FROM
  atlas_audit_step_revisions
WHERE
  audit_id = $1
  AND step_id = $2
  AND id = $3
