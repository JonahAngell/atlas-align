INSERT INTO
  atlas_audit_deletion_events (
    audit_id,
    audit_name,
    deleted_by_user_id,
    deleted_by_username,
    deleted_by_full_name,
    current_revision_id,
    current_revision_number,
    event_type
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7, 'permanent_delete')
