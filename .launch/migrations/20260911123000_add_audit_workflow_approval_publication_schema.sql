-- migrate:up
-- Phase 1 durable workflow schema. Schema-only: no workflow behavior is activated.

ALTER TABLE atlas_audit_revisions
  ADD CONSTRAINT atlas_audit_revisions_id_audit_unique UNIQUE (id, audit_id);

ALTER TABLE atlas_audits
  ADD COLUMN workflow_status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN current_approval_request_id bigint,
  ADD COLUMN current_approval_id bigint,
  ADD COLUMN current_publication_id bigint,
  ADD COLUMN published_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN revision_cycle_number integer NOT NULL DEFAULT 0,
  ADD COLUMN working_from_publication_id bigint,
  ADD CONSTRAINT atlas_audits_workflow_status_check
    CHECK (workflow_status IN ('Draft', 'Pending Approval', 'Approved', 'Published', 'Draft Revision')),
  ADD CONSTRAINT atlas_audits_revision_cycle_number_check CHECK (revision_cycle_number >= 0);

CREATE TABLE atlas_audit_approval_requests (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES atlas_audits(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  requester_user_id text,
  requester_username text NOT NULL CHECK (btrim(requester_username) <> ''),
  selected_approver_user_id text,
  selected_approver_username text NOT NULL CHECK (btrim(selected_approver_username) <> ''),
  submitted_revision_id bigint NOT NULL,
  request_status text NOT NULL DEFAULT 'Pending'
    CHECK (request_status IN ('Pending', 'Approved', 'Denied', 'Invalidated', 'Superseded')),
  requester_message text,
  reviewer_response text,
  decision_actor_user_id text,
  decision_actor_username text,
  decision_at timestamptz,
  invalidated_by_user_id text,
  invalidated_by_username text,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  UNIQUE (id, audit_id),
  FOREIGN KEY (submitted_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT atlas_approval_request_decision_state_check CHECK (
    (request_status IN ('Approved', 'Denied')
      AND decision_actor_username IS NOT NULL AND btrim(decision_actor_username) <> '' AND decision_at IS NOT NULL)
    OR
    (request_status NOT IN ('Approved', 'Denied')
      AND decision_actor_user_id IS NULL AND decision_actor_username IS NULL AND decision_at IS NULL)
  ),
  CONSTRAINT atlas_approval_request_invalidation_state_check CHECK (
    (request_status IN ('Invalidated', 'Superseded')
      AND invalidated_at IS NOT NULL AND invalidation_reason IS NOT NULL AND btrim(invalidation_reason) <> '')
    OR
    (request_status NOT IN ('Invalidated', 'Superseded')
      AND invalidated_by_user_id IS NULL AND invalidated_by_username IS NULL
      AND invalidated_at IS NULL AND invalidation_reason IS NULL)
  ),
  CONSTRAINT atlas_approval_request_response_check CHECK (
    request_status <> 'Denied' OR (reviewer_response IS NOT NULL AND btrim(reviewer_response) <> '')
  )
);

CREATE TABLE atlas_inbox_items (
  id bigserial PRIMARY KEY,
  recipient_user_id text,
  recipient_username text NOT NULL CHECK (btrim(recipient_username) <> ''),
  audit_id text NOT NULL,
  approval_request_id bigint NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('Approval Request', 'Approval Decision', 'Workflow Notice')),
  item_status text NOT NULL CHECK (item_status IN ('Actionable', 'Informational', 'Resolved')),
  read_state text NOT NULL DEFAULT 'Unread' CHECK (read_state IN ('Unread', 'Read')),
  display_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(display_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  resolved_at timestamptz,
  FOREIGN KEY (approval_request_id, audit_id)
    REFERENCES atlas_audit_approval_requests(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT atlas_inbox_resolution_state_check CHECK (
    (item_status = 'Resolved' AND resolved_at IS NOT NULL) OR
    (item_status <> 'Resolved' AND resolved_at IS NULL)
  )
);

CREATE TABLE atlas_audit_approvals (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL,
  approved_revision_id bigint NOT NULL,
  approval_request_id bigint NOT NULL,
  approving_user_id text,
  approving_username text NOT NULL CHECK (btrim(approving_username) <> ''),
  approved_at timestamptz NOT NULL DEFAULT current_timestamp,
  approval_status text NOT NULL DEFAULT 'Active' CHECK (approval_status IN ('Active', 'Invalidated')),
  invalidated_at timestamptz,
  invalidated_by_user_id text,
  invalidated_by_username text,
  invalidation_reason text,
  reviewer_comments text,
  UNIQUE (id, audit_id),
  UNIQUE (approval_request_id),
  FOREIGN KEY (approved_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (approval_request_id, audit_id)
    REFERENCES atlas_audit_approval_requests(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT atlas_approval_invalidation_state_check CHECK (
    (approval_status = 'Invalidated' AND invalidated_at IS NOT NULL
      AND invalidation_reason IS NOT NULL AND btrim(invalidation_reason) <> '') OR
    (approval_status = 'Active' AND invalidated_at IS NULL AND invalidated_by_user_id IS NULL
      AND invalidated_by_username IS NULL AND invalidation_reason IS NULL)
  )
);

CREATE TABLE atlas_audit_publications (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  version_title text NOT NULL CHECK (btrim(version_title) <> ''),
  description text,
  change_summary text,
  approved_revision_id bigint NOT NULL,
  source_approval_id bigint NOT NULL,
  source_working_revision_id bigint NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  assignment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assignment_snapshot) = 'object'),
  approver_user_id text,
  approver_username text NOT NULL CHECK (btrim(approver_username) <> ''),
  publisher_user_id text,
  publisher_username text NOT NULL CHECK (btrim(publisher_username) <> ''),
  published_at timestamptz NOT NULL DEFAULT current_timestamp,
  unlock_source_publication_id bigint,
  unlock_reason text,
  deletion_status text NOT NULL DEFAULT 'Active' CHECK (deletion_status IN ('Active', 'Recently Deleted')),
  deleted_at timestamptz,
  deleted_by_user_id text,
  deleted_by_username text,
  deletion_reason text,
  UNIQUE (id, audit_id),
  UNIQUE (audit_id, version_number),
  FOREIGN KEY (approved_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (source_working_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (source_approval_id, audit_id)
    REFERENCES atlas_audit_approvals(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (unlock_source_publication_id, audit_id)
    REFERENCES atlas_audit_publications(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT atlas_publication_deletion_state_check CHECK (
    (deletion_status = 'Recently Deleted' AND deleted_at IS NOT NULL
      AND deleted_by_username IS NOT NULL AND btrim(deleted_by_username) <> ''
      AND deletion_reason IS NOT NULL AND btrim(deletion_reason) <> '') OR
    (deletion_status = 'Active' AND deleted_at IS NULL AND deleted_by_user_id IS NULL
      AND deleted_by_username IS NULL AND deletion_reason IS NULL)
  ),
  CONSTRAINT atlas_publication_unlock_source_check CHECK (
    unlock_source_publication_id IS NULL OR unlock_source_publication_id <> id
  )
);

CREATE TABLE atlas_audit_activity_events (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES atlas_audits(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  actor_user_id text,
  actor_username text,
  event_at timestamptz NOT NULL DEFAULT current_timestamp,
  source_revision_id bigint,
  resulting_revision_id bigint,
  affected_step_id text,
  approval_request_id bigint,
  approval_id bigint,
  publication_id bigint,
  publication_version integer CHECK (publication_version IS NULL OR publication_version > 0),
  reason text,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (source_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (resulting_revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (approval_request_id, audit_id)
    REFERENCES atlas_audit_approval_requests(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (approval_id, audit_id)
    REFERENCES atlas_audit_approvals(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (publication_id, audit_id)
    REFERENCES atlas_audit_publications(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT atlas_activity_publication_pair_check CHECK (
    (publication_id IS NULL AND publication_version IS NULL) OR
    (publication_id IS NOT NULL AND publication_version IS NOT NULL)
  )
);

ALTER TABLE atlas_audits
  ADD CONSTRAINT atlas_audits_current_approval_request_fk
    FOREIGN KEY (current_approval_request_id, id)
    REFERENCES atlas_audit_approval_requests(id, audit_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT atlas_audits_current_approval_fk
    FOREIGN KEY (current_approval_id, id)
    REFERENCES atlas_audit_approvals(id, audit_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT atlas_audits_current_publication_fk
    FOREIGN KEY (current_publication_id, id)
    REFERENCES atlas_audit_publications(id, audit_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT atlas_audits_working_publication_fk
    FOREIGN KEY (working_from_publication_id, id)
    REFERENCES atlas_audit_publications(id, audit_id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT atlas_audits_publication_lock_check CHECK (
    (workflow_status = 'Published' AND published_locked AND current_publication_id IS NOT NULL)
    OR (workflow_status <> 'Published' AND NOT published_locked)
  );

-- Authoritative Phase 0 mapping. No request/approval/publication rows are synthesized,
-- therefore Ready for Review cannot satisfy the verified-record exception and maps to Draft.
UPDATE atlas_audits a
SET workflow_status = CASE
  WHEN BTRIM(COALESCE(r.document ->> 'status', '')) IN
    ('Draft', 'Requirement Gathering', 'Ready for Review', 'Complete', '') THEN 'Draft'
  ELSE 'Draft'
END,
revision_cycle_number = 0,
published_locked = false,
current_approval_request_id = NULL,
current_approval_id = NULL,
current_publication_id = NULL,
working_from_publication_id = NULL
FROM atlas_audit_revisions r
WHERE r.id = a.current_revision_id;

CREATE INDEX atlas_approval_requests_audit_status_idx ON atlas_audit_approval_requests(audit_id, request_status);
CREATE INDEX atlas_approval_requests_approver_status_idx ON atlas_audit_approval_requests(selected_approver_username, request_status);
CREATE UNIQUE INDEX atlas_approval_requests_one_pending_per_audit_idx
  ON atlas_audit_approval_requests(audit_id) WHERE request_status = 'Pending';
CREATE INDEX atlas_inbox_recipient_status_idx ON atlas_inbox_items(recipient_username, item_status, read_state);
CREATE INDEX atlas_inbox_audit_idx ON atlas_inbox_items(audit_id);
CREATE UNIQUE INDEX atlas_approvals_one_active_per_audit_idx
  ON atlas_audit_approvals(audit_id) WHERE approval_status = 'Active';
CREATE INDEX atlas_publications_audit_published_idx ON atlas_audit_publications(audit_id, published_at DESC);
CREATE INDEX atlas_activity_audit_event_idx ON atlas_audit_activity_events(audit_id, event_at DESC);
CREATE INDEX atlas_audits_workflow_status_idx ON atlas_audits(workflow_status) WHERE archived_at IS NULL;
CREATE INDEX atlas_audits_current_approval_request_idx ON atlas_audits(current_approval_request_id) WHERE current_approval_request_id IS NOT NULL;
CREATE INDEX atlas_audits_current_publication_idx ON atlas_audits(current_publication_id) WHERE current_publication_id IS NOT NULL;

-- migrate:down

ALTER TABLE atlas_audits
  DROP CONSTRAINT atlas_audits_current_approval_request_fk,
  DROP CONSTRAINT atlas_audits_current_approval_fk,
  DROP CONSTRAINT atlas_audits_current_publication_fk,
  DROP CONSTRAINT atlas_audits_working_publication_fk,
  DROP CONSTRAINT atlas_audits_publication_lock_check;

DROP TABLE atlas_audit_activity_events;
DROP TABLE atlas_inbox_items;
DROP TABLE atlas_audit_publications;
DROP TABLE atlas_audit_approvals;
DROP TABLE atlas_audit_approval_requests;

ALTER TABLE atlas_audits
  DROP CONSTRAINT atlas_audits_workflow_status_check,
  DROP CONSTRAINT atlas_audits_revision_cycle_number_check,
  DROP COLUMN workflow_status,
  DROP COLUMN current_approval_request_id,
  DROP COLUMN current_approval_id,
  DROP COLUMN current_publication_id,
  DROP COLUMN published_locked,
  DROP COLUMN revision_cycle_number,
  DROP COLUMN working_from_publication_id;

ALTER TABLE atlas_audit_revisions
  DROP CONSTRAINT atlas_audit_revisions_id_audit_unique;