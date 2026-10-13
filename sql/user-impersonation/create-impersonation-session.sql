INSERT INTO
  atlas_user_impersonation_sessions (
    token_sha256,
    authenticated_user_id,
    effective_profile_id,
    expires_at
  )
VALUES
  ($1, $2, $3, $4)
RETURNING
  id
