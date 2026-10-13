SELECT
  id,
  event_type AS "eventType",
  actor_username AS "actorUsername",
  event_at AS "eventAt",
  source_revision_id AS "sourceRevisionId",
  resulting_revision_id AS "resultingRevisionId",
  approval_request_id AS "approvalRequestId",
  approval_id AS "approvalId",
  publication_id AS "publicationId",
  publication_version AS "publicationVersion",
  reason,
  summary,
  metadata
FROM
  atlas_audit_activity_events
WHERE
  audit_id = $1
  AND (
    $2::bigint IS NULL
    OR id < $2
  )
ORDER BY
  id DESC
LIMIT
  $3
