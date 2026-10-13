UPDATE atlas_audit_approvals
SET
  approval_status = 'Invalidated',
  invalidated_at = current_timestamp,
  invalidated_by_user_id = $3,
  invalidated_by_username = $4,
  invalidation_reason = $5
WHERE
  id = $1
  AND audit_id = $2
  AND approval_status = 'Active'
RETURNING
  *
