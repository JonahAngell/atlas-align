DELETE FROM atlas_audit_step_revisions
WHERE
  audit_id = $1
