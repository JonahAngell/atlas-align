SELECT
  t.id AS "threadId",
  t.current_state AS "threadState",
  t.state_version AS "stateVersion",
  i.id AS "reviewItemId",
  i.section_key AS "sectionKey",
  i.stable_item_key AS "stableItemKey",
  i.canonical_object_key AS "canonicalObjectKey",
  i.display_label AS "displayLabel",
  i.is_deleted AS "isDeleted"
FROM
  atlas_audit_review_items i
  JOIN atlas_audit_review_item_objects io ON io.review_item_id = i.id
  JOIN atlas_audit_discussion_threads t ON t.review_object_id = io.review_object_id
  AND t.audit_id = (
    SELECT
      audit_id
    FROM
      atlas_audit_review_sessions
    WHERE
      id = $1
  )
WHERE
  i.review_session_id = $1
  AND i.is_direct = TRUE
ORDER BY
  i.section_key,
  i.canonical_order,
  i.id
FOR UPDATE OF
  t
