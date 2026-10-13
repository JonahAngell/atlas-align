INSERT INTO
  atlas_audit_steps (
    audit_id,
    step_id,
    parent_step_id,
    branch_type,
    sort_order,
    step_type,
    enabled,
    auto_generated_reference,
    locked,
    deleted_at
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
ON CONFLICT (audit_id, step_id) DO UPDATE
SET
  parent_step_id = EXCLUDED.parent_step_id,
  branch_type = EXCLUDED.branch_type,
  sort_order = EXCLUDED.sort_order,
  step_type = EXCLUDED.step_type,
  enabled = EXCLUDED.enabled,
  auto_generated_reference = EXCLUDED.auto_generated_reference,
  locked = EXCLUDED.locked,
  deleted_at = NULL
