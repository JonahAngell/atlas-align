-- migrate:up
CREATE TABLE atlas_audit_review_sessions (
  id BIGSERIAL PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES atlas_audits(id) ON DELETE CASCADE,
  approval_request_id BIGINT NOT NULL REFERENCES atlas_audit_approval_requests(id) ON DELETE CASCADE,
  submitted_revision_id BIGINT NOT NULL REFERENCES atlas_audit_revisions(id) ON DELETE RESTRICT,
  reviewer_user_id TEXT,
  reviewer_username TEXT NOT NULL,
  session_status TEXT NOT NULL DEFAULT 'Draft' CHECK (session_status='Draft'),
  draft_version BIGINT NOT NULL DEFAULT 1 CHECK (draft_version>0),
  resume_section TEXT,
  resume_item_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, submitted_revision_id, reviewer_username)
);

CREATE TABLE atlas_audit_review_items (
  id BIGSERIAL PRIMARY KEY,
  review_session_id BIGINT NOT NULL REFERENCES atlas_audit_review_sessions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  item_type TEXT NOT NULL,
  stable_item_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  semantic_fingerprint TEXT NOT NULL,
  canonical_order INTEGER NOT NULL DEFAULT 0,
  parent_item_key TEXT,
  linked_item_key TEXT,
  is_direct BOOLEAN NOT NULL DEFAULT TRUE,
  severity TEXT,
  decision TEXT CHECK (decision IN ('Approve','Request changes','Needs discussion')),
  reviewer_note TEXT,
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_session_id, section_key, stable_item_key),
  CHECK (is_direct OR decision IS NULL),
  CHECK (decision NOT IN ('Request changes','Needs discussion') OR length(btrim(coalesce(reviewer_note,'')))>0),
  CHECK (NOT (decision='Approve' AND severity='warning') OR length(btrim(coalesce(reviewer_note,'')))>0)
);
CREATE INDEX atlas_review_sessions_request_idx ON atlas_audit_review_sessions(approval_request_id);
CREATE INDEX atlas_review_items_session_section_idx ON atlas_audit_review_items(review_session_id,section_key,canonical_order,id);

-- migrate:down
DROP INDEX IF EXISTS atlas_review_items_session_section_idx;
DROP INDEX IF EXISTS atlas_review_sessions_request_idx;

DROP TABLE IF EXISTS atlas_audit_review_items;
DROP TABLE IF EXISTS atlas_audit_review_sessions;