INSERT INTO
  atlas_audit_activity_events (
    audit_id,
    event_type,
    actor_user_id,
    actor_username,
    approval_request_id,
    source_revision_id,
    metadata
  )
VALUES
  (
    $1,
    'approval.review_returned',
    $2,
    $3,
    $4,
    $5,
    $6::jsonb
  )
