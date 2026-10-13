UPDATE atlas_audit_review_sessions
SET
  draft_version = draft_version + 1,
  resume_section = $3::text,
  resume_item_key = $4::text,
  updated_at = now()
WHERE
  id = $1::bigint
  AND draft_version = $2::bigint
  AND session_status = 'Draft'
RETURNING
  draft_version
