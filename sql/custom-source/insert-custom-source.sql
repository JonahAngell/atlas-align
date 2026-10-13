INSERT INTO atlas_custom_sources (
  id,
  source_key,
  source_name,
  source_system,
  created_by_user_id,
  created_by_username,
  created_by_full_name
)
VALUES
  ($1, $2, $3, $4, $5, $6, $7)
RETURNING
  id
