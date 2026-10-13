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
  a.archived_at AS "archivedAt",
  a.archived_by_username AS "archivedByUsername"
FROM
  atlas_audits a
WHERE
  a.archived_at IS NOT NULL
ORDER BY
  a.archived_at DESC,
  lower(a.name),
  a.id
