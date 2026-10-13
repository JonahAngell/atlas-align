SELECT
  id,
  audit_revision_id AS "auditRevisionId",
  step_revision_number AS "number",
  operation,
  step_document AS "stepDocument",
  step_sha256 AS sha256,
  created_by_username AS "createdByUsername",
  created_at AS "createdAt"
FROM
  atlas_audit_step_revisions
WHERE
  audit_id = $1
  AND step_id = $2
  AND id = $3
