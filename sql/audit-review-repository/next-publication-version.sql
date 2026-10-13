SELECT
  COALESCE(max(version_number), 0)::integer + 1 AS next
FROM
  atlas_audit_publications
WHERE
  audit_id = $1
