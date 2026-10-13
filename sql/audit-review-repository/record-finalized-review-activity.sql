INSERT INTO
  atlas_audit_activity_events (
    audit_id,
    event_type,
    actor_user_id,
    actor_username,
    source_revision_id,
    approval_request_id,
    approval_id,
    publication_id,
    publication_version,
    summary,
    metadata
  )
VALUES
  (
    $1,
    'approval.review_finalized',
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10::jsonb
  )
