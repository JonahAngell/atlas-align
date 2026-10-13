INSERT INTO
  atlas_audits (
    id,
    name,
    purpose,
    description,
    schema_version,
    source_kind,
    owner_user_id,
    owner_username,
    created_by_user_id,
    created_by_username,
    updated_by_user_id,
    updated_by_username
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $7, $8, $7, $8)
