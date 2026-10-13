UPDATE atlas_audits
SET
  workflow_status = 'Approved',
  current_approval_id = $2
WHERE
  id = $1
