SELECT
  s.id AS session_id,
  s.audit_id,
  s.session_status,
  s.reviewer_user_id,
  s.reviewer_username,
  s.returned_analyst_user_id,
  s.returned_analyst_username,
  i.id AS review_item_id,
  i.canonical_object_key,
  i.identity_version,
  i.item_type,
  i.display_label,
  i.is_deleted,
  o.id AS review_object_id,
  t.id AS thread_id,
  t.current_state,
  t.state_version
FROM
  atlas_audit_review_sessions s
  JOIN atlas_audit_review_items i ON i.review_session_id = s.id
  LEFT JOIN atlas_audit_review_item_objects io ON io.review_item_id = i.id
  LEFT JOIN atlas_audit_review_objects o ON o.id = io.review_object_id
  AND o.audit_id = io.audit_id
  LEFT JOIN atlas_audit_discussion_threads t ON t.review_object_id = o.id
  AND t.audit_id = o.audit_id
WHERE
  s.id = $1
  AND i.id = $2
FOR UPDATE OF
  s,
  i
