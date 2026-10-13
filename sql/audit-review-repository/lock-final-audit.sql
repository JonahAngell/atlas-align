SELECT
  *
FROM
  atlas_audits
WHERE
  id = $1
FOR UPDATE
