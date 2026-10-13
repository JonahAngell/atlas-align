UPDATE atlas_audit_steps
SET
  deleted_at = current_timestamp,
  current_step_revision_id = NULL
WHERE
  audit_id = $1
  AND step_id = $2
