UPDATE atlas_audits
SET
  archived_at = NULL,
  archived_by_username = NULL,
  updated_at = now(),
  updated_by_user_id = $2,
  updated_by_username = $3,
  updated_by_full_name = $4,
  updated_by_email = $5
WHERE
  id = $1
