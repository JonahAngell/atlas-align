SELECT
  id,
  source_key,
  source_name,
  source_system,
  created_by_user_id,
  created_by_username,
  created_by_full_name
FROM
  atlas_custom_sources
WHERE
  source_key = $1
FOR UPDATE
