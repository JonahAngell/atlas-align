SELECT
  s.id AS "sessionId",
  s.effective_profile_id AS "effectiveProfileId",
  s.expires_at AS "expiresAt",
  p.user_id AS id,
  p.username,
  p.full_name AS "fullName",
  p.avatar_url AS avatar,
  p.email,
  p.role_slugs AS "roleSlugs",
  p.role_resolution_status AS "roleResolutionStatus",
  p.last_role_resolved_at AS "lastRoleResolvedAt",
  p.disabled
FROM
  atlas_user_impersonation_sessions s
  JOIN atlas_user_profiles p ON p.user_id = s.effective_profile_id
WHERE
  s.token_sha256 = $1
  AND s.authenticated_user_id = $2
  AND s.invalidated_at IS NULL
  AND s.expires_at > current_timestamp
