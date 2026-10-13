UPDATE atlas_audits
SET
  workflow_status = 'Draft',
  current_approval_request_id = NULL,
  current_approval_id = NULL,
  published_locked = FALSE,
  working_from_publication_id = CASE
    WHEN $2 THEN NULL
    ELSE working_from_publication_id
  END
WHERE
  id = $1
