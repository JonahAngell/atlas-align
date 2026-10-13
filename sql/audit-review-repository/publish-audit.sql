WITH
  updated_revision AS (
    UPDATE atlas_audit_revisions
    SET
      document = $5::jsonb,
      document_sha256 = $6
    WHERE
      id = $4
      AND audit_id = $1
    RETURNING
      id
  )
UPDATE atlas_audits
SET
  workflow_status = 'Published',
  current_approval_id = $2,
  current_publication_id = $3,
  published_locked = TRUE,
  working_from_publication_id = NULL
WHERE
  id = $1
  AND EXISTS (
    SELECT
      1
    FROM
      updated_revision
  )
