-- migrate:up

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_status_v2,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_outcome_v2,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_completed_v2;

ALTER TABLE atlas_audit_review_sessions
  ADD CONSTRAINT atlas_audit_review_sessions_status_v3 CHECK (session_status IN ('Draft','Returned','Approved')),
  ADD CONSTRAINT atlas_audit_review_sessions_outcome_v3 CHECK (final_outcome IS NULL OR final_outcome IN ('Returned','Approved')),
  ADD CONSTRAINT atlas_audit_review_sessions_completed_v3 CHECK (
    (session_status='Draft' AND completed_at IS NULL AND final_outcome IS NULL) OR
    (session_status='Returned' AND completed_at IS NOT NULL AND final_outcome='Returned') OR
    (session_status='Approved' AND completed_at IS NOT NULL AND final_outcome='Approved')
  );

ALTER TABLE atlas_inbox_items
  DROP CONSTRAINT IF EXISTS atlas_inbox_items_item_type_check;

ALTER TABLE atlas_inbox_items
  ADD CONSTRAINT atlas_inbox_items_item_type_v2
    CHECK (item_type IN ('Approval Request','Approval Decision','Workflow Notice','Returned Review'));

-- migrate:down

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_audit_review_sessions WHERE session_status='Approved' OR final_outcome='Approved') OR EXISTS (SELECT 1 FROM atlas_inbox_items WHERE item_type='Returned Review') THEN
    RAISE EXCEPTION 'Cannot roll back Feature 2C while approved review sessions exist.';
  END IF;
END
$$;

ALTER TABLE atlas_inbox_items
  DROP CONSTRAINT IF EXISTS atlas_inbox_items_item_type_v2;

ALTER TABLE atlas_inbox_items
  ADD CONSTRAINT atlas_inbox_items_item_type_check
    CHECK (item_type IN ('Approval Request','Approval Decision','Workflow Notice'));

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_completed_v3,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_outcome_v3,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_status_v3;

ALTER TABLE atlas_audit_review_sessions
  ADD CONSTRAINT atlas_audit_review_sessions_status_v2 CHECK (session_status IN ('Draft','Returned')),
  ADD CONSTRAINT atlas_audit_review_sessions_outcome_v2 CHECK (final_outcome IS NULL OR final_outcome='Returned'),
  ADD CONSTRAINT atlas_audit_review_sessions_completed_v2 CHECK (
    (session_status='Draft' AND completed_at IS NULL AND final_outcome IS NULL) OR
    (session_status='Returned' AND completed_at IS NOT NULL AND final_outcome='Returned')
  );
