UPDATE atlas_audits
SET
  workflow_status = 'Draft Revision',
  current_approval_request_id = NULL,
  current_approval_id = NULL,
  revision_cycle_number = revision_cycle_number + 1
WHERE
  id = $1
