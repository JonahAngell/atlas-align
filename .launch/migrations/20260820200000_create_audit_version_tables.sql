-- migrate:up
CREATE TABLE IF NOT EXISTS atlas_audits (
  id text PRIMARY KEY,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  schema_version integer NOT NULL DEFAULT 1,
  source_kind text NOT NULL DEFAULT 'database',
  owner_user_id text,
  owner_username text,
  current_revision_id bigint,
  current_revision_number integer NOT NULL DEFAULT 0,
  created_by_user_id text,
  created_by_username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_by_user_id text,
  updated_by_username text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  archived_at timestamptz,
  archived_by_username text
);

CREATE TABLE IF NOT EXISTS atlas_audit_revisions (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES atlas_audits(id),
  revision_number integer NOT NULL,
  parent_revision_id bigint REFERENCES atlas_audit_revisions(id),
  document jsonb NOT NULL,
  document_sha256 text NOT NULL,
  change_type text NOT NULL,
  change_summary text,
  created_by_user_id text,
  created_by_username text NOT NULL,
  created_by_full_name text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  restored_from_revision_id bigint REFERENCES atlas_audit_revisions(id),
  UNIQUE (audit_id, revision_number)
);

ALTER TABLE atlas_audits
  ADD CONSTRAINT atlas_audits_current_revision_fk
  FOREIGN KEY (current_revision_id) REFERENCES atlas_audit_revisions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS atlas_audit_steps (
  audit_id text NOT NULL REFERENCES atlas_audits(id),
  step_id text NOT NULL,
  current_step_revision_id bigint,
  parent_step_id text,
  branch_type text NOT NULL DEFAULT 'root',
  sort_order integer NOT NULL DEFAULT 0,
  step_type text,
  enabled boolean NOT NULL DEFAULT true,
  auto_generated_reference boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  deleted_at timestamptz,
  PRIMARY KEY (audit_id, step_id),
  FOREIGN KEY (audit_id, parent_step_id)
    REFERENCES atlas_audit_steps(audit_id, step_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS atlas_audit_step_revisions (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL,
  step_id text NOT NULL,
  audit_revision_id bigint NOT NULL REFERENCES atlas_audit_revisions(id),
  step_revision_number integer NOT NULL,
  operation text NOT NULL,
  step_document jsonb,
  step_sha256 text,
  change_summary text,
  created_by_user_id text,
  created_by_username text NOT NULL,
  created_by_full_name text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  restored_from_step_revision_id bigint REFERENCES atlas_audit_step_revisions(id),
  FOREIGN KEY (audit_id, step_id) REFERENCES atlas_audit_steps(audit_id, step_id),
  UNIQUE (audit_id, step_id, step_revision_number)
);

ALTER TABLE atlas_audit_steps
  ADD CONSTRAINT atlas_audit_steps_current_revision_fk
  FOREIGN KEY (current_step_revision_id) REFERENCES atlas_audit_step_revisions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS atlas_audits_active_name_idx
  ON atlas_audits (lower(name)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS atlas_audit_revisions_history_idx
  ON atlas_audit_revisions (audit_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS atlas_step_revisions_history_idx
  ON atlas_audit_step_revisions (audit_id, step_id, step_revision_number DESC);
CREATE INDEX IF NOT EXISTS atlas_audit_steps_order_idx
  ON atlas_audit_steps (audit_id, parent_step_id, sort_order) WHERE deleted_at IS NULL;

-- migrate:down
DROP TABLE IF EXISTS atlas_audit_step_revisions;
DROP TABLE IF EXISTS atlas_audit_steps;
ALTER TABLE atlas_audits DROP CONSTRAINT IF EXISTS atlas_audits_current_revision_fk;
DROP TABLE IF EXISTS atlas_audit_revisions;
DROP TABLE IF EXISTS atlas_audits;
