-- migrate:up
-- Run history written by File Utility when it runs an ATLAS audit. Metadata and counts only:
-- no cell values and no runtime value lists are stored here. File Utility reads the audit
-- tables and writes only this table; ATLAS reads it to show "Last run" on Audit Overview.
-- Runs follow their audit: renames cascade, and hard-deleting an audit deletes its runs.

CREATE TABLE IF NOT EXISTS atlas_audit_runs (
  id bigserial PRIMARY KEY,
  audit_id text NOT NULL REFERENCES atlas_audits(id) ON UPDATE CASCADE ON DELETE CASCADE,
  publication_id bigint,
  revision_id bigint NOT NULL,
  is_draft boolean NOT NULL,
  document_sha256 text NOT NULL CHECK (btrim(document_sha256) <> ''),
  definition_sha256 text,
  compiler_version text NOT NULL CHECK (btrim(compiler_version) <> ''),
  engine_version text NOT NULL CHECK (btrim(engine_version) <> ''),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'blocked')),
  started_at timestamptz NOT NULL DEFAULT current_timestamp,
  finished_at timestamptz,
  run_by_user_id text,
  run_by_username text NOT NULL CHECK (btrim(run_by_username) <> ''),
  -- [{sourceAlias, fileName, sha256, rows, columns}]
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_files) = 'array'),
  -- [{stepId, label, status, rowsIn, rowsOut, rowsAffected}]
  step_counts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(step_counts) = 'array'),
  -- Run parameters such as the run date. Runtime value lists are never stored.
  run_parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(run_parameters) = 'object'),
  -- The detected type (date, amount, text) of each compared column, by "alias.field".
  column_types jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(column_types) = 'object'),
  result_rows integer CHECK (result_rows IS NULL OR result_rows >= 0),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_code text,
  -- Links to the result file while File Utility still retains it.
  file_utility_result_id text,
  FOREIGN KEY (revision_id, audit_id)
    REFERENCES atlas_audit_revisions(id, audit_id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (publication_id, audit_id)
    REFERENCES atlas_audit_publications(id, audit_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT atlas_audit_runs_published_check CHECK (is_draft OR publication_id IS NOT NULL),
  CONSTRAINT atlas_audit_runs_finished_check CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX IF NOT EXISTS atlas_audit_runs_audit_recent_idx
  ON atlas_audit_runs (audit_id, started_at DESC);
CREATE INDEX IF NOT EXISTS atlas_audit_runs_user_recent_idx
  ON atlas_audit_runs (lower(run_by_username), started_at DESC);

-- migrate:down
DROP TABLE IF EXISTS atlas_audit_runs;
