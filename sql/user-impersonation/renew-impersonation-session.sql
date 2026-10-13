UPDATE atlas_user_impersonation_sessions s
SET
  expires_at = $3,
  renewed_at = current_timestamp
FROM
  atlas_user_profiles p
WHERE
  s.token_sha256 = $1
  AND s.authenticated_user_id = $2
  AND s.effective_profile_id = p.user_id
  AND s.invalidated_at IS NULL
  AND s.expires_at > current_timestamp
RETURNING
  s.id,
  s.effective_profile_id AS "effectiveProfileId"
