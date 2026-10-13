UPDATE atlas_audit_review_items
SET
  decision = 'Approve',
  reviewer_note = NULL,
  decided_at = now(),
  carried_forward = TRUE,
  source_review_item_id = $4,
  updated_at = now()
WHERE
  review_session_id = $1
  AND section_key = $2
  AND stable_item_key = $3
  AND decision IS NULL
