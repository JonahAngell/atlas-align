UPDATE atlas_audit_steps
SET
  current_step_revision_id = NULL
WHERE
  audit_id = $1
