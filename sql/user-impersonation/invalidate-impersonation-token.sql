UPDATE atlas_user_impersonation_sessions
SET
  invalidated_at = current_timestamp,
  invalidation_reason = $2
WHERE
  token_sha256 = $1
  AND invalidated_at IS NULL
