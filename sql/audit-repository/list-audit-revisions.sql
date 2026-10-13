SELECT
  id,
  revision_number AS "number",
  change_type AS "changeType",
  change_summary AS "changeSummary",
  created_by_username AS "createdByUsername",
  created_by_full_name AS "createdByFullName",
  created_at AS "createdAt",
  restored_from_revision_id AS "restoredFromRevisionId"
FROM
  atlas_audit_revisions
WHERE
  audit_id = $1
ORDER BY
  revision_number DESC
