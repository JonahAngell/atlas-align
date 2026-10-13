UPDATE atlas_audit_publications
SET
  deletion_status = 'Recently Deleted',
  deleted_at = current_timestamp,
  deleted_by_user_id = $3,
  deleted_by_username = $4,
  deletion_reason = $5
WHERE
  audit_id = $1
  AND id = $2
