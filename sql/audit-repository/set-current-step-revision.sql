UPDATE atlas_audit_steps
SET
  current_step_revision_id = $3
WHERE
  audit_id = $1
  AND step_id = $2
