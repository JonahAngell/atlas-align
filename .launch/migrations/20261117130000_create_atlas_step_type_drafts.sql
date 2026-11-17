-- migrate:up
-- Step Type Builder drafts (Phase 7 of the Dynamic Step Type Builder plan).
--
-- A draft is the builder's working copy of one step type: at most one per
-- type_id, edited in place until it is published as a new immutable row in
-- atlas_step_type_definitions (and then deleted) or discarded. base_version is
-- the published version the draft started from; NULL means a brand-new type.
-- revision is for optimistic concurrency: every save sends the revision it
-- read and bumps it by one, and a save whose revision no longer matches
-- updates no row, so two admins never overwrite each other silently.
--
-- ATLAS Align owns this schema; the builder ships no migrations.
--
-- Draft events: atlas_step_type_events gains 'draft_saved' and
-- 'draft_discarded'. A draft has no definition row (and a discarded draft no
-- row at all), so instead of a second foreign key the events table relaxes
-- definition_id and version to NULL for draft events only. type_id names the
-- draft; version carries the draft's base_version (NULL for a new type), and
-- details carries the revision. ck_atlas_step_type_events_definition_link
-- keeps every definition event ('created', 'published', 'retired',
-- 'imported_from_repository') tied to its definition row exactly as before.
-- The definitions immutability trigger is unchanged.
CREATE TABLE IF NOT EXISTS atlas_step_type_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id text NOT NULL,
  base_version integer NULL,
  definition jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_by_user_id text NOT NULL,
  created_by_username text NOT NULL,
  created_by_full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_by_user_id text NOT NULL,
  updated_by_username text NOT NULL,
  updated_by_full_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT uq_atlas_step_type_drafts_type_id UNIQUE (type_id),
  CONSTRAINT ck_atlas_step_type_drafts_type_id_format CHECK (type_id ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ck_atlas_step_type_drafts_base_version_positive CHECK (base_version IS NULL OR base_version > 0),
  CONSTRAINT ck_atlas_step_type_drafts_revision_positive CHECK (revision > 0),
  CONSTRAINT ck_atlas_step_type_drafts_definition_object CHECK (jsonb_typeof(definition) = 'object'),
  CONSTRAINT ck_atlas_step_type_drafts_definition_identity CHECK (definition ->> 'id' = type_id),
  CONSTRAINT ck_atlas_step_type_drafts_created_by_user_id_not_blank CHECK (btrim(created_by_user_id) <> ''),
  CONSTRAINT ck_atlas_step_type_drafts_created_by_username_not_blank CHECK (btrim(created_by_username) <> ''),
  CONSTRAINT ck_atlas_step_type_drafts_created_by_full_name_not_blank CHECK (btrim(created_by_full_name) <> ''),
  CONSTRAINT ck_atlas_step_type_drafts_updated_by_user_id_not_blank CHECK (btrim(updated_by_user_id) <> ''),
  CONSTRAINT ck_atlas_step_type_drafts_updated_by_username_not_blank CHECK (btrim(updated_by_username) <> ''),
  CONSTRAINT ck_atlas_step_type_drafts_updated_by_full_name_not_blank CHECK (btrim(updated_by_full_name) <> '')
);

ALTER TABLE atlas_step_type_events
  ALTER COLUMN definition_id DROP NOT NULL,
  ALTER COLUMN version DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS ck_atlas_step_type_events_event,
  ADD CONSTRAINT ck_atlas_step_type_events_event CHECK (
    event IN (
      'created',
      'published',
      'retired',
      'imported_from_repository',
      'draft_saved',
      'draft_discarded'
    )
  ),
  ADD CONSTRAINT ck_atlas_step_type_events_definition_link CHECK (
    CASE
      WHEN event IN ('draft_saved', 'draft_discarded') THEN definition_id IS NULL
      ELSE definition_id IS NOT NULL AND version IS NOT NULL
    END
  );

CREATE INDEX IF NOT EXISTS ix_atlas_step_type_events_type_id
  ON atlas_step_type_events (type_id, created_at);

-- migrate:down
DROP INDEX IF EXISTS ix_atlas_step_type_events_type_id;
-- Draft events have no definition row, so they cannot survive NOT NULL.
DELETE FROM atlas_step_type_events
WHERE event IN ('draft_saved', 'draft_discarded');
ALTER TABLE atlas_step_type_events
  DROP CONSTRAINT IF EXISTS ck_atlas_step_type_events_definition_link,
  DROP CONSTRAINT IF EXISTS ck_atlas_step_type_events_event,
  ADD CONSTRAINT ck_atlas_step_type_events_event CHECK (
    event IN ('created', 'published', 'retired', 'imported_from_repository')
  ),
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN definition_id SET NOT NULL;
DROP TABLE IF EXISTS atlas_step_type_drafts;
