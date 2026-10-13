SELECT
  id,
  revision_number AS "number",
  document,
  document_sha256 AS sha256,
  change_type AS "changeType",
  change_summary AS "changeSummary",
  created_by_username AS "createdByUsername",
  created_at AS "createdAt"
FROM
  atlas_audit_revisions
WHERE
  audit_id = $1
  AND id = $2
