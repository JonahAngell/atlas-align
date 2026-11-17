-- migrate:up
-- Step type definitions: one immutable row per (type_id, version). ATLAS Align
-- imports its repository files at startup and the Step Type Builder publishes
-- new versions here. Only status and updated_* change after a row is written.
CREATE TABLE IF NOT EXISTS atlas_step_type_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id text NOT NULL,
  version integer NOT NULL,
  schema_version integer NOT NULL,
  definition jsonb NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  origin text NOT NULL,
  created_by_user_id text NOT NULL,
  created_by_username text NOT NULL,
  created_by_full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_by_user_id text NOT NULL,
  updated_by_username text NOT NULL,
  updated_by_full_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT uq_atlas_step_type_definitions_type_version UNIQUE (type_id, version),
  CONSTRAINT ck_atlas_step_type_definitions_type_id_format CHECK (type_id ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_atlas_step_type_definitions_version_positive CHECK (version > 0),
  CONSTRAINT ck_atlas_step_type_definitions_schema_version_positive CHECK (schema_version > 0),
  CONSTRAINT ck_atlas_step_type_definitions_definition_object CHECK (jsonb_typeof(definition) = 'object'),
  CONSTRAINT ck_atlas_step_type_definitions_definition_identity CHECK (
    definition ->> 'id' = type_id AND (definition ->> 'version')::integer = version
  ),
  CONSTRAINT ck_atlas_step_type_definitions_content_hash_format CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_atlas_step_type_definitions_status CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT ck_atlas_step_type_definitions_origin CHECK (origin IN ('repository', 'builder')),
  CONSTRAINT ck_atlas_step_type_definitions_created_by_user_id_not_blank CHECK (btrim(created_by_user_id) <> ''),
  CONSTRAINT ck_atlas_step_type_definitions_created_by_username_not_blank CHECK (btrim(created_by_username) <> ''),
  CONSTRAINT ck_atlas_step_type_definitions_created_by_full_name_not_blank CHECK (btrim(created_by_full_name) <> ''),
  CONSTRAINT ck_atlas_step_type_definitions_updated_by_user_id_not_blank CHECK (btrim(updated_by_user_id) <> ''),
  CONSTRAINT ck_atlas_step_type_definitions_updated_by_username_not_blank CHECK (btrim(updated_by_username) <> ''),
  CONSTRAINT ck_atlas_step_type_definitions_updated_by_full_name_not_blank CHECK (btrim(updated_by_full_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_atlas_step_type_definitions_published
  ON atlas_step_type_definitions (type_id, version DESC)
  WHERE status = 'published';

-- A published version never changes; publish a new version instead.
CREATE OR REPLACE FUNCTION atlas_step_type_definitions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type_id IS DISTINCT FROM OLD.type_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.definition IS DISTINCT FROM OLD.definition
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'step type % version % cannot be changed; publish a new version', OLD.type_id, OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_atlas_step_type_definitions_immutable ON atlas_step_type_definitions;
CREATE TRIGGER tr_atlas_step_type_definitions_immutable
  BEFORE UPDATE ON atlas_step_type_definitions
  FOR EACH ROW EXECUTE FUNCTION atlas_step_type_definitions_immutable();

-- The audit trail for every definition row.
CREATE TABLE IF NOT EXISTS atlas_step_type_events (
  id bigserial PRIMARY KEY,
  definition_id uuid NOT NULL,
  type_id text NOT NULL,
  version integer NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id text NOT NULL,
  actor_username text NOT NULL,
  actor_full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT fk_atlas_step_type_events_definition_id
    FOREIGN KEY (definition_id) REFERENCES atlas_step_type_definitions (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT ck_atlas_step_type_events_event CHECK (
    event IN ('created', 'published', 'retired', 'imported_from_repository')
  ),
  CONSTRAINT ck_atlas_step_type_events_details_object CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT ck_atlas_step_type_events_actor_user_id_not_blank CHECK (btrim(actor_user_id) <> ''),
  CONSTRAINT ck_atlas_step_type_events_actor_username_not_blank CHECK (btrim(actor_username) <> ''),
  CONSTRAINT ck_atlas_step_type_events_actor_full_name_not_blank CHECK (btrim(actor_full_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_atlas_step_type_events_definition_id
  ON atlas_step_type_events (definition_id);

-- Decision B: a publication records the definition version of every step
-- type at the moment it was published, and renders with those versions.
ALTER TABLE atlas_audit_publications
  ADD COLUMN IF NOT EXISTS step_type_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ck_atlas_audit_publications_step_type_versions_object
    CHECK (jsonb_typeof(step_type_versions) = 'object');

-- migrate:down
ALTER TABLE atlas_audit_publications
  DROP CONSTRAINT IF EXISTS ck_atlas_audit_publications_step_type_versions_object,
  DROP COLUMN IF EXISTS step_type_versions;
DROP TABLE IF EXISTS atlas_step_type_events;
DROP TABLE IF EXISTS atlas_step_type_definitions;
DROP FUNCTION IF EXISTS atlas_step_type_definitions_immutable();
