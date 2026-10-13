DELETE FROM atlas_audit_revisions
WHERE
  audit_id = $1
