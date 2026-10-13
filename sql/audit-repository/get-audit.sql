SELECT
  a.*,
  r.document,
  r.created_at AS revision_created_at,
  r.created_by_username AS revision_created_by_username
FROM
  atlas_audits a
  JOIN atlas_audit_revisions r ON r.id = a.current_revision_id
WHERE
  a.id = $1
  AND a.archived_at IS NULL
