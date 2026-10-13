UPDATE atlas_audits
SET
  current_revision_id = $2,
  current_revision_number = $3,
  workflow_status = 'Draft Revision',
  published_locked = FALSE,
  working_from_publication_id = current_publication_id,
  current_approval_request_id = NULL,
  current_approval_id = NULL,
  revision_cycle_number = revision_cycle_number + 1
WHERE
  id = $1
