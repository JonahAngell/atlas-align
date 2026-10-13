INSERT INTO
  atlas_audit_step_revisions (
    audit_id,
    step_id,
    audit_revision_id,
    step_revision_number,
    operation,
    step_document,
    step_sha256,
    change_summary,
    created_by_user_id,
    created_by_username,
    created_by_full_name
  )
VALUES
  (
    $1,
    $2,
    $3,
    $4,
    'delete',
    $5::jsonb,
    $6,
    $7,
    $8,
    $9,
    $10
  )
