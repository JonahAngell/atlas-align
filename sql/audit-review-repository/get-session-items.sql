SELECT
  i.id,
  i.section_key AS "sectionKey",
  i.item_type AS "itemType",
  i.stable_item_key AS "stableItemKey",
  i.canonical_object_key AS "canonicalObjectKey",
  i.identity_version AS "identityVersion",
  i.display_label AS "displayLabel",
  i.semantic_fingerprint AS "semanticFingerprint",
  i.canonical_order AS "canonicalOrder",
  i.parent_item_key AS "parentItemKey",
  i.linked_item_key AS "linkedItemKey",
  i.is_direct AS "isDirect",
  i.severity,
  i.is_deleted AS "isDeleted",
  i.change_type AS "changeType",
  i.change_reason_codes AS "changeReasonCodes",
  i.change_summary AS "changeSummary",
  i.prior_object_summary AS "priorObjectSummary",
  i.submitted_object_summary AS "submittedObjectSummary",
  i.decision,
  i.reviewer_note AS "reviewerNote",
  t.current_state AS "discussionState",
  CASE
    WHEN t.id IS NULL THEN NULL
    ELSE dm.message_count
  END AS "discussionMessageCount"
FROM
  atlas_audit_review_items i
  LEFT JOIN atlas_audit_review_item_objects io ON io.review_item_id = i.id
  LEFT JOIN atlas_audit_discussion_threads t ON t.review_object_id = io.review_object_id
  AND t.audit_id = io.audit_id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS message_count
    FROM
      atlas_audit_discussion_messages m
    WHERE
      m.thread_id = t.id
  ) dm ON TRUE
WHERE
  i.review_session_id = $1
ORDER BY
  i.section_key,
  i.canonical_order,
  i.id
