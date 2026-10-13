SELECT
  q.id,
  q.audit_id,
  q.submitted_revision_id,
  q.request_status,
  q.selected_approver_user_id,
  q.selected_approver_username,
  a.current_approval_request_id,
  a.workflow_status,
  r.document
FROM
  atlas_audit_approval_requests q
  JOIN atlas_audits a ON a.id = q.audit_id
  JOIN atlas_audit_revisions r ON r.id = q.submitted_revision_id
  AND r.audit_id = q.audit_id
WHERE
  q.audit_id = $1
  AND q.id = $2
