SELECT
  r.document
FROM
  atlas_audit_review_sessions prior
  JOIN atlas_audit_revisions r ON r.id = prior.submitted_revision_id
  AND r.audit_id = prior.audit_id
WHERE
  prior.audit_id = $1
  AND prior.session_status = 'Returned'
  AND prior.submitted_revision_id <> $2
ORDER BY
  prior.completed_at DESC,
  prior.id DESC
LIMIT
  1
