INSERT INTO
  atlas_audit_discussion_transitions (
    thread_id,
    audit_id,
    from_state,
    to_state,
    actor_user_id,
    actor_username,
    authenticated_actor_user_id,
    authenticated_actor_username
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8)
