UPDATE atlas_audits
SET
  workflow_status = 'Published',
  current_publication_id = $2,
  published_locked = TRUE,
  working_from_publication_id = NULL
WHERE
  id = $1
