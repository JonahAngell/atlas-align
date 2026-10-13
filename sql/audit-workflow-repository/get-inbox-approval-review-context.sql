SELECT
  i.id AS "inboxItemId",
  i.audit_id AS "auditId",
  i.approval_request_id AS "requestId",
  i.item_status AS "itemStatus",
  q.request_status AS "requestStatus",
  q.submitted_revision_id AS "submittedRevisionId",
  a.current_revision_id AS "currentRevisionId",
  a.current_approval_request_id AS "currentRequestId",
  a.workflow_status AS "workflowStatus",
  q.selected_approver_user_id AS "selectedApproverUserId",
  q.selected_approver_username AS "selectedApproverUsername",
  rev.document
FROM
  atlas_inbox_items i
  JOIN atlas_audit_approval_requests q ON q.id = i.approval_request_id
  AND q.audit_id = i.audit_id
  JOIN atlas_audits a ON a.id = i.audit_id
  AND a.archived_at IS NULL
  JOIN atlas_audit_revisions rev ON rev.id = q.submitted_revision_id
  AND rev.audit_id = q.audit_id
WHERE
  i.id = $1
  AND (
    i.recipient_user_id = $2
    OR (
      i.recipient_user_id IS NULL
      AND lower(i.recipient_username) = lower($3)
    )
  )
