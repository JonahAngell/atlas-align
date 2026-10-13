UPDATE atlas_inbox_items
SET
  item_status = 'Resolved',
  resolved_at = COALESCE(resolved_at, current_timestamp)
WHERE
  audit_id = $1
  AND approval_request_id = $2
  AND item_type = 'Approval Request'
  AND item_status = 'Actionable'
