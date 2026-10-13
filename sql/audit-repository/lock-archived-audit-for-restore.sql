SELECT
  id
FROM
  atlas_audits
WHERE
  id = $1
  AND archived_at IS NOT NULL
FOR UPDATE
