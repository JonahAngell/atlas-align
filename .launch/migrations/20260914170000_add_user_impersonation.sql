-- migrate:up

ALTER TABLE atlas_user_profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role_slugs text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE atlas_audit_activity_events
  ADD COLUMN IF NOT EXISTS authenticated_actor_user_id text,
  ADD COLUMN IF NOT EXISTS authenticated_actor_username text;

CREATE TABLE IF NOT EXISTS atlas_user_impersonation_sessions (
  id bigserial PRIMARY KEY,
  token_sha256 char(64) NOT NULL UNIQUE,
  authenticated_user_id text NOT NULL,
  effective_profile_id text NOT NULL
    REFERENCES atlas_user_profiles(user_id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  expires_at timestamptz NOT NULL,
  renewed_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  CONSTRAINT atlas_user_impersonation_expiration_after_creation
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS atlas_user_impersonation_sessions_actor_idx
  ON atlas_user_impersonation_sessions (
    authenticated_user_id,
    expires_at DESC
  )
  WHERE invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS atlas_user_impersonation_sessions_expiration_idx
  ON atlas_user_impersonation_sessions (expires_at)
  WHERE invalidated_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS atlas_user_impersonation_sessions_expiration_idx;
DROP INDEX IF EXISTS atlas_user_impersonation_sessions_actor_idx;

DROP TABLE IF EXISTS atlas_user_impersonation_sessions;

ALTER TABLE atlas_audit_activity_events
  DROP COLUMN IF EXISTS authenticated_actor_username,
  DROP COLUMN IF EXISTS authenticated_actor_user_id;

ALTER TABLE atlas_user_profiles
  DROP COLUMN IF EXISTS role_slugs,
  DROP COLUMN IF EXISTS email;