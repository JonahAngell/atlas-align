SELECT
  id,
  audit_revision_id AS "auditRevisionId",
  step_revision_number AS "number",
  operation,
  change_summary AS "changeSummary",
  created_by_username AS "createdByUsername",
  created_by_full_name AS "createdByFullName",
  created_at AS "createdAt"
FROM
  atlas_audit_step_revisions
WHERE
  audit_id = $1
  AND step_id = $2
ORDER BY
  step_revision_number DESC
