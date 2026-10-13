WITH
  updated_revision AS (
    UPDATE atlas_audit_revisions
    SET
      document = $8::jsonb,
      document_sha256 = $9
    WHERE
      id = $6
      AND audit_id = $1
    RETURNING
      id
  )
INSERT INTO
  atlas_audit_approval_requests (
    audit_id,
    requester_user_id,
    requester_username,
    selected_approver_user_id,
    selected_approver_username,
    submitted_revision_id,
    requester_message
  )
SELECT
  $1,
  $2,
  $3,
  $4,
  $5,
  updated_revision.id,
  $7
FROM
  updated_revision
RETURNING
  *
