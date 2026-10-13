UPDATE atlas_audits
SET
  workflow_status = 'Draft',
  current_approval_request_id = NULL,
  current_approval_id = NULL
WHERE
  id = $1
