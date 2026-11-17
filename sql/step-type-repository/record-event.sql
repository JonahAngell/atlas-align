INSERT INTO
  atlas_step_type_events (
    definition_id,
    type_id,
    version,
    event,
    details,
    actor_user_id,
    actor_username,
    actor_full_name
  )
VALUES
  ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
