SELECT
  id,
  name,
  current_revision_id,
  current_revision_number
FROM
  atlas_audits
WHERE
  id = $1
  AND archived_at IS NOT NULL
FOR UPDATE
