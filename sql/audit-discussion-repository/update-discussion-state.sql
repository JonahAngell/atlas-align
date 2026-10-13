UPDATE atlas_audit_discussion_threads
SET
  current_state = $2,
  state_version = state_version + 1,
  updated_at = current_timestamp
WHERE
  id = $1
  AND state_version = $3
RETURNING
  state_version
