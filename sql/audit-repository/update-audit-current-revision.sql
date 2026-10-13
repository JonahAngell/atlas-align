UPDATE atlas_audits
SET
  name = $2,
  purpose = $3,
  description = $4,
  schema_version = $5,
  source_kind = $6,
  current_revision_id = $7,
  current_revision_number = $8,
  updated_by_user_id = $9,
  updated_by_username = $10,
  updated_at = current_timestamp
WHERE
  id = $1
