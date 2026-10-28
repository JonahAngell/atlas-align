UPDATE atlas_audits
SET
  current_revision_id = $2,
  current_revision_number = $3,
  workflow_status = 'Published',
  current_publication_id = $4,
  published_locked = TRUE,
  working_from_publication_id = NULL,
  current_approval_request_id = $5,
  current_approval_id = $6
WHERE
  id = $1
