SELECT
  a.id,
  a.name,
  a.purpose,
  a.description,
  a.schema_version AS "schemaVersion",
  a.source_kind AS "sourceKind",
  a.current_revision_id AS "currentRevisionId",
  a.current_revision_number AS "currentRevisionNumber",
  a.owner_username AS "ownerUsername",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt",
  a.updated_by_username AS "updatedByUsername",
  r.document -> 'assignments' AS assignments,
  COALESCE(NULLIF(r.document ->> 'status', ''), 'Draft') AS status
FROM
  atlas_audits a
  JOIN atlas_audit_revisions r ON r.id = a.current_revision_id
WHERE
  a.archived_at IS NULL
ORDER BY
  lower(a.name),
  a.id
