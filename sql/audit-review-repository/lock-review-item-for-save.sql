SELECT
  severity,
  is_direct
FROM
  atlas_audit_review_items
WHERE
  review_session_id = $1::bigint
  AND section_key = $2::text
  AND stable_item_key = $3::text
FOR UPDATE
