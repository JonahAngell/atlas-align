UPDATE atlas_audits
SET
  workflow_status = 'Pending Approval',
  current_approval_request_id = $2,
  current_approval_id = NULL
WHERE
  id = $1
