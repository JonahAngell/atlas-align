SELECT
  s.*,
  r.document,
  q.request_status,
  q.selected_approver_user_id,
  q.selected_approver_username,
  a.current_revision_id,
  a.current_approval_request_id,
  a.workflow_status
FROM
  atlas_audit_review_sessions s
  JOIN atlas_audit_revisions r ON r.id = s.submitted_revision_id
  JOIN atlas_audit_approval_requests q ON q.id = s.approval_request_id
  JOIN atlas_audits a ON a.id = s.audit_id
WHERE
  s.id = $1
FOR UPDATE OF
  s,
  q,
  a
