UPDATE atlas_audits
SET
  archived_at = current_timestamp,
  archived_by_username = $3
WHERE
  id = $1
  AND current_revision_id = $2
  AND archived_at IS NULL
RETURNING
  id
