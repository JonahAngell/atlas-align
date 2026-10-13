SELECT
  i.id,
  i.audit_id AS "auditId",
  i.approval_request_id AS "approvalRequestId",
  i.item_type AS "itemType",
  i.item_status AS "itemStatus",
  i.read_state AS "readState",
  i.display_metadata AS "displayMetadata",
  i.created_at AS "createdAt",
  a.name AS "auditName",
  a.workflow_status AS "workflowStatus",
  q.requester_username AS "senderUsername",
  q.selected_approver_username AS "approverUsername"
FROM
  atlas_inbox_items i
  JOIN atlas_audits a ON a.id = i.audit_id
  JOIN atlas_audit_approval_requests q ON q.id = i.approval_request_id
  AND q.audit_id = i.audit_id
WHERE
  (
    i.recipient_user_id = $1
    OR (
      i.recipient_user_id IS NULL
      AND lower(i.recipient_username) = lower($2)
    )
  )
  AND (
    $3::bigint IS NULL
    OR i.id < $3
  )
ORDER BY
  i.id DESC
LIMIT
  $4
