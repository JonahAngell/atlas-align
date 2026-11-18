-- Every published version of one type, newest first, locked for the rest of
-- the transaction so a concurrent publish or retire cannot change which
-- version becomes the latest while a retire is being checked.
SELECT
  version,
  definition
FROM
  atlas_step_type_definitions
WHERE
  type_id = $1
  AND status = 'published'
ORDER BY
  version DESC
FOR UPDATE
