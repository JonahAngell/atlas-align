-- Types the builder retired completely: no published version is left. The
-- browser leaves them out of the step type picker even though ATLAS Align
-- still bundles their repository files, while existing steps keep rendering.
SELECT
  type_id
FROM
  atlas_step_type_definitions
GROUP BY
  type_id
HAVING
  bool_or(status = 'retired')
  AND NOT bool_or(status = 'published')
ORDER BY
  type_id
