SELECT
  p.id,
  p.audit_id AS "auditId",
  a.name AS "auditName",
  p.version_number AS "versionNumber",
  p.version_title AS "versionTitle",
  p.description,
  p.change_summary AS "changeSummary",
  p.publisher_username AS "publisherUsername",
  p.published_at AS "publishedAt",
  p.deletion_status AS "deletionStatus",
  p.deleted_at AS "deletedAt",
  p.deleted_by_username AS "deletedByUsername",
  p.deletion_reason AS "deletionReason"
FROM
  atlas_audit_publications p
  JOIN atlas_audits a ON a.id = p.audit_id
WHERE
  p.audit_id = $1
  AND p.deletion_status = $2
ORDER BY
  p.version_number DESC
LIMIT
  $3
