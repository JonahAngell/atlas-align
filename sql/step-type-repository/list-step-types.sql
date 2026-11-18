-- The latest published version of every type, every older or retired version
-- a publication was pinned to, and the highest retired version of a type with
-- no published version left. Published audits keep rendering with the
-- definitions they were published with, and steps of a fully retired type
-- still render even when ATLAS Align bundles no file for it (a type the
-- builder created).
WITH
  latest AS (
    SELECT
      type_id,
      max(version) AS version
    FROM
      atlas_step_type_definitions
    WHERE
      status = 'published'
    GROUP BY
      type_id
  ),
  pinned AS (
    SELECT DISTINCT
      pin.key AS type_id,
      pin.value::integer AS version
    FROM
      atlas_audit_publications publication
      CROSS JOIN LATERAL jsonb_each_text(publication.step_type_versions) pin
    WHERE
      pin.value ~ '^[0-9]+$'
  ),
  last_retired AS (
    SELECT
      type_id,
      max(version) FILTER (
        WHERE
          status = 'retired'
      ) AS version
    FROM
      atlas_step_type_definitions
    GROUP BY
      type_id
    HAVING
      bool_or(status = 'retired')
      AND NOT bool_or(status = 'published')
  )
SELECT
  definition.type_id,
  definition.version,
  definition.schema_version,
  definition.status,
  definition.content_hash,
  definition.definition,
  (latest.version IS NOT NULL) AS latest
FROM
  atlas_step_type_definitions definition
  LEFT JOIN latest ON latest.type_id = definition.type_id
  AND latest.version = definition.version
WHERE
  definition.status <> 'draft'
  AND (
    latest.version IS NOT NULL
    OR (definition.type_id, definition.version) IN (
      SELECT
        type_id,
        version
      FROM
        pinned
    )
    OR (definition.type_id, definition.version) IN (
      SELECT
        type_id,
        version
      FROM
        last_retired
    )
  )
ORDER BY
  definition.type_id,
  definition.version
