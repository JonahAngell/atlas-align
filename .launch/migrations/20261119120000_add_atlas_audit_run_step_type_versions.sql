-- migrate:up
-- The step type definition versions a File Utility run compiled against:
-- {type_id: {"version": n, "contentHash": "<sha256>"}}. Null for runs written
-- before File Utility recorded them, or by a File Utility that doesn't yet.
-- File Utility writes the column only when it exists, so this can land first.

ALTER TABLE atlas_audit_runs
  ADD COLUMN IF NOT EXISTS step_type_versions jsonb,
  ADD CONSTRAINT ck_atlas_audit_runs_step_type_versions_object
    CHECK (step_type_versions IS NULL OR jsonb_typeof(step_type_versions) = 'object');

-- migrate:down
ALTER TABLE atlas_audit_runs
  DROP CONSTRAINT IF EXISTS ck_atlas_audit_runs_step_type_versions_object,
  DROP COLUMN IF EXISTS step_type_versions;
