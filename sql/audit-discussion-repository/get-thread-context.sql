SELECT
  t.id AS thread_id,
  t.audit_id,
  t.current_state,
  t.state_version,
  o.id AS review_object_id,
  EXISTS (
    SELECT
      1
    FROM
      atlas_audit_review_item_objects io
      JOIN atlas_audit_review_items i ON i.id = io.review_item_id
      JOIN atlas_audit_review_sessions s ON s.id = i.review_session_id
    WHERE
      io.review_object_id = o.id
      AND io.audit_id = o.audit_id
      AND s.session_status IN ('Draft', 'Returned')
      AND (
        lower(s.reviewer_username) = lower($2)
        OR s.reviewer_user_id = $3
      )
  ) AS current_reviewer,
  (
    EXISTS (
      SELECT
        1
      FROM
        atlas_audit_review_item_objects io
        JOIN atlas_audit_review_items i ON i.id = io.review_item_id
        JOIN atlas_audit_review_sessions s ON s.id = i.review_session_id
      WHERE
        io.review_object_id = o.id
        AND io.audit_id = o.audit_id
        AND s.session_status = 'Returned'
    )
    AND EXISTS (
      SELECT
        1
      FROM
        atlas_audits a
        JOIN atlas_audit_revisions r ON r.id = a.current_revision_id
        AND r.audit_id = a.id,
        LATERAL jsonb_array_elements(
          COALESCE(
            r.document -> 'assignments' -> 'assigned',
            '[]'::jsonb
          )
        ) assigned
      WHERE
        a.id = o.audit_id
        AND (
          lower(
            COALESCE(
              assigned ->> 'username',
              assigned ->> 'email',
              assigned ->> 'login',
              ''
            )
          ) = lower($2)
          OR (
            NULLIF($3, '') IS NOT NULL
            AND COALESCE(assigned ->> 'id', assigned ->> 'userId', '') = $3
          )
        )
    )
  ) AS current_analyst,
  EXISTS (
    SELECT
      1
    FROM
      atlas_audit_review_item_objects io
      JOIN atlas_audit_review_items i ON i.id = io.review_item_id
      JOIN atlas_audit_review_sessions s ON s.id = i.review_session_id
    WHERE
      io.review_object_id = o.id
      AND io.audit_id = o.audit_id
      AND s.session_status = 'Approved'
  ) AS approved
FROM
  atlas_audit_discussion_threads t
  JOIN atlas_audit_review_objects o ON o.id = t.review_object_id
  AND o.audit_id = t.audit_id
WHERE
  t.id = $1
