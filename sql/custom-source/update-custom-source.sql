UPDATE atlas_custom_sources
SET
  source_name = $2,
  source_system = $3,
  updated_at = current_timestamp
WHERE
  id = $1
