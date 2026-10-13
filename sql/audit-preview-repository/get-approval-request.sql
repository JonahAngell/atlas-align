SELECT
  q.id,
  q.request_status,
  q.submitted_revision_id,
  r.revision_number,
  r.document,
  r.document_sha256
FROM
  atlas_audit_approval_requests q
  JOIN atlas_audit_revisions r ON r.id = q.submitted_revision_id
  AND r.audit_id = q.audit_id
WHERE
  q.audit_id = $1
  AND q.id = $2
