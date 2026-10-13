INSERT INTO
  atlas_audit_review_sessions (
    audit_id,
    approval_request_id,
    submitted_revision_id,
    reviewer_user_id,
    reviewer_username
  )
VALUES
  ($1, $2, $3, $4, $5)
ON CONFLICT (
  approval_request_id,
  submitted_revision_id,
  reviewer_username
) DO UPDATE
SET
  updated_at = atlas_audit_review_sessions.updated_at
RETURNING
  *
