SELECT
  COALESCE(max(step_revision_number), 0)::integer + 1 AS next
FROM
  atlas_audit_step_revisions
WHERE
  audit_id = $1
  AND step_id = $2
