SELECT
  *
FROM
  atlas_audit_review_sessions
WHERE
  id = $1::bigint
  AND lower(reviewer_username) = lower($2::text)
FOR UPDATE
