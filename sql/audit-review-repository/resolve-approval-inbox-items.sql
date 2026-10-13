UPDATE atlas_inbox_items
SET
  item_status = 'Resolved',
  resolved_at = COALESCE(resolved_at, now())
WHERE
  audit_id = $1
  AND approval_request_id = $2
  AND item_status = 'Actionable'
