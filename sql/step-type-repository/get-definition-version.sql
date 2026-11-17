SELECT
  id,
  type_id,
  version,
  content_hash,
  status,
  origin
FROM
  atlas_step_type_definitions
WHERE
  type_id = $1
  AND version = $2
