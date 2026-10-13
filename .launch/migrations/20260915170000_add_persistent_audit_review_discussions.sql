-- migrate:up
CREATE TABLE atlas_audit_review_objects (
  id BIGSERIAL PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES atlas_audits(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  canonical_object_key TEXT NOT NULL CHECK (btrim(canonical_object_key) <> ''),
  identity_version INTEGER NOT NULL CHECK (identity_version > 0),
  item_type TEXT NOT NULL CHECK (btrim(item_type) <> ''),
  display_label TEXT NOT NULL CHECK (btrim(display_label) <> ''),
  object_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(object_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  UNIQUE (id, audit_id),
  UNIQUE (audit_id, canonical_object_key, identity_version)
);

CREATE TABLE atlas_audit_review_item_objects (
  review_item_id BIGINT PRIMARY KEY REFERENCES atlas_audit_review_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  review_object_id BIGINT NOT NULL,
  audit_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (review_object_id, audit_id)
    REFERENCES atlas_audit_review_objects(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE atlas_audit_discussion_threads (
  id BIGSERIAL PRIMARY KEY,
  audit_id TEXT NOT NULL,
  review_object_id BIGINT NOT NULL,
  current_state TEXT NOT NULL DEFAULT 'Open' CHECK (current_state IN ('Open','Resolved')),
  state_version BIGINT NOT NULL DEFAULT 1 CHECK (state_version > 0),
  created_by_user_id TEXT,
  created_by_username TEXT NOT NULL CHECK (btrim(created_by_username) <> ''),
  created_by_authenticated_user_id TEXT,
  created_by_authenticated_username TEXT NOT NULL CHECK (btrim(created_by_authenticated_username) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  UNIQUE (id, audit_id),
  UNIQUE (review_object_id),
  FOREIGN KEY (review_object_id, audit_id)
    REFERENCES atlas_audit_review_objects(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE atlas_audit_discussion_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL,
  audit_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  actor_context TEXT NOT NULL CHECK (actor_context IN ('Reviewer','Analyst')),
  actor_user_id TEXT,
  actor_username TEXT NOT NULL CHECK (btrim(actor_username) <> ''),
  authenticated_actor_user_id TEXT,
  authenticated_actor_username TEXT NOT NULL CHECK (btrim(authenticated_actor_username) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  UNIQUE (id, thread_id),
  FOREIGN KEY (thread_id, audit_id)
    REFERENCES atlas_audit_discussion_threads(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE atlas_audit_discussion_transitions (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL,
  audit_id TEXT NOT NULL,
  from_state TEXT CHECK (from_state IN ('Open','Resolved')),
  to_state TEXT NOT NULL CHECK (to_state IN ('Open','Resolved')),
  actor_user_id TEXT,
  actor_username TEXT NOT NULL CHECK (btrim(actor_username) <> ''),
  authenticated_actor_user_id TEXT,
  authenticated_actor_username TEXT NOT NULL CHECK (btrim(authenticated_actor_username) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  CHECK (from_state IS NULL OR from_state <> to_state),
  FOREIGN KEY (thread_id, audit_id)
    REFERENCES atlas_audit_discussion_threads(id, audit_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX atlas_review_item_objects_object_idx ON atlas_audit_review_item_objects(review_object_id, review_item_id);
CREATE INDEX atlas_discussion_threads_audit_state_idx ON atlas_audit_discussion_threads(audit_id, current_state, id);
CREATE INDEX atlas_discussion_messages_thread_order_idx ON atlas_audit_discussion_messages(thread_id, id);
CREATE INDEX atlas_discussion_transitions_thread_order_idx ON atlas_audit_discussion_transitions(thread_id, id);

-- Existing reviewer_note values are intentionally neither read nor copied by this migration.

-- migrate:down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM atlas_audit_discussion_messages)
     OR EXISTS (SELECT 1 FROM atlas_audit_discussion_transitions) THEN
    RAISE EXCEPTION 'Cannot roll back Package 2D.2 while persistent discussion history exists.';
  END IF;
END
$$;
DROP TABLE IF EXISTS atlas_audit_discussion_transitions;
DROP TABLE IF EXISTS atlas_audit_discussion_messages;
DROP TABLE IF EXISTS atlas_audit_discussion_threads;
DROP TABLE IF EXISTS atlas_audit_review_item_objects;
DROP TABLE IF EXISTS atlas_audit_review_objects;
