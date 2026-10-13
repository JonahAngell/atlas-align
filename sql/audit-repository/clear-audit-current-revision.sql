UPDATE atlas_audits
SET
  current_revision_id = NULL
WHERE
  id = $1
