SELECT
  a.*,
  rev.document,
  req.request_status AS current_request_status,
  req.submitted_revision_id AS current_request_revision_id,
  req.selected_approver_user_id AS current_request_approver_user_id,
  req.selected_approver_username AS current_request_approver_username
FROM
  atlas_audits a
  JOIN atlas_audit_revisions rev ON rev.id = a.current_revision_id
  LEFT JOIN atlas_audit_approval_requests req ON req.id = a.current_approval_request_id
  AND req.audit_id = a.id
WHERE
  a.id = $1
  AND a.archived_at IS NULL
