-- migrate:up
CREATE TABLE IF NOT EXISTS atlas_custom_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  source_name text NOT NULL,
  source_system text NOT NULL DEFAULT '',
  created_by_user_id text NOT NULL,
  created_by_username text NOT NULL,
  created_by_full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT uq_atlas_custom_sources_source_key UNIQUE (source_key),
  CONSTRAINT ck_atlas_custom_sources_source_key_not_blank CHECK (btrim(source_key) <> ''),
  CONSTRAINT ck_atlas_custom_sources_source_name_not_blank CHECK (btrim(source_name) <> ''),
  CONSTRAINT ck_atlas_custom_sources_created_by_user_id_not_blank CHECK (btrim(created_by_user_id) <> ''),
  CONSTRAINT ck_atlas_custom_sources_created_by_username_not_blank CHECK (btrim(created_by_username) <> ''),
  CONSTRAINT ck_atlas_custom_sources_created_by_full_name_not_blank CHECK (btrim(created_by_full_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_atlas_custom_sources_created_by_user_id
  ON atlas_custom_sources (created_by_user_id);

CREATE TABLE IF NOT EXISTS atlas_custom_source_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  field_order integer NOT NULL,
  field_name text NOT NULL,
  vanity_label text NOT NULL,
  field_format text NOT NULL,
  business_description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT fk_atlas_custom_source_fields_source_id
    FOREIGN KEY (source_id) REFERENCES atlas_custom_sources (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT uq_atlas_custom_source_fields_source_order UNIQUE (source_id, field_order),
  CONSTRAINT ck_atlas_custom_source_fields_order_positive CHECK (field_order > 0),
  CONSTRAINT ck_atlas_custom_source_fields_field_name_not_blank CHECK (btrim(field_name) <> ''),
  CONSTRAINT ck_atlas_custom_source_fields_vanity_label_not_blank CHECK (btrim(vanity_label) <> ''),
  CONSTRAINT ck_atlas_custom_source_fields_format CHECK (
    field_format IN (
      'Text',
      'Number',
      'Decimal',
      'Date',
      'Date/Time',
      'Boolean',
      'Currency'
    )
  )
);

CREATE INDEX IF NOT EXISTS ix_atlas_custom_source_fields_source_id
  ON atlas_custom_source_fields (source_id);

-- migrate:down
DROP TABLE IF EXISTS atlas_custom_source_fields;
DROP TABLE IF EXISTS atlas_custom_sources;
