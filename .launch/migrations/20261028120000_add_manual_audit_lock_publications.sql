-- migrate:up
-- A manual audit lock publishes an immutable snapshot without a review approval.
-- Review publications keep their approval requirement through the review check.

ALTER TABLE atlas_audit_publications
  ADD COLUMN lock_source text NOT NULL DEFAULT 'Review',
  ALTER COLUMN source_approval_id DROP NOT NULL,
  ALTER COLUMN approver_username DROP NOT NULL,
  ADD CONSTRAINT atlas_publication_lock_source_check
    CHECK (lock_source IN ('Review', 'Manual')),
  ADD CONSTRAINT atlas_publication_review_approval_check CHECK (
    lock_source <> 'Review'
    OR (source_approval_id IS NOT NULL AND approver_username IS NOT NULL)
  );

-- migrate:down
-- Fails while manual-lock publications exist, so no publication history is discarded.

ALTER TABLE atlas_audit_publications
  DROP CONSTRAINT atlas_publication_review_approval_check,
  DROP CONSTRAINT atlas_publication_lock_source_check,
  ALTER COLUMN approver_username SET NOT NULL,
  ALTER COLUMN source_approval_id SET NOT NULL,
  DROP COLUMN lock_source;
