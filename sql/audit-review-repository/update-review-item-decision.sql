UPDATE atlas_audit_review_items
SET
  decision = $4::text,
  reviewer_note = $5::text,
  decided_at = CASE
    WHEN $4::text IS NULL THEN NULL
    ELSE now()
  END,
  updated_at = now()
WHERE
  review_session_id = $1::bigint
  AND section_key = $2::text
  AND stable_item_key = $3::text
  AND is_direct = TRUE
RETURNING
  id
