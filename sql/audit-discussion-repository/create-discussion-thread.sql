INSERT INTO
  atlas_audit_discussion_threads (
    audit_id,
    review_object_id,
    created_by_user_id,
    created_by_username,
    created_by_authenticated_user_id,
    created_by_authenticated_username
  )
VALUES
  ($1, $2, $3, $4, $5, $6)
ON CONFLICT (review_object_id) DO NOTHING
RETURNING
  id,
  current_state,
  state_version
