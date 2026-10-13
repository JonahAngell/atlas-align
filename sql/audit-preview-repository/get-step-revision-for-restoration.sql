SELECT
  id,
  step_id,
  step_document,
  step_sha256
FROM
  atlas_audit_step_revisions
WHERE
  audit_id = $1
  AND step_id = $2
  AND id = $3
