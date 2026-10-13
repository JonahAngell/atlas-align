INSERT INTO
  atlas_audit_discussion_messages (
    thread_id,
    audit_id,
    body,
    actor_context,
    actor_user_id,
    actor_username,
    authenticated_actor_user_id,
    authenticated_actor_username
  )
VALUES
  ($1, $2, $3, 'Reviewer', $4, $5, $6, $7)
