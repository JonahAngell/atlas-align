-- migrate:up

ALTER TABLE atlas_user_profiles
  ADD COLUMN last_role_resolved_at timestamptz,
  ADD COLUMN role_resolution_status text;

ALTER TABLE atlas_user_profiles
  ADD CONSTRAINT atlas_user_profiles_role_resolution_status_check
  CHECK (
    role_resolution_status IS NULL OR
    role_resolution_status IN ('resolved', 'resolved_empty', 'unavailable', 'forbidden', 'not_found')
  );

CREATE INDEX atlas_user_profiles_role_resolution_refresh_idx
  ON atlas_user_profiles (last_role_resolved_at)
  WHERE role_resolution_status IS NULL
     OR role_resolution_status NOT IN ('resolved', 'resolved_empty');

-- migrate:down

DROP INDEX IF EXISTS atlas_user_profiles_role_resolution_refresh_idx;

ALTER TABLE atlas_user_profiles
  DROP CONSTRAINT IF EXISTS atlas_user_profiles_role_resolution_status_check,
  DROP COLUMN IF EXISTS role_resolution_status,
  DROP COLUMN IF EXISTS last_role_resolved_at;
