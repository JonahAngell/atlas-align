-- migrate:up

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS
    atlas_audit_review_sessions_session_status_check;

ALTER TABLE atlas_audit_review_sessions
  ADD COLUMN final_outcome TEXT,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN returned_analyst_user_id TEXT,
  ADD COLUMN returned_analyst_username TEXT,
  ADD COLUMN source_review_session_id BIGINT
    REFERENCES atlas_audit_review_sessions(id) ON DELETE SET NULL;

ALTER TABLE atlas_audit_review_sessions
  ADD CONSTRAINT atlas_audit_review_sessions_status_v2
    CHECK (session_status IN ('Draft', 'Returned')),
  ADD CONSTRAINT atlas_audit_review_sessions_outcome_v2
    CHECK (
      final_outcome IS NULL
      OR final_outcome = 'Returned'
    ),
  ADD CONSTRAINT atlas_audit_review_sessions_completed_v2
    CHECK (
      (
        session_status = 'Draft'
        AND completed_at IS NULL
        AND final_outcome IS NULL
      )
      OR
      (
        session_status = 'Returned'
        AND completed_at IS NOT NULL
        AND final_outcome = 'Returned'
      )
    );

ALTER TABLE atlas_audit_review_items
  ADD COLUMN carried_forward BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN source_review_item_id BIGINT
    REFERENCES atlas_audit_review_items(id) ON DELETE SET NULL;

ALTER TABLE atlas_inbox_items
  ADD COLUMN review_session_id BIGINT
    REFERENCES atlas_audit_review_sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX atlas_returned_review_session_once
  ON atlas_inbox_items (review_session_id)
  WHERE item_type = 'Returned Review';

CREATE INDEX atlas_review_sessions_audit_completed_idx
  ON atlas_audit_review_sessions (
    audit_id,
    completed_at DESC
  )
  WHERE session_status = 'Returned';

CREATE INDEX atlas_review_items_carry_source_idx
  ON atlas_audit_review_items (source_review_item_id)
  WHERE source_review_item_id IS NOT NULL;

-- migrate:down

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM atlas_audit_review_sessions
    WHERE session_status = 'Returned'
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back Feature 2B while Returned review sessions exist.';
  END IF;
END
$$;

DROP INDEX IF EXISTS atlas_review_items_carry_source_idx;
DROP INDEX IF EXISTS atlas_review_sessions_audit_completed_idx;
DROP INDEX IF EXISTS atlas_returned_review_session_once;

ALTER TABLE atlas_inbox_items
  DROP COLUMN IF EXISTS review_session_id;

ALTER TABLE atlas_audit_review_items
  DROP COLUMN IF EXISTS source_review_item_id,
  DROP COLUMN IF EXISTS carried_forward;

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS
    atlas_audit_review_sessions_completed_v2,
  DROP CONSTRAINT IF EXISTS
    atlas_audit_review_sessions_outcome_v2,
  DROP CONSTRAINT IF EXISTS
    atlas_audit_review_sessions_status_v2;

ALTER TABLE atlas_audit_review_sessions
  DROP COLUMN IF EXISTS source_review_session_id,
  DROP COLUMN IF EXISTS returned_analyst_username,
  DROP COLUMN IF EXISTS returned_analyst_user_id,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS final_outcome;

ALTER TABLE atlas_audit_review_sessions
  ADD CONSTRAINT atlas_audit_review_sessions_session_status_check
    CHECK (session_status = 'Draft');