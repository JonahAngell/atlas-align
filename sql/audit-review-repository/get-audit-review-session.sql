SELECT
  s.*,
  r.document
FROM
  atlas_audit_review_sessions s
  JOIN atlas_audit_revisions r ON r.id = s.submitted_revision_id
WHERE
  s.id = $1
  AND lower(s.reviewer_username) = lower($2)
