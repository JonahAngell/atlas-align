-- migrate:up

ALTER TABLE atlas_audit_approval_requests
  ADD COLUMN rescinded_by_user_id text,
  ADD COLUMN rescinded_by_username text,
  ADD COLUMN rescinded_at timestamptz,
  ADD COLUMN rescission_reason text;

ALTER TABLE atlas_audit_approval_requests
  DROP CONSTRAINT IF EXISTS atlas_audit_approval_requests_request_status_check,
  ADD CONSTRAINT atlas_audit_approval_requests_request_status_check
    CHECK (request_status IN ('Pending','Approved','Denied','Invalidated','Superseded','Rescinded')),
  ADD CONSTRAINT atlas_approval_request_rescission_state_check CHECK (
    (request_status='Rescinded'
      AND rescinded_by_username IS NOT NULL AND btrim(rescinded_by_username) <> ''
      AND rescinded_at IS NOT NULL
      AND rescission_reason IS NOT NULL AND btrim(rescission_reason) <> '')
    OR
    (request_status<>'Rescinded'
      AND rescinded_by_user_id IS NULL AND rescinded_by_username IS NULL
      AND rescinded_at IS NULL AND rescission_reason IS NULL)
  );

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_completed_v3,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_outcome_v3,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_status_v3,
  ADD CONSTRAINT atlas_audit_review_sessions_status_v4
    CHECK (session_status IN ('Draft','Returned','Approved','Rescinded')),
  ADD CONSTRAINT atlas_audit_review_sessions_outcome_v4
    CHECK (final_outcome IS NULL OR final_outcome IN ('Returned','Approved','Rescinded')),
  ADD CONSTRAINT atlas_audit_review_sessions_completed_v4 CHECK (
    (session_status='Draft' AND completed_at IS NULL AND final_outcome IS NULL) OR
    (session_status='Returned' AND completed_at IS NOT NULL AND final_outcome='Returned') OR
    (session_status='Approved' AND completed_at IS NOT NULL AND final_outcome='Approved') OR
    (session_status='Rescinded' AND completed_at IS NOT NULL AND final_outcome='Rescinded')
  );

-- migrate:down

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_audit_approval_requests WHERE request_status='Rescinded')
     OR EXISTS (SELECT 1 FROM atlas_audit_review_sessions WHERE session_status='Rescinded' OR final_outcome='Rescinded') THEN
    RAISE EXCEPTION 'Cannot roll back rescission workflow while Rescinded records exist.';
  END IF;
END
$$;

ALTER TABLE atlas_audit_review_sessions
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_completed_v4,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_outcome_v4,
  DROP CONSTRAINT IF EXISTS atlas_audit_review_sessions_status_v4,
  ADD CONSTRAINT atlas_audit_review_sessions_status_v3 CHECK (session_status IN ('Draft','Returned','Approved')),
  ADD CONSTRAINT atlas_audit_review_sessions_outcome_v3 CHECK (final_outcome IS NULL OR final_outcome IN ('Returned','Approved')),
  ADD CONSTRAINT atlas_audit_review_sessions_completed_v3 CHECK (
    (session_status='Draft' AND completed_at IS NULL AND final_outcome IS NULL) OR
    (session_status='Returned' AND completed_at IS NOT NULL AND final_outcome='Returned') OR
    (session_status='Approved' AND completed_at IS NOT NULL AND final_outcome='Approved')
  );

ALTER TABLE atlas_audit_approval_requests
  DROP CONSTRAINT IF EXISTS atlas_approval_request_rescission_state_check,
  DROP CONSTRAINT IF EXISTS atlas_audit_approval_requests_request_status_check,
  ADD CONSTRAINT atlas_audit_approval_requests_request_status_check
    CHECK (request_status IN ('Pending','Approved','Denied','Invalidated','Superseded')),
  DROP COLUMN rescinded_by_user_id,
  DROP COLUMN rescinded_by_username,
  DROP COLUMN rescinded_at,
  DROP COLUMN rescission_reason;
