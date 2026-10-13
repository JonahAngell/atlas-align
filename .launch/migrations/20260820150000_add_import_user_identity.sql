-- migrate:up
ALTER TABLE atlas_field_library_imports
  ADD COLUMN IF NOT EXISTS imported_by_user_id text,
  ADD COLUMN IF NOT EXISTS imported_by_username text,
  ADD COLUMN IF NOT EXISTS imported_by_full_name text,
  ADD COLUMN IF NOT EXISTS imported_by_email text;

-- migrate:down
ALTER TABLE atlas_field_library_imports
  DROP COLUMN IF EXISTS imported_by_email,
  DROP COLUMN IF EXISTS imported_by_full_name,
  DROP COLUMN IF EXISTS imported_by_username,
  DROP COLUMN IF EXISTS imported_by_user_id;
