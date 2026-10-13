-- migrate:up
CREATE TABLE IF NOT EXISTS atlas_user_profiles (
  user_id text PRIMARY KEY,
  username text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  disabled boolean NOT NULL DEFAULT false,
  has_logged_in boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT current_timestamp,
  last_seen_at timestamptz NOT NULL DEFAULT current_timestamp,
  last_resolved_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS atlas_user_profiles_username_key
  ON atlas_user_profiles (lower(username));
CREATE INDEX IF NOT EXISTS atlas_user_profiles_name_idx
  ON atlas_user_profiles (lower(full_name));
CREATE INDEX IF NOT EXISTS atlas_user_profiles_recent_idx
  ON atlas_user_profiles (has_logged_in DESC, last_seen_at DESC);

-- migrate:down
DROP TABLE IF EXISTS atlas_user_profiles;
