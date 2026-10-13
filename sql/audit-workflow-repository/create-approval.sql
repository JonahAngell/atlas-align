INSERT INTO
  atlas_audit_approvals (
    audit_id,
    approved_revision_id,
    approval_request_id,
    approving_user_id,
    approving_username,
    reviewer_comments
  )
VALUES
  ($1, $2, $3, $4, $5, $6)
RETURNING
  *
