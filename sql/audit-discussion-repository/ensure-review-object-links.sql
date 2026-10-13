WITH
  candidates AS (
    SELECT
      i.id AS review_item_id,
      s.audit_id,
      i.canonical_object_key,
      i.identity_version,
      i.item_type,
      i.display_label,
      jsonb_strip_nulls(
        jsonb_build_object(
          'isDeleted',
          i.is_deleted,
          'changeType',
          i.change_type,
          'prior',
          i.prior_object_summary,
          'submitted',
          i.submitted_object_summary
        )
      ) AS metadata
    FROM
      atlas_audit_review_items i
      JOIN atlas_audit_review_sessions s ON s.id = i.review_session_id
    WHERE
      s.id = $1
      AND i.canonical_object_key IS NOT NULL
      AND i.identity_version IS NOT NULL
  ),
  objects AS (
    INSERT INTO
      atlas_audit_review_objects (
        audit_id,
        canonical_object_key,
        identity_version,
        item_type,
        display_label,
        object_metadata
      )
    SELECT DISTINCT
      audit_id,
      canonical_object_key,
      identity_version,
      item_type,
      display_label,
      metadata
    FROM
      candidates
    ON CONFLICT (audit_id, canonical_object_key, identity_version) DO UPDATE
    SET
      display_label = EXCLUDED.display_label,
      object_metadata = EXCLUDED.object_metadata
    RETURNING
      id,
      audit_id,
      canonical_object_key,
      identity_version
  )
INSERT INTO
  atlas_audit_review_item_objects (review_item_id, review_object_id, audit_id)
SELECT
  c.review_item_id,
  o.id,
  c.audit_id
FROM
  candidates c
  JOIN atlas_audit_review_objects o ON o.audit_id = c.audit_id
  AND o.canonical_object_key = c.canonical_object_key
  AND o.identity_version = c.identity_version
ON CONFLICT (review_item_id) DO NOTHING
RETURNING
  review_item_id
