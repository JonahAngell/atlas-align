-- migrate:up
CREATE TABLE IF NOT EXISTS atlas_field_library (
  "Vanity Label/Field Display Name" text,
  "Source System" text,
  "Source Field Name" text,
  "Business Description" text,
  "Unique Field Identifier" text,
  "Current Source: Frequency" text,
  "Current Source: Population" text,
  "Data Category" text,
  "Field Format" text,
  "Audit - Authority Type" text,
  "Sample Value 1 " text,
  "Sample Value 2" text,
  "Sample Value 3" text,
  "Field Status" text,
  "Current Source: Title" text,
  "Current Source" text,
  "History -  Source File Name" text,
  "Source File Format" text,
  "Field Type" text,
  "Max Characters" text,
  "Transformation logic" text,
  "Translation Logic" text,
  "Matching Key" text,
  "Developer Join Notes" text,
  "Developer Notes" text,
  "Schema Location " text,
  "Field Owner - Logans List" text,
  "System of Record - Logans List" text,
  "Downstream Impact - Logans List" text,
  "Governance - Field Owner" text,
  "Governance - Last Validated Date" text,
  "Governance - Validation Notes" text,
  "ID" text PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS atlas_field_library_current_source_idx
  ON atlas_field_library ("Current Source");
CREATE INDEX IF NOT EXISTS atlas_field_library_source_title_idx
  ON atlas_field_library ("Current Source: Title");

CREATE TABLE IF NOT EXISTS atlas_field_library_imports (
  id bigserial PRIMARY KEY,
  original_file_name text NOT NULL,
  row_count integer NOT NULL CHECK (row_count > 0),
  file_sha256 text NOT NULL,
  imported_by text,
  imported_at timestamptz NOT NULL DEFAULT current_timestamp,
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  error_message text
);

-- migrate:down
DROP TABLE IF EXISTS atlas_field_library_imports;
DROP TABLE IF EXISTS atlas_field_library;
