UPDATE atlas_audits
SET
  id = $2
WHERE
  id = $1
