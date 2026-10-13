INSERT INTO
  atlas_inbox_items (
    recipient_user_id,
    recipient_username,
    audit_id,
    approval_request_id,
    item_type,
    item_status,
    display_metadata
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7::jsonb)
