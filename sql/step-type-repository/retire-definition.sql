-- Retires one published version: ATLAS keeps rendering it for publications
-- pinned to it, but it is no longer the latest, so it leaves the picker. Only
-- status and updated_* change, which the immutability trigger allows. A
-- version that is not published updates nothing and returns no row.
UPDATE atlas_step_type_definitions
SET
  status = 'retired',
  updated_by_user_id = $3,
  updated_by_username = $4,
  updated_by_full_name = $5,
  updated_at = current_timestamp
WHERE
  type_id = $1
  AND version = $2
  AND status = 'published'
RETURNING
  id,
  type_id,
  version,
  content_hash,
  status
