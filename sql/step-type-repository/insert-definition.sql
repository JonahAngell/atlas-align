-- Adds one definition version. An existing (type_id, version) is never
-- overwritten: the insert does nothing and returns no row.
INSERT INTO
  atlas_step_type_definitions (
    type_id,
    version,
    schema_version,
    definition,
    content_hash,
    status,
    origin,
    created_by_user_id,
    created_by_username,
    created_by_full_name,
    updated_by_user_id,
    updated_by_username,
    updated_by_full_name
  )
VALUES
  ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $8, $9, $10)
ON CONFLICT (type_id, version) DO NOTHING
RETURNING
  id,
  type_id,
  version,
  content_hash,
  status
