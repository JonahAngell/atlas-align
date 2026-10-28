import {
  auditAccessForUser,
  isAssignedAnalyst,
} from "./audit-authorization.js";
import {
  SOURCE_LIBRARY_ADMIN_ROLE,
  ATLAS_ADMIN_ROLE,
} from "./00-global-variables.js";
import { documentHash } from "./canonical-json.js";
import { withTransaction } from "./db-transaction.js";
import { fail } from "./http-error.js";
import { loadSql } from "./sql.js";

const SQL = Object.freeze({
  lockAudit: loadSql(
    "../sql/audit-workflow-repository/lock-audit.sql",
    import.meta.url,
  ),
  recordAuditActivity: loadSql(
    "../sql/audit-workflow-repository/record-audit-activity.sql",
    import.meta.url,
  ),
  createInboxItem: loadSql(
    "../sql/audit-workflow-repository/create-inbox-item.sql",
    import.meta.url,
  ),
  resolveActionableInboxItems: loadSql(
    "../sql/audit-workflow-repository/resolve-actionable-inbox-items.sql",
    import.meta.url,
  ),
  invalidatePendingApprovalRequest: loadSql(
    "../sql/audit-workflow-repository/invalidate-pending-approval-request.sql",
    import.meta.url,
  ),
  invalidateActiveApproval: loadSql(
    "../sql/audit-workflow-repository/invalidate-active-approval.sql",
    import.meta.url,
  ),
  invalidateApprovedApprovalRequest: loadSql(
    "../sql/audit-workflow-repository/invalidate-approved-approval-request.sql",
    import.meta.url,
  ),
  resetAuditWorkflowAuthority: loadSql(
    "../sql/audit-workflow-repository/reset-audit-workflow-authority.sql",
    import.meta.url,
  ),
  createApprovalRequest: loadSql(
    "../sql/audit-workflow-repository/create-approval-request.sql",
    import.meta.url,
  ),
  setAuditPendingApproval: loadSql(
    "../sql/audit-workflow-repository/set-audit-pending-approval.sql",
    import.meta.url,
  ),
  lockApprovalRequestForRescind: loadSql(
    "../sql/audit-workflow-repository/lock-approval-request-for-decision.sql",
    import.meta.url,
  ),
  lockDraftReviewSessionForRescind: loadSql(
    "../sql/audit-workflow-repository/lock-draft-review-session-for-rescind.sql",
    import.meta.url,
  ),
  rescindApprovalRequest: loadSql(
    "../sql/audit-workflow-repository/rescind-approval-request.sql",
    import.meta.url,
  ),
  rescindReviewSession: loadSql(
    "../sql/audit-workflow-repository/rescind-review-session.sql",
    import.meta.url,
  ),
  resetAuditAfterRescind: loadSql(
    "../sql/audit-workflow-repository/reset-audit-after-rescind.sql",
    import.meta.url,
  ),
  lockApprovalRequestForDecision: loadSql(
    "../sql/audit-workflow-repository/lock-approval-request-for-decision.sql",
    import.meta.url,
  ),
  decideApprovalRequest: loadSql(
    "../sql/audit-workflow-repository/decide-approval-request.sql",
    import.meta.url,
  ),
  createApproval: loadSql(
    "../sql/audit-workflow-repository/create-approval.sql",
    import.meta.url,
  ),
  setAuditApproved: loadSql(
    "../sql/audit-workflow-repository/set-audit-approved.sql",
    import.meta.url,
  ),
  setAuditDraftAfterDenial: loadSql(
    "../sql/audit-workflow-repository/set-audit-draft-after-denial.sql",
    import.meta.url,
  ),
  lockApprovalForPublication: loadSql(
    "../sql/audit-workflow-repository/lock-approval-for-publication.sql",
    import.meta.url,
  ),
  nextPublicationVersion: loadSql(
    "../sql/audit-workflow-repository/next-publication-version.sql",
    import.meta.url,
  ),
  createPublication: loadSql(
    "../sql/audit-workflow-repository/create-publication.sql",
    import.meta.url,
  ),
  setAuditPublished: loadSql(
    "../sql/audit-workflow-repository/set-audit-published.sql",
    import.meta.url,
  ),
  shareLockCurrentRevision: loadSql(
    "../sql/audit-workflow-repository/share-lock-current-revision.sql",
    import.meta.url,
  ),
  createUnlockRevision: loadSql(
    "../sql/audit-workflow-repository/create-unlock-revision.sql",
    import.meta.url,
  ),
  createLockRevision: loadSql(
    "../sql/audit-workflow-repository/create-lock-revision.sql",
    import.meta.url,
  ),
  createLockPublication: loadSql(
    "../sql/audit-workflow-repository/create-lock-publication.sql",
    import.meta.url,
  ),
  setAuditLocked: loadSql(
    "../sql/audit-workflow-repository/set-audit-locked.sql",
    import.meta.url,
  ),
  setAuditDraftRevision: loadSql(
    "../sql/audit-workflow-repository/set-audit-draft-revision.sql",
    import.meta.url,
  ),
  getPublicationVersion: loadSql(
    "../sql/audit-workflow-repository/get-publication-version.sql",
    import.meta.url,
  ),
  lockPublicationForDelete: loadSql(
    "../sql/audit-workflow-repository/lock-publication-for-delete.sql",
    import.meta.url,
  ),
  softDeletePublication: loadSql(
    "../sql/audit-workflow-repository/soft-delete-publication.sql",
    import.meta.url,
  ),
  listAuditPublications: loadSql(
    "../sql/audit-workflow-repository/list-audit-publications.sql",
    import.meta.url,
  ),
  getAuditPublication: loadSql(
    "../sql/audit-workflow-repository/get-audit-publication.sql",
    import.meta.url,
  ),
  listAuditActivity: loadSql(
    "../sql/audit-workflow-repository/list-audit-activity.sql",
    import.meta.url,
  ),
  listAuditActivityAdmin: loadSql(
    "../sql/audit-workflow-repository/list-audit-activity-admin.sql",
    import.meta.url,
  ),
  getAuditWorkflowSummary: loadSql(
    "../sql/audit-workflow-repository/get-audit-workflow-summary.sql",
    import.meta.url,
  ),
  listInboxItems: loadSql(
    "../sql/audit-workflow-repository/list-inbox-items.sql",
    import.meta.url,
  ),
  getInboxUnreadCount: loadSql(
    "../sql/audit-workflow-repository/get-inbox-unread-count.sql",
    import.meta.url,
  ),
  markInboxItemRead: loadSql(
    "../sql/audit-workflow-repository/mark-inbox-item-read.sql",
    import.meta.url,
  ),
  getInboxApprovalReviewContext: loadSql(
    "../sql/audit-workflow-repository/get-inbox-approval-review-context.sql",
    import.meta.url,
  ),
});

function normalizeAssignments(v) {
  const a = v && typeof v === "object" ? v : {};
  return {
    assigned: Array.isArray(a.assigned) ? a.assigned : [],
    backup: Array.isArray(a.backup) ? a.backup : [],
    developer: Array.isArray(a.developer) ? a.developer : [],
  };
}

const actor = (user) => ({
  userId: user?.id || null,
  username: String(user?.username || "").trim(),
});
const clean = (v) => String(v || "").trim();
const LOCKED_DOCUMENT_STATUS = "Complete";
const UNLOCKED_DOCUMENT_STATUS = "Draft";
const AUDIT_LOCK_REASON = "Audit locked";
async function lockAudit(c, id) {
  const r = await c.query(SQL.lockAudit, [id]);
  if (!r.rowCount) throw fail(404, "Audit not found.");
  return r.rows[0];
}
function rowAudit(row) {
  return { ...row.document, workflowStatus: row.workflow_status };
}
function revision(row, expected) {
  if (Number(row.current_revision_id) !== Number(expected))
    throw fail(409, "The audit revision is stale.", {
      currentRevisionId: Number(row.current_revision_id),
    });
}
export async function recordAuditActivityWithClient(
  c,
  a,
  type,
  user,
  fields = {},
) {
  const p = actor(user);
  const authenticated = actor(user?.authenticatedActor || user);
  await c.query(SQL.recordAuditActivity, [
    a,
    type,
    p.userId,
    p.username || null,
    authenticated.userId,
    authenticated.username || null,
    fields.sourceRevisionId || null,
    fields.resultingRevisionId || null,
    fields.affectedStepId || null,
    fields.requestId || null,
    fields.approvalId || null,
    fields.publicationId || null,
    fields.versionNumber || null,
    fields.reason || null,
    fields.summary || null,
    JSON.stringify(fields.metadata || {}),
  ]);
}
async function inbox(
  c,
  {
    recipient,
    auditId,
    requestId,
    type,
    status = "Informational",
    metadata = {},
  },
) {
  await c.query(SQL.createInboxItem, [
    recipient.id || null,
    recipient.username,
    auditId,
    requestId,
    type,
    status,
    JSON.stringify(metadata),
  ]);
}
export async function resolveInboxItem(c, { auditId, requestId }) {
  await c.query(SQL.resolveActionableInboxItems, [auditId, requestId]);
}
export async function invalidateAuditRequest(
  c,
  { audit, user, reason = "Audit revision changed" },
) {
  if (!audit.current_approval_request_id) return null;
  const id = audit.current_approval_request_id;
  const r = await c.query(SQL.invalidatePendingApprovalRequest, [
    id,
    audit.id,
    user?.id || null,
    user?.username || null,
    reason,
  ]);
  if (r.rowCount) {
    await resolveInboxItem(c, { auditId: audit.id, requestId: id });
    await recordAuditActivityWithClient(
      c,
      audit.id,
      "approval.request_invalidated",
      user,
      {
        requestId: id,
        reason,
      },
    );
  }
  return r.rows[0] || null;
}
export async function invalidateAuditApproval(
  c,
  { audit, user, reason = "Audit revision changed" },
) {
  if (!audit.current_approval_id) return null;
  const id = audit.current_approval_id;
  const r = await c.query(SQL.invalidateActiveApproval, [
    id,
    audit.id,
    user?.id || null,
    user?.username || null,
    reason,
  ]);
  return r.rows[0] || null;
}
export async function invalidateWorkflowAuthorityWithClient(
  c,
  {
    auditRow,
    user,
    reason,
    restoration = false,
    resultingRevisionId = null,
    affectedStepId = null,
    sourceStepRevisionId = null,
    placementAdjustment = null,
  },
) {
  if (auditRow.workflow_status === "Pending Approval")
    await invalidateAuditRequest(c, { audit: auditRow, user, reason });
  if (auditRow.workflow_status === "Approved") {
    await invalidateAuditApproval(c, { audit: auditRow, user, reason });
    if (auditRow.current_approval_request_id)
      await c.query(SQL.invalidateApprovedApprovalRequest, [
        auditRow.current_approval_request_id,
        auditRow.id,
        user?.id || null,
        user?.username || null,
        reason,
      ]);
  }
  if (
    ["Pending Approval", "Approved", "Draft Revision"].includes(
      auditRow.workflow_status,
    ) ||
    restoration
  ) {
    await c.query(SQL.resetAuditWorkflowAuthority, [auditRow.id, restoration]);
    await recordAuditActivityWithClient(
      c,
      auditRow.id,
      restoration
        ? "approval.invalidated_by_restoration"
        : auditRow.workflow_status === "Approved"
          ? "workflow.approved_content_edited"
          : "workflow.submitted_content_edited",
      user,
      {
        sourceRevisionId: Number(auditRow.current_revision_id),
        resultingRevisionId,
        reason,
        affectedStepId,
        metadata: {
          restoration: Boolean(restoration),
          sourceStepRevisionId,
          placementAdjustment,
        },
      },
    );
  }
}
export async function submitAuditForApproval(
  pool,
  {
    auditId,
    expectedRevisionId,
    selectedApprover,
    requesterMessage,
    user,
    verifyUser,
  },
) {
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    const audit = rowAudit(a);
    if (!auditAccessForUser(user, audit).canSubmit)
      throw fail(403, "Only a current Assigned Analyst may submit this audit.");
    const approver = await verifyUser(selectedApprover);
    if (
      !approver?.active ||
      !approver.roles?.includes(ATLAS_ADMIN_ROLE) ||
      isAssignedAnalyst(approver, audit)
    )
      throw fail(403, "The selected approver is not eligible.");
    const p = actor(user);
    const readyDocument = structuredClone(a.document || {});
    readyDocument.status = "Ready for Review";
    const r = await c.query(SQL.createApprovalRequest, [
      auditId,
      p.userId,
      p.username,
      approver.id || null,
      approver.username,
      a.current_revision_id,
      clean(requesterMessage) || null,
      JSON.stringify(readyDocument),
      documentHash(readyDocument),
    ]);
    const req = r.rows[0];
    await inbox(c, {
      recipient: approver,
      auditId,
      requestId: req.id,
      type: "Approval Request",
      status: "Actionable",
      metadata: { revisionId: Number(a.current_revision_id) },
    });
    await c.query(SQL.setAuditPendingApproval, [auditId, req.id]);
    await recordAuditActivityWithClient(
      c,
      auditId,
      "approval.submission_requested",
      user,
      {
        requestId: req.id,
        sourceRevisionId: Number(a.current_revision_id),
      },
    );
    return { request: req, workflowStatus: "Pending Approval" };
  });
}
export async function rescindAuditApprovalRequest(
  pool,
  { auditId, requestId, expectedRevisionId, reason, user },
) {
  const rescindReason = clean(reason);
  if (!rescindReason) throw fail(400, "A rescission reason is required.");
  const id = Number(requestId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw fail(400, "Approval request identifier is invalid.");
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    const audit = rowAudit(a);
    if (
      !auditAccessForUser(user, audit, { exactRequest: true })
        .canRescindApprovalRequest
    )
      throw fail(
        403,
        "Only a current Assigned Analyst may rescind this approval request.",
      );
    const requestResult = await c.query(SQL.lockApprovalRequestForRescind, [
      id,
      auditId,
    ]);
    if (!requestResult.rowCount) throw fail(404, "Approval request not found.");
    const request = requestResult.rows[0];
    if (
      a.workflow_status !== "Pending Approval" ||
      request.request_status !== "Pending" ||
      Number(a.current_approval_request_id) !== id ||
      Number(request.submitted_revision_id) !== Number(a.current_revision_id)
    )
      throw fail(409, "Approval request is no longer active.", {
        currentRevisionId: Number(a.current_revision_id),
        currentRequestId: a.current_approval_request_id
          ? Number(a.current_approval_request_id)
          : null,
      });
    const sessionResult = await c.query(SQL.lockDraftReviewSessionForRescind, [
      auditId,
      id,
    ]);
    const p = actor(user);
    await c.query(SQL.rescindApprovalRequest, [
      id,
      auditId,
      p.userId,
      p.username,
      rescindReason,
    ]);
    if (sessionResult.rowCount)
      await c.query(SQL.rescindReviewSession, [sessionResult.rows[0].id]);
    await resolveInboxItem(c, { auditId, requestId: id });
    const workflowStatus = a.working_from_publication_id
      ? "Draft Revision"
      : "Draft";
    await c.query(SQL.resetAuditAfterRescind, [auditId, workflowStatus]);
    await recordAuditActivityWithClient(
      c,
      auditId,
      "approval.request_rescinded",
      user,
      {
        requestId: id,
        sourceRevisionId: Number(a.current_revision_id),
        reason: rescindReason,
        metadata: { reviewSessionId: sessionResult.rows[0]?.id || null },
      },
    );
    return {
      auditId,
      workflowStatus,
      currentRevisionId: Number(a.current_revision_id),
      request: { id, status: "Rescinded" },
      closedReviewSessionId: sessionResult.rows[0]?.id || null,
    };
  });
}
async function decision(
  pool,
  {
    auditId,
    requestId,
    expectedRevisionId,
    response,
    user,
    verifyUser,
    approved,
  },
) {
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    const q = await c.query(SQL.lockApprovalRequestForDecision, [
      requestId,
      auditId,
    ]);
    const req = q.rows[0];
    if (
      !req ||
      req.request_status !== "Pending" ||
      Number(a.current_approval_request_id) !== Number(requestId) ||
      Number(req.submitted_revision_id) !== Number(a.current_revision_id)
    )
      throw fail(409, "The approval request is no longer current.", {
        currentRequestId: a.current_approval_request_id,
      });
    const fresh = await verifyUser(user);
    const context = {
      selectedApprover: {
        id: req.selected_approver_user_id,
        username: req.selected_approver_username,
      },
      exactRevision: true,
      exactRequest: true,
    };
    if (!auditAccessForUser(fresh, rowAudit(a), context).canApprove)
      throw fail(403, "This user cannot decide the approval request.");
    if (!approved && !clean(response))
      throw fail(400, "A reviewer response is required when denying an audit.");
    const p = actor(fresh);
    await c.query(SQL.decideApprovalRequest, [
      requestId,
      auditId,
      approved ? "Approved" : "Denied",
      clean(response) || null,
      p.userId,
      p.username,
    ]);
    let approval = null;
    if (approved) {
      const x = await c.query(SQL.createApproval, [
        auditId,
        a.current_revision_id,
        requestId,
        p.userId,
        p.username,
        clean(response) || null,
      ]);
      approval = x.rows[0];
      await c.query(SQL.setAuditApproved, [auditId, approval.id]);
    } else await c.query(SQL.setAuditDraftAfterDenial, [auditId]);
    await resolveInboxItem(c, { auditId, requestId });
    await inbox(c, {
      recipient: {
        id: req.requester_user_id,
        username: req.requester_username,
      },
      auditId,
      requestId,
      type: "Approval Decision",
      metadata: { decision: approved ? "Approved" : "Denied" },
    });
    await recordAuditActivityWithClient(
      c,
      auditId,
      approved ? "approval.request_approved" : "approval.request_denied",
      fresh,
      {
        requestId,
        approvalId: approval?.id,
        sourceRevisionId: Number(a.current_revision_id),
      },
    );
    return {
      workflowStatus: approved ? "Approved" : "Draft",
      requestId: Number(requestId),
      approval,
    };
  });
}
export const approveAuditRevision = async () => {
  throw fail(
    409,
    "Approval must be completed through the item-level review session.",
  );
};
export const denyAuditRevision = (pool, o) =>
  decision(pool, { ...o, approved: false });
export async function publishAuditRevision(
  pool,
  {
    auditId,
    expectedRevisionId,
    expectedApprovalId,
    versionTitle,
    description,
    changeSummary,
    user,
    verifyUser,
  },
) {
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    if (!clean(versionTitle)) throw fail(400, "Version title is required.");
    const ap = (
      await c.query(SQL.lockApprovalForPublication, [
        expectedApprovalId,
        auditId,
      ])
    ).rows[0];
    const fresh = await verifyUser(user);
    if (
      !ap ||
      ap.approval_status !== "Active" ||
      Number(a.current_approval_id) !== Number(ap.id) ||
      Number(ap.approved_revision_id) !== Number(a.current_revision_id)
    )
      throw fail(409, "The approval is no longer current.", {
        currentApprovalId: a.current_approval_id,
      });
    if (
      !auditAccessForUser(fresh, rowAudit(a), {
        exactRevision: true,
        exactApproval: true,
      }).canPublish
    )
      throw fail(403, "This user cannot publish the audit.");
    const n = (await c.query(SQL.nextPublicationVersion, [auditId])).rows[0]
      .next;
    const p = actor(fresh),
      assign = normalizeAssignments(a.document.assignments);
    const x = await c.query(SQL.createPublication, [
      auditId,
      n,
      clean(versionTitle),
      clean(description) || null,
      clean(changeSummary) || null,
      a.current_revision_id,
      ap.id,
      JSON.stringify(a.document),
      documentHash(a.document),
      JSON.stringify(assign),
      ap.approving_user_id,
      ap.approving_username,
      p.userId,
      p.username,
    ]);
    const pub = x.rows[0];
    await c.query(SQL.setAuditPublished, [auditId, pub.id]);
    await recordAuditActivityWithClient(c, auditId, "audit.published", fresh, {
      approvalId: ap.id,
      publicationId: pub.id,
      versionNumber: n,
      sourceRevisionId: Number(a.current_revision_id),
    });
    return { publication: pub, workflowStatus: "Published" };
  });
}
/**
 * Locks the current revision from any unlocked workflow state. The audit
 * document status becomes Complete in a new revision, which is published as a
 * numbered Manual snapshot and leaves the audit read-only until unlocked. A
 * pending request is invalidated; an active approval is kept as the source.
 */
export async function lockAuditRevision(
  pool,
  { auditId, expectedRevisionId, user, verifyUser },
) {
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    if (a.workflow_status === "Published")
      throw fail(409, "The audit is already locked.", {
        currentPublicationId: a.current_publication_id,
      });
    const fresh = await verifyUser(user);
    if (!auditAccessForUser(fresh, rowAudit(a)).canLock)
      throw fail(403, "This user cannot lock the audit.");
    let approval = null;
    if (a.workflow_status === "Pending Approval") {
      const sessionResult = await c.query(
        SQL.lockDraftReviewSessionForRescind,
        [auditId, a.current_approval_request_id],
      );
      await invalidateAuditRequest(c, {
        audit: a,
        user: fresh,
        reason: AUDIT_LOCK_REASON,
      });
      if (sessionResult.rowCount)
        await c.query(SQL.rescindReviewSession, [sessionResult.rows[0].id]);
    } else if (a.workflow_status === "Approved" && a.current_approval_id) {
      const ap = (
        await c.query(SQL.lockApprovalForPublication, [
          a.current_approval_id,
          auditId,
        ])
      ).rows[0];
      if (ap?.approval_status === "Active") approval = ap;
    }
    const who = actor(fresh);
    const lockedDocument = structuredClone(a.document || {});
    lockedDocument.status = LOCKED_DOCUMENT_STATUS;
    const lockedHash = documentHash(lockedDocument);
    const newRevision = (
      await c.query(SQL.createLockRevision, [
        auditId,
        Number(a.current_revision_number) + 1,
        a.current_revision_id,
        JSON.stringify(lockedDocument),
        lockedHash,
        AUDIT_LOCK_REASON,
        who.userId,
        who.username,
      ])
    ).rows[0];
    const versionNumber = (
      await c.query(SQL.nextPublicationVersion, [auditId])
    ).rows[0].next;
    const publication = (
      await c.query(SQL.createLockPublication, [
        auditId,
        versionNumber,
        `Locked version ${versionNumber}`,
        newRevision.id,
        approval?.id || null,
        JSON.stringify(lockedDocument),
        lockedHash,
        JSON.stringify(normalizeAssignments(a.document?.assignments)),
        approval?.approving_user_id || null,
        approval?.approving_username || null,
        who.userId,
        who.username,
      ])
    ).rows[0];
    await c.query(SQL.setAuditLocked, [
      auditId,
      newRevision.id,
      newRevision.revision_number,
      publication.id,
      approval ? a.current_approval_request_id : null,
      approval?.id || null,
    ]);
    await recordAuditActivityWithClient(c, auditId, "audit.locked", fresh, {
      approvalId: approval?.id || null,
      publicationId: publication.id,
      versionNumber,
      sourceRevisionId: Number(a.current_revision_id),
      resultingRevisionId: Number(newRevision.id),
      metadata: {
        previousWorkflowStatus: a.workflow_status,
        previousDocumentStatus: a.document?.status || null,
      },
    });
    return {
      auditId,
      workflowStatus: "Published",
      currentRevisionId: Number(newRevision.id),
      revisionNumber: Number(newRevision.revision_number),
      publication: {
        id: Number(publication.id),
        versionNumber: Number(versionNumber),
      },
    };
  });
}
export async function unlockPublishedAudit(
  pool,
  {
    auditId,
    expectedRevisionId,
    expectedPublicationId,
    reason,
    user,
    verifyUser,
  },
) {
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    revision(a, expectedRevisionId);
    if (!clean(reason)) throw fail(400, "An unlock reason is required.");
    if (
      Number(a.current_publication_id) !== Number(expectedPublicationId) ||
      a.workflow_status !== "Published"
    )
      throw fail(409, "The publication is no longer current.", {
        currentPublicationId: a.current_publication_id,
      });
    const fresh = await verifyUser(user);
    if (
      !auditAccessForUser(fresh, rowAudit(a), { exactPublication: true })
        .canUnlock
    )
      throw fail(403, "This user cannot unlock the audit.");
    const sourceRevision = (
      await c.query(SQL.shareLockCurrentRevision, [
        a.current_revision_id,
        auditId,
      ])
    ).rows[0];
    if (!sourceRevision)
      throw fail(409, "The current revision is unavailable.");
    const nextRevisionNumber = Number(a.current_revision_number) + 1;
    const who = actor(fresh);
    // Unlocking returns the audit document to Draft for further editing.
    const unlockedDocument = structuredClone(sourceRevision.document || {});
    unlockedDocument.status = UNLOCKED_DOCUMENT_STATUS;
    const newRevision = (
      await c.query(SQL.createUnlockRevision, [
        auditId,
        nextRevisionNumber,
        a.current_revision_id,
        JSON.stringify(unlockedDocument),
        documentHash(unlockedDocument),
        clean(reason),
        who.userId,
        who.username,
      ])
    ).rows[0];
    await c.query(SQL.setAuditDraftRevision, [
      auditId,
      newRevision.id,
      newRevision.revision_number,
    ]);
    await recordAuditActivityWithClient(
      c,
      auditId,
      "audit.published_unlocked",
      fresh,
      {
        publicationId: Number(expectedPublicationId),
        versionNumber: (
          await c.query(SQL.getPublicationVersion, [expectedPublicationId])
        ).rows[0].version_number,
        sourceRevisionId: Number(a.current_revision_id),
        resultingRevisionId: Number(newRevision.id),
        reason: clean(reason) || null,
      },
    );
    return {
      auditId,
      workflowStatus: "Draft Revision",
      workingFromPublicationId: Number(expectedPublicationId),
      currentRevisionId: Number(newRevision.id),
      revisionNumber: Number(newRevision.revision_number),
    };
  });
}
export async function softDeleteAuditPublication(
  pool,
  {
    auditId,
    versionNumber,
    expectedPublicationId,
    expectedRevisionId,
    confirmation,
    reason,
    user,
  },
) {
  if (confirmation !== true)
    throw fail(400, "Explicit confirmation is required.");
  if (!clean(reason)) throw fail(400, "A deletion reason is required.");
  return withTransaction(pool, async (c) => {
    const a = await lockAudit(c, auditId);
    if (!auditAccessForUser(user, rowAudit(a)).canDeletePublication)
      throw fail(403, "The atlas-align-admin role is required.");
    if (Number(a.current_revision_id) !== Number(expectedRevisionId))
      throw fail(409, "The audit revision is stale.", {
        currentRevisionId: Number(a.current_revision_id),
      });
    const p = (
      await c.query(SQL.lockPublicationForDelete, [auditId, versionNumber])
    ).rows[0];
    if (!p) throw fail(404, "Publication not found.");
    if (
      p.deletion_status !== "Active" ||
      Number(p.id) !== Number(expectedPublicationId)
    )
      throw fail(409, "The publication lifecycle state is stale.", {
        currentPublicationId: p.id,
      });
    const u = actor(user);
    await c.query(SQL.softDeletePublication, [
      auditId,
      p.id,
      u.userId,
      u.username,
      clean(reason),
    ]);
    await recordAuditActivityWithClient(
      c,
      auditId,
      "publication.sent_to_recently_deleted",
      user,
      {
        publicationId: p.id,
        versionNumber: p.version_number,
        reason: clean(reason),
      },
    );
    return {
      auditId,
      versionNumber: Number(versionNumber),
      deletionStatus: "Recently Deleted",
    };
  });
}
export async function listAuditPublications(
  pool,
  { auditId, user, limit = 50, lifecycle = "Active" },
) {
  const a = await getAuditWorkflowSummary(pool, { auditId, user });
  if (!a.capabilities.canViewHistory)
    throw fail(403, "Audit history access is required.");
  const deletionStatus =
    lifecycle === "Recently Deleted" ? "Recently Deleted" : "Active";
  if (
    deletionStatus === "Recently Deleted" &&
    !a.capabilities.canDeletePublication
  )
    throw fail(403, "The atlas-align-admin role is required.");
  const r = await pool.query(SQL.listAuditPublications, [
    auditId,
    deletionStatus,
    Math.min(100, Math.max(1, Number(limit) || 50)),
  ]);
  return r.rows;
}
export async function getAuditPublication(
  pool,
  { auditId, versionNumber, user },
) {
  const a = await getAuditWorkflowSummary(pool, { auditId, user });
  if (!a.capabilities.canViewHistory)
    throw fail(403, "Audit history access is required.");
  const r = await pool.query(SQL.getAuditPublication, [auditId, versionNumber]);
  const p = r.rows[0];
  if (
    !p ||
    (p.deletion_status === "Recently Deleted" &&
      !a.capabilities.canDeletePublication)
  )
    return null;
  return p;
}
export async function listAuditActivity(
  pool,
  { auditId, user, limit = 100, beforeId = null },
) {
  const a = await getAuditWorkflowSummary(pool, { auditId, user });
  if (!a.capabilities.canViewHistory)
    throw fail(403, "Audit history access is required.");
  const r = await pool.query(
    (user?.resolvedRoleSlugs || []).includes("atlas-align-admin")
      ? SQL.listAuditActivityAdmin
      : SQL.listAuditActivity,
    [auditId, beforeId, Math.min(100, Math.max(1, Number(limit) || 50))],
  );
  return r.rows;
}
export async function getAuditWorkflowSummary(pool, { auditId, user }) {
  const r = await pool.query(SQL.getAuditWorkflowSummary, [auditId]);
  if (!r.rowCount) throw fail(404, "Audit not found.");
  const a = r.rows[0],
    audit = rowAudit(a),
    currentRequest = a.current_approval_request_id
      ? {
          id: Number(a.current_approval_request_id),
          status: a.current_request_status,
          submittedRevisionId: Number(a.current_request_revision_id),
          selectedApprover: {
            id: a.current_request_approver_user_id,
            username: a.current_request_approver_username,
          },
        }
      : null,
    pendingRequest = currentRequest?.status === "Pending",
    capabilities = auditAccessForUser(user, audit, {
      selectedApprover: currentRequest?.selectedApprover || null,
      // Only a pending request pins a revision. Drafts, and drafts reopened
      // after a denied or rescinded request, are always the exact revision.
      exactRevision:
        !pendingRequest ||
        currentRequest.submittedRevisionId === Number(a.current_revision_id),
      exactRequest: pendingRequest,
    });
  return {
    auditId: a.id,
    workflowStatus: a.workflow_status,
    currentRevisionId: Number(a.current_revision_id),
    currentRevisionNumber: a.current_revision_number,
    revisionCycleNumber: a.revision_cycle_number,
    publishedLocked: a.published_locked,
    currentRequestId: a.current_approval_request_id
      ? Number(a.current_approval_request_id)
      : null,
    currentApprovalId: a.current_approval_id
      ? Number(a.current_approval_id)
      : null,
    currentPublicationId: a.current_publication_id
      ? Number(a.current_publication_id)
      : null,
    workingFromPublicationId: a.working_from_publication_id
      ? Number(a.working_from_publication_id)
      : null,
    capabilities,
  };
}
export async function listInboxItems(
  pool,
  { user, limit = 50, beforeId = null },
) {
  const r = await pool.query(SQL.listInboxItems, [
    user.id,
    user.username,
    beforeId,
    Math.min(100, Math.max(1, Number(limit) || 50)),
  ]);
  return r.rows;
}
export async function getInboxUnreadCount(pool, { user }) {
  const result = await pool.query(SQL.getInboxUnreadCount, [
    user.id,
    user.username,
  ]);
  return Number(result.rows[0]?.unreadCount || 0);
}

export async function markInboxItemRead(pool, { itemId, user }) {
  const r = await pool.query(SQL.markInboxItemRead, [
    itemId,
    user.id,
    user.username,
  ]);
  return r.rows[0] || null;
}
export async function getInboxApprovalReviewContext(pool, { itemId, user }) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw fail(400, "Inbox item identifier is invalid.");
  const result = await pool.query(SQL.getInboxApprovalReviewContext, [
    id,
    user.id,
    user.username,
  ]);
  if (!result.rowCount)
    throw fail(404, "Inbox approval request was not found or is unavailable.");
  const row = result.rows[0];
  if (
    row.itemStatus !== "Actionable" ||
    row.requestStatus !== "Pending" ||
    row.workflowStatus !== "Pending Approval" ||
    Number(row.currentRequestId) !== Number(row.requestId)
  )
    throw fail(409, "This approval request is no longer actionable.", {
      currentRequestId: row.currentRequestId,
    });
  const selectedApprover = {
    id: row.selectedApproverUserId,
    username: row.selectedApproverUsername,
  };
  if (
    !auditAccessForUser(
      user,
      { ...row.document, workflowStatus: row.workflowStatus },
      {
        selectedApprover,
        exactRevision: true,
        exactRequest: true,
      },
    ).canApprove
  )
    throw fail(
      403,
      "This approval request is not assigned to the signed-in user.",
    );
  return {
    inboxItemId: Number(row.inboxItemId),
    auditId: row.auditId,
    requestId: Number(row.requestId),
    submittedRevisionId: Number(row.submittedRevisionId),
    currentRevisionId: Number(row.currentRevisionId),
  };
}
