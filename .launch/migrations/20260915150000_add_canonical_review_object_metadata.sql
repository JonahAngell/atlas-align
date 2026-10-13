-- migrate:up
ALTER TABLE atlas_audit_review_items
  ADD COLUMN canonical_object_key TEXT,
  ADD COLUMN identity_version INTEGER,
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN change_type TEXT,
  ADD COLUMN change_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN change_summary TEXT,
  ADD COLUMN prior_object_summary JSONB,
  ADD COLUMN submitted_object_summary JSONB,
  ADD CONSTRAINT atlas_review_items_identity_version_check
    CHECK (identity_version IS NULL OR identity_version > 0),
  ADD CONSTRAINT atlas_review_items_change_reason_codes_check
    CHECK (jsonb_typeof(change_reason_codes) = 'array'),
  ADD CONSTRAINT atlas_review_items_prior_summary_check
    CHECK (prior_object_summary IS NULL OR jsonb_typeof(prior_object_summary) = 'object'),
  ADD CONSTRAINT atlas_review_items_submitted_summary_check
    CHECK (submitted_object_summary IS NULL OR jsonb_typeof(submitted_object_summary) = 'object'),
  ADD CONSTRAINT atlas_review_items_deleted_metadata_check
    CHECK (NOT is_deleted OR (change_type = 'deleted' AND prior_object_summary IS NOT NULL));

CREATE UNIQUE INDEX atlas_review_items_session_canonical_object_idx
  ON atlas_audit_review_items(review_session_id, canonical_object_key)
  WHERE canonical_object_key IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS atlas_review_items_session_canonical_object_idx;
ALTER TABLE atlas_audit_review_items
  DROP CONSTRAINT IF EXISTS atlas_review_items_deleted_metadata_check,
  DROP CONSTRAINT IF EXISTS atlas_review_items_submitted_summary_check,
  DROP CONSTRAINT IF EXISTS atlas_review_items_prior_summary_check,
  DROP CONSTRAINT IF EXISTS atlas_review_items_change_reason_codes_check,
  DROP CONSTRAINT IF EXISTS atlas_review_items_identity_version_check,
  DROP COLUMN IF EXISTS submitted_object_summary,
  DROP COLUMN IF EXISTS prior_object_summary,
  DROP COLUMN IF EXISTS change_summary,
  DROP COLUMN IF EXISTS change_reason_codes,
  DROP COLUMN IF EXISTS change_type,
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS identity_version,
  DROP COLUMN IF EXISTS canonical_object_key;
