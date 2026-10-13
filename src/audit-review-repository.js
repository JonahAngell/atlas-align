import crypto from "node:crypto";
import { auditAccessForUser } from "./audit-authorization.js";
import { classifyCanonicalChanges } from "./audit-comparison.js";
import { ensureReviewObjectLinksWithClient } from "./audit-discussion-repository.js";
import { fail } from "./http-error.js";
import { loadSql } from "./sql.js";

const SQL = Object.freeze({
  getApprovalAuthority: loadSql(
    "../sql/audit-review-repository/get-approval-authority.sql",
    import.meta.url,
  ),
  getApprovalAuthorityForUpdate: loadSql(
    "../sql/audit-review-repository/get-approval-authority-for-update.sql",
    import.meta.url,
  ),
  openReviewSession: loadSql(
    "../sql/audit-review-repository/open-review-session.sql",
    import.meta.url,
  ),
  getReturnedReviewBaseline: loadSql(
    "../sql/audit-review-repository/get-returned-review-baseline.sql",
    import.meta.url,
  ),
  upsertReviewItem: loadSql(
    "../sql/audit-review-repository/upsert-review-item.sql",
    import.meta.url,
  ),
  getAuditReviewSession: loadSql(
    "../sql/audit-review-repository/get-audit-review-session.sql",
    import.meta.url,
  ),
  getAuditReviewItems: loadSql(
    "../sql/audit-review-repository/get-audit-review-items.sql",
    import.meta.url,
  ),
  lockReviewSessionForSave: loadSql(
    "../sql/audit-review-repository/lock-review-session-for-save.sql",
    import.meta.url,
  ),
  lockReviewItemForSave: loadSql(
    "../sql/audit-review-repository/lock-review-item-for-save.sql",
    import.meta.url,
  ),
  updateReviewItemDecision: loadSql(
    "../sql/audit-review-repository/update-review-item-decision.sql",
    import.meta.url,
  ),
  updateReviewSessionDraft: loadSql(
    "../sql/audit-review-repository/update-review-session-draft.sql",
    import.meta.url,
  ),
  getReviewThreadSummary: loadSql(
    "../sql/audit-review-repository/get-review-thread-summary.sql",
    import.meta.url,
  ),
  getReviewThreadSummaryForUpdate: loadSql(
    "../sql/audit-review-repository/get-review-thread-summary-for-update.sql",
    import.meta.url,
  ),
  getSessionItems: loadSql(
    "../sql/audit-review-repository/get-session-items.sql",
    import.meta.url,
  ),
  lockReturnReviewSession: loadSql(
    "../sql/audit-review-repository/lock-return-review-session.sql",
    import.meta.url,
  ),
  markReviewSessionReturned: loadSql(
    "../sql/audit-review-repository/mark-review-session-returned.sql",
    import.meta.url,
  ),
  denyApprovalRequest: loadSql(
    "../sql/audit-review-repository/deny-approval-request.sql",
    import.meta.url,
  ),
  resolveApprovalInboxItems: loadSql(
    "../sql/audit-review-repository/resolve-approval-inbox-items.sql",
    import.meta.url,
  ),
  setAuditDraftRevision: loadSql(
    "../sql/audit-review-repository/set-audit-draft-revision.sql",
    import.meta.url,
  ),
  createReturnedReviewInboxItem: loadSql(
    "../sql/audit-review-repository/create-returned-review-inbox-item.sql",
    import.meta.url,
  ),
  recordReturnedReviewActivity: loadSql(
    "../sql/audit-review-repository/record-returned-review-activity.sql",
    import.meta.url,
  ),
  getReturnedReviewFeedback: loadSql(
    "../sql/audit-review-repository/get-returned-review-feedback.sql",
    import.meta.url,
  ),
  getPreviousReturnedReviewSession: loadSql(
    "../sql/audit-review-repository/get-previous-returned-review-session.sql",
    import.meta.url,
  ),
  getCurrentReviewSession: loadSql(
    "../sql/audit-review-repository/get-current-review-session.sql",
    import.meta.url,
  ),
  getBaselineRevision: loadSql(
    "../sql/audit-review-repository/get-baseline-revision.sql",
    import.meta.url,
  ),
  carryForwardReviewItem: loadSql(
    "../sql/audit-review-repository/carry-forward-review-item.sql",
    import.meta.url,
  ),
  linkSourceReviewSession: loadSql(
    "../sql/audit-review-repository/link-source-review-session.sql",
    import.meta.url,
  ),
  lockFinalReviewSession: loadSql(
    "../sql/audit-review-repository/lock-final-review-session.sql",
    import.meta.url,
  ),
  lockFinalAudit: loadSql(
    "../sql/audit-review-repository/lock-final-audit.sql",
    import.meta.url,
  ),
  lockFinalApprovalRequest: loadSql(
    "../sql/audit-review-repository/lock-final-approval-request.sql",
    import.meta.url,
  ),
  shareLockSubmittedRevision: loadSql(
    "../sql/audit-review-repository/share-lock-submitted-revision.sql",
    import.meta.url,
  ),
  createAuditApproval: loadSql(
    "../sql/audit-review-repository/create-audit-approval.sql",
    import.meta.url,
  ),
  nextPublicationVersion: loadSql(
    "../sql/audit-review-repository/next-publication-version.sql",
    import.meta.url,
  ),
  createAuditPublication: loadSql(
    "../sql/audit-review-repository/create-audit-publication.sql",
    import.meta.url,
  ),
  approveApprovalRequest: loadSql(
    "../sql/audit-review-repository/approve-approval-request.sql",
    import.meta.url,
  ),
  markReviewSessionApproved: loadSql(
    "../sql/audit-review-repository/mark-review-session-approved.sql",
    import.meta.url,
  ),
  publishAudit: loadSql(
    "../sql/audit-review-repository/publish-audit.sql",
    import.meta.url,
  ),
  resolveFinalApprovalInboxItems: loadSql(
    "../sql/audit-review-repository/resolve-final-approval-inbox-items.sql",
    import.meta.url,
  ),
  createApprovalDecisionInboxItem: loadSql(
    "../sql/audit-review-repository/create-approval-decision-inbox-item.sql",
    import.meta.url,
  ),
  recordFinalizedReviewActivity: loadSql(
    "../sql/audit-review-repository/record-finalized-review-activity.sql",
    import.meta.url,
  ),
});

const text = (v) => String(v ?? "").trim();
const canonical = (v) => JSON.stringify(v, Object.keys(v || {}).sort());
const hash = (v) =>
  crypto
    .createHash("sha256")
    .update(typeof v === "string" ? v : canonical(v))
    .digest("hex");
export function buildAuditReviewItems(document, options = {}) {
  const auditId = text(options.auditId || document?.id);
  return classifyCanonicalChanges(options.baselineDocument || null, document, {
    auditId,
  }).map((object) => ({
    sectionKey: object.sectionKey,
    itemType: object.itemType,
    stableItemKey: object.stableItemKey,
    canonicalObjectKey: object.canonicalObjectKey,
    identityVersion: object.identityVersion,
    displayLabel: object.displayLabel,
    semanticFingerprint: object.semanticFingerprint,
    canonicalOrder: object.canonicalOrder,
    parentItemKey: object.parentObjectKey,
    linkedItemKey: object.linkedObjectKey,
    isDirect: object.isDirect,
    severity: object.severity,
    isDeleted: object.isDeleted,
    changeType: object.changeType,
    changeReasonCodes: object.changeReasonCodes,
    changeSummary: object.changeSummary,
    priorObjectSummary: object.priorObjectSummary,
    submittedObjectSummary: object.submittedObjectSummary,
  }));
}

async function authority(client, { auditId, requestId, user, lock = false }) {
  const q = await client.query(
    lock ? SQL.getApprovalAuthorityForUpdate : SQL.getApprovalAuthority,
    [auditId, requestId],
  );
  if (!q.rowCount) throw fail(404, "Approval request is unavailable.");
  const row = q.rows[0];
  if (
    row.request_status !== "Pending" ||
    row.workflow_status !== "Pending Approval" ||
    Number(row.current_approval_request_id) !== Number(row.id)
  )
    throw fail(409, "Approval request is no longer active.");
  const access = auditAccessForUser(
    user,
    { ...row.document, workflowStatus: row.workflow_status },
    {
      selectedApprover: {
        id: row.selected_approver_user_id,
        username: row.selected_approver_username,
      },
      exactRevision: true,
      exactRequest: true,
    },
  );
  if (!access.canApprove)
    throw fail(403, "This review is not assigned to the signed-in user.");
  return row;
}
const reviewerKey = (u) => text(u?.username || u?.email || u?.id);
export async function openAuditReview(pool, { auditId, requestId, user }) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const a = await authority(c, { auditId, requestId, user, lock: true });
    const rk = reviewerKey(user);
    let s = await c.query(SQL.openReviewSession, [
      auditId,
      requestId,
      a.submitted_revision_id,
      user.id || null,
      rk,
    ]);
    const session = s.rows[0];
    const baselineResult = await c.query(SQL.getReturnedReviewBaseline, [
      auditId,
      a.submitted_revision_id,
    ]);
    const items = buildAuditReviewItems(a.document, {
      auditId,
      baselineDocument: baselineResult.rows[0]?.document || null,
    });
    for (const x of items)
      await c.query(SQL.upsertReviewItem, [
        session.id,
        x.sectionKey,
        x.itemType,
        x.stableItemKey,
        x.canonicalObjectKey,
        x.identityVersion,
        x.displayLabel,
        x.semanticFingerprint,
        x.canonicalOrder,
        x.parentItemKey || null,
        x.linkedItemKey || null,
        x.isDirect !== false,
        x.severity || null,
        x.isDeleted === true,
        x.changeType,
        JSON.stringify(x.changeReasonCodes || []),
        x.changeSummary,
        x.priorObjectSummary == null
          ? null
          : JSON.stringify(x.priorObjectSummary),
        x.submittedObjectSummary == null
          ? null
          : JSON.stringify(x.submittedObjectSummary),
      ]);
    await carryForwardReviewItemsWithClient(c, {
      auditId,
      requestId,
      submittedRevisionId: Number(a.submitted_revision_id),
      document: a.document,
    });
    await ensureReviewObjectLinksWithClient(c, { sessionId: session.id });
    await c.query("COMMIT");
    return getAuditReview(pool, { sessionId: session.id, user });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
function progress(items) {
  const sections = {};
  for (const i of items) {
    if (!i.isDirect) continue;
    const s = (sections[i.sectionKey] ||= {
      total: 0,
      decided: 0,
      remaining: 0,
      approved: 0,
      requestChanges: 0,
      needsDiscussion: 0,
      complete: false,
    });
    s.total++;
    if (i.decision) {
      s.decided++;
      if (i.decision === "Approve") s.approved++;
      if (i.decision === "Request changes") s.requestChanges++;
      if (i.decision === "Needs discussion") s.needsDiscussion++;
    }
    s.remaining = s.total - s.decided;
    s.complete = s.remaining === 0;
  }
  const all = Object.values(sections);
  return {
    sections,
    total: all.reduce((n, s) => n + s.total, 0),
    decided: all.reduce((n, s) => n + s.decided, 0),
    ready: all.every((s) => s.complete),
  };
}
export async function getAuditReview(pool, { sessionId, user }) {
  const s = await pool.query(SQL.getAuditReviewSession, [
    sessionId,
    reviewerKey(user),
  ]);
  if (!s.rowCount) throw fail(404, "Review session is unavailable.");
  const q = await pool.query(SQL.getAuditReviewItems, [sessionId]);
  return {
    session: {
      id: Number(s.rows[0].id),
      auditId: s.rows[0].audit_id,
      requestId: Number(s.rows[0].approval_request_id),
      submittedRevisionId: Number(s.rows[0].submitted_revision_id),
      sessionStatus: s.rows[0].session_status,
      draftVersion: Number(s.rows[0].draft_version),
      resumeSection: s.rows[0].resume_section,
      resumeItemKey: s.rows[0].resume_item_key,
    },
    document: structuredClone(s.rows[0].document),
    items: q.rows,
    progress: progress(q.rows),
  };
}
export async function saveAuditReview(
  pool,
  {
    sessionId,
    user,
    expectedVersion,
    changes = [],
    resumeSection = null,
    resumeItemKey = null,
  },
) {
  const id = Number(sessionId);
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw fail(400, "Review session identity is invalid.");
  if (!Number.isSafeInteger(version) || version <= 0)
    throw fail(400, "Review draft version is invalid.");
  if (!Array.isArray(changes))
    throw fail(400, "Review changes must be an array.");
  const normalizedResumeSection = text(resumeSection) || null;
  const normalizedResumeItemKey = text(resumeItemKey) || null;
  const normalizedChanges = changes.map((change) => {
    if (!change || typeof change !== "object")
      throw fail(400, "Review change is invalid.");
    const sectionKey = text(change.sectionKey);
    const stableItemKey = text(change.stableItemKey);
    if (!sectionKey || !stableItemKey)
      throw fail(400, "Review item identity is invalid.");
    const decision = change.decision == null ? null : text(change.decision);
    if (
      decision &&
      !["Approve", "Request changes", "Needs discussion"].includes(decision)
    )
      throw fail(400, "Review decision is invalid.");
    return {
      sectionKey,
      stableItemKey,
      decision,
      reviewerNote: text(change.reviewerNote) || null,
    };
  });
  const c = await pool.connect();
  let committed = false;
  try {
    await c.query("BEGIN");
    const session = await c.query(SQL.lockReviewSessionForSave, [
      id,
      reviewerKey(user),
    ]);
    if (!session.rowCount) throw fail(404, "Review session is unavailable.");
    await authority(c, {
      auditId: session.rows[0].audit_id,
      requestId: session.rows[0].approval_request_id,
      user,
      lock: true,
    });
    if (Number(session.rows[0].draft_version) !== version)
      throw fail(409, "Review draft changed in another session.", {
        draftVersion: Number(session.rows[0].draft_version),
      });
    for (const change of normalizedChanges) {
      const found = await c.query(SQL.lockReviewItemForSave, [
        id,
        change.sectionKey,
        change.stableItemKey,
      ]);
      if (!found.rowCount)
        throw fail(404, "Review item is unavailable.", {
          sectionKey: change.sectionKey,
          stableItemKey: change.stableItemKey,
        });
      if (!found.rows[0].is_direct)
        throw fail(400, "Generated review items cannot be decided directly.");
      if (
        (["Request changes", "Needs discussion"].includes(change.decision) ||
          (change.decision === "Approve" &&
            found.rows[0].severity === "warning")) &&
        !change.reviewerNote
      )
        throw fail(400, "A reviewer note is required for this decision.", {
          sectionKey: change.sectionKey,
          stableItemKey: change.stableItemKey,
        });
      const updated = await c.query(SQL.updateReviewItemDecision, [
        id,
        change.sectionKey,
        change.stableItemKey,
        change.decision,
        change.reviewerNote,
      ]);
      if (updated.rowCount !== 1)
        throw fail(409, "Review item changed while the draft was being saved.");
    }
    const updatedSession = await c.query(SQL.updateReviewSessionDraft, [
      id,
      version,
      normalizedResumeSection,
      normalizedResumeItemKey,
    ]);
    if (updatedSession.rowCount !== 1)
      throw fail(409, "Review draft changed in another session.");
    await c.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
  // Fetch only after releasing the transaction client. This avoids exhausting a
  // single-connection pool while getAuditReview() obtains its own connection.
  return getAuditReview(pool, { sessionId: id, user });
}
export async function bulkApproveAuditReview(
  pool,
  { sessionId, user, expectedVersion, sectionKey },
) {
  const current = await getAuditReview(pool, { sessionId, user });
  const changes = current.items
    .filter(
      (i) =>
        i.sectionKey === sectionKey &&
        i.isDirect &&
        !i.decision &&
        i.severity !== "warning" &&
        i.severity !== "critical",
    )
    .map((i) => ({
      sectionKey,
      stableItemKey: i.stableItemKey,
      decision: "Approve",
      reviewerNote: "",
    }));
  return saveAuditReview(pool, {
    sessionId,
    user,
    expectedVersion,
    changes,
    resumeSection: sectionKey,
  });
}

function finalSummary(items) {
  const direct = items.filter((item) => item.isDirect);
  const missingNotes = direct.filter(
    (item) =>
      (["Request changes", "Needs discussion"].includes(item.decision) ||
        (item.decision === "Approve" && item.severity === "warning")) &&
      !text(item.reviewerNote),
  );
  const counts = {
    total: direct.length,
    approved: direct.filter((item) => item.decision === "Approve").length,
    requestChanges: direct.filter((item) => item.decision === "Request changes")
      .length,
    needsDiscussion: direct.filter(
      (item) => item.decision === "Needs discussion",
    ).length,
    reviewRequired: direct.filter((item) => !item.decision).length,
  };
  const complete = counts.reviewRequired === 0 && missingNotes.length === 0;
  return {
    counts,
    complete,
    approvalEligible: complete && counts.approved === counts.total,
    // Any authorized active Draft review can be returned. Approval eligibility
    // remains strict and independent from return eligibility.
    returnEligible: true,
    earlyReturnEligible: true,
    blockingItems: [
      ...direct.filter((item) => !item.decision),
      ...missingNotes,
    ].map((item) => ({
      sectionKey: item.sectionKey,
      stableItemKey: item.stableItemKey,
      displayLabel: item.displayLabel,
    })),
  };
}

async function reviewThreadSummary(client, sessionId, { lock = false } = {}) {
  const result = await client.query(
    lock ? SQL.getReviewThreadSummaryForUpdate : SQL.getReviewThreadSummary,
    [sessionId],
  );
  const threads = result.rows;
  const openThreads = threads.filter((thread) => thread.threadState === "Open");
  return {
    total: threads.length,
    open: openThreads.length,
    resolved: threads.length - openThreads.length,
    eligible: openThreads.length === 0,
    blockingThreads: openThreads,
  };
}

export async function getAuditReviewFinalSummary(pool, { sessionId, user }) {
  const review = await getAuditReview(pool, { sessionId, user });
  const threadSummary = await reviewThreadSummary(pool, sessionId);
  const summary = finalSummary(review.items);
  summary.threadSummary = threadSummary;
  summary.decisionEligible = summary.approvalEligible;
  summary.approvalEligible = summary.decisionEligible && threadSummary.eligible;
  return { ...review, finalSummary: summary };
}

function assignedAnalyst(document) {
  const assigned = Array.isArray(document?.assignments?.assigned)
    ? document.assignments.assigned
    : [];
  const analyst = assigned[0] || document?.assignments?.analyst || null;
  if (!analyst) return null;
  return {
    id: analyst.id || analyst.userId || null,
    username: text(analyst.username || analyst.email || analyst.login),
  };
}

async function sessionItems(client, sessionId) {
  const result = await client.query(SQL.getSessionItems, [sessionId]);
  return result.rows;
}

export async function returnAuditReview(
  pool,
  { sessionId, expectedVersion, user, early = false },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(SQL.lockReturnReviewSession, [
      sessionId,
    ]);
    if (!sessionResult.rowCount)
      throw fail(404, "Review session is unavailable.");
    const session = sessionResult.rows[0];
    if (session.session_status !== "Draft")
      throw fail(409, "This review has already been finalized.");
    if (Number(session.draft_version) !== Number(expectedVersion))
      throw fail(409, "Review draft changed in another session.", {
        draftVersion: Number(session.draft_version),
      });
    await authority(client, {
      auditId: session.audit_id,
      requestId: session.approval_request_id,
      user,
      lock: true,
    });
    const items = await sessionItems(client, sessionId);
    const summary = finalSummary(items);
    if (!summary.returnEligible)
      throw fail(409, "The review is not eligible to be returned.", {
        finalSummary: summary,
      });
    const analyst = assignedAnalyst(session.document);
    if (!analyst?.username)
      throw fail(409, "The assigned analyst is unavailable.");
    const metadata = {
      reviewSessionId: Number(session.id),
      submittedRevisionId: Number(session.submitted_revision_id),
      counts: summary.counts,
      outcome: "Returned",
    };
    await client.query(SQL.markReviewSessionReturned, [
      sessionId,
      analyst.id,
      analyst.username,
    ]);
    const actor = reviewActor(user);
    const deniedRequest = await client.query(SQL.denyApprovalRequest, [
      session.approval_request_id,
      actor.userId,
      actor.username,
    ]);
    if (deniedRequest.rowCount !== 1)
      throw fail(409, "The approval request is no longer current.");
    await client.query(SQL.resolveApprovalInboxItems, [
      session.audit_id,
      session.approval_request_id,
    ]);
    await client.query(SQL.setAuditDraftRevision, [session.audit_id]);
    await client.query(SQL.createReturnedReviewInboxItem, [
      analyst.id,
      analyst.username,
      session.audit_id,
      session.approval_request_id,
      sessionId,
      JSON.stringify(metadata),
    ]);
    await client.query(SQL.recordReturnedReviewActivity, [
      session.audit_id,
      user?.id || null,
      reviewerKey(user),
      session.approval_request_id,
      session.submitted_revision_id,
      JSON.stringify({
        reviewSessionId: Number(sessionId),
        analyst,
        counts: summary.counts,
      }),
    ]);
    await client.query("COMMIT");
    return {
      reviewSessionId: Number(sessionId),
      workflowStatus: "Draft Revision",
      outcome: "Returned",
      analyst,
      finalSummary: summary,
      earlySendBack: Boolean(early),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getReturnedReviewFeedback(pool, { sessionId, user }) {
  const key = reviewerKey(user);
  const result = await pool.query(SQL.getReturnedReviewFeedback, [
    sessionId,
    key,
  ]);
  if (!result.rowCount)
    throw fail(404, "Returned review feedback is unavailable.");
  const items = await sessionItems(pool, sessionId);
  const threadSummary = await reviewThreadSummary(pool, sessionId);
  const feedback = items
    .filter(
      (item) =>
        item.isDirect &&
        (["Request changes", "Needs discussion"].includes(item.decision) ||
          threadSummary.blockingThreads.some(
            (thread) => Number(thread.reviewItemId) === Number(item.id),
          )),
    )
    .map((item) => {
      const thread = threadSummary.blockingThreads.find(
        (entry) => Number(entry.reviewItemId) === Number(item.id),
      );
      return {
        projectionType: "Review Feedback",
        reviewSessionId: Number(sessionId),
        reviewItemId: item.id,
        canonicalObjectKey: item.canonicalObjectKey,
        sectionKey: item.sectionKey,
        itemType: item.itemType,
        displayLabel: item.displayLabel,
        decision: item.decision,
        reviewerNote: item.reviewerNote,
        isDeleted: item.isDeleted,
        threadId: thread?.threadId || null,
        threadState: thread?.threadState || null,
        resolved: false,
      };
    });
  return {
    session: result.rows[0],
    items,
    feedback,
    threadSummary,
    finalSummary: finalSummary(items),
  };
}

function carryEquivalent(previous, current) {
  if (
    !previous ||
    !current ||
    previous.decision !== "Approve" ||
    current.isDirect === false
  )
    return false;
  if (
    previous.sectionKey !== current.sectionKey ||
    previous.itemType !== current.itemType ||
    (previous.canonicalObjectKey || previous.stableItemKey) !==
      (current.canonicalObjectKey || current.stableItemKey) ||
    previous.semanticFingerprint !== current.semanticFingerprint
  )
    return false;
  if (
    current.isDeleted ||
    current.changeReasonCodes?.some((code) =>
      [
        "object_added",
        "object_removed",
        "field_added",
        "field_removed",
        "content_changed",
        "parent_changed",
        "ancestor_changed",
        "order_changed",
        "severity_changed",
        "applicability_changed",
      ].includes(code),
    )
  )
    return false;
  if ((previous.parentItemKey || null) !== (current.parentItemKey || null))
    return false;
  if ((previous.linkedItemKey || null) !== (current.linkedItemKey || null))
    return false;
  if (
    current.itemType === "logic-step" &&
    Number(previous.canonicalOrder) !== Number(current.canonicalOrder)
  )
    return false;
  if (
    current.itemType === "audit-issue" &&
    (previous.severity || null) !== (current.severity || null)
  )
    return false;
  return true;
}

export async function carryForwardReviewItemsWithClient(
  client,
  { auditId, requestId, submittedRevisionId, document },
) {
  const previousResult = await client.query(
    SQL.getPreviousReturnedReviewSession,
    [auditId, submittedRevisionId],
  );
  if (!previousResult.rowCount)
    return { sourceReviewSessionId: null, carried: 0 };
  const previousSession = previousResult.rows[0];
  const newSessionResult = await client.query(SQL.getCurrentReviewSession, [
    requestId,
    submittedRevisionId,
  ]);
  if (!newSessionResult.rowCount)
    return { sourceReviewSessionId: Number(previousSession.id), carried: 0 };
  const previous = await sessionItems(client, previousSession.id);
  const baselineRevision = await client.query(SQL.getBaselineRevision, [
    previousSession.submitted_revision_id,
    auditId,
  ]);
  const current = buildAuditReviewItems(document, {
    auditId,
    baselineDocument: baselineRevision.rows[0]?.document || null,
  });
  const priorByKey = new Map();
  for (const item of previous) {
    const key =
      item.canonicalObjectKey || `${item.sectionKey}|${item.stableItemKey}`;
    if (priorByKey.has(key)) priorByKey.set(key, null);
    else priorByKey.set(key, item);
  }
  let carried = 0;
  for (const item of current) {
    const prior = priorByKey.get(
      item.canonicalObjectKey || `${item.sectionKey}|${item.stableItemKey}`,
    );
    if (!carryEquivalent(prior, item)) continue;
    const updated = await client.query(SQL.carryForwardReviewItem, [
      newSessionResult.rows[0].id,
      item.sectionKey,
      item.stableItemKey,
      prior.id,
    ]);
    carried += updated.rowCount;
  }
  await client.query(SQL.linkSourceReviewSession, [
    newSessionResult.rows[0].id,
    previousSession.id,
  ]);
  return { sourceReviewSessionId: Number(previousSession.id), carried };
}

function reviewActor(user) {
  return {
    userId: user?.id || user?.userId || null,
    username: reviewerKey(user),
  };
}

export async function finalizeApprovedAuditReview(
  pool,
  { sessionId, expectedVersion, versionTitle, user },
) {
  const title = text(versionTitle);
  if (!title) throw fail(400, "Version title is required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock order: review session, audit, request, submitted revision.
    const sessionResult = await client.query(SQL.lockFinalReviewSession, [
      sessionId,
    ]);
    if (!sessionResult.rowCount)
      throw fail(404, "Review session is unavailable.");
    const session = sessionResult.rows[0];
    if (session.session_status !== "Draft")
      throw fail(409, "This review has already been finalized.");
    if (Number(session.draft_version) !== Number(expectedVersion))
      throw fail(409, "Review draft changed in another session.", {
        draftVersion: Number(session.draft_version),
      });
    const audit = (await client.query(SQL.lockFinalAudit, [session.audit_id]))
      .rows[0];
    if (!audit) throw fail(404, "Audit is unavailable.");
    const request = (
      await client.query(SQL.lockFinalApprovalRequest, [
        session.approval_request_id,
        session.audit_id,
      ])
    ).rows[0];
    if (
      !request ||
      request.request_status !== "Pending" ||
      audit.workflow_status !== "Pending Approval" ||
      Number(audit.current_approval_request_id) !== Number(request.id) ||
      Number(request.submitted_revision_id) !==
        Number(session.submitted_revision_id) ||
      Number(audit.current_revision_id) !==
        Number(session.submitted_revision_id)
    )
      throw fail(409, "The approval request is no longer current.");
    await authority(client, {
      auditId: session.audit_id,
      requestId: session.approval_request_id,
      user,
      lock: false,
    });
    const submitted = (
      await client.query(SQL.shareLockSubmittedRevision, [
        session.submitted_revision_id,
        session.audit_id,
      ])
    ).rows[0];
    if (!submitted) throw fail(404, "Submitted revision is unavailable.");
    const items = await sessionItems(client, sessionId);
    const summary = finalSummary(items);
    const threadSummary = await reviewThreadSummary(client, sessionId, {
      lock: true,
    });
    summary.threadSummary = threadSummary;
    summary.decisionEligible = summary.approvalEligible;
    summary.approvalEligible =
      summary.decisionEligible && threadSummary.eligible;
    if (!summary.approvalEligible)
      throw fail(
        409,
        threadSummary.eligible
          ? "Every applicable review item must be approved."
          : "Every applicable review discussion must be resolved before approval.",
        {
          finalSummary: summary,
        },
      );
    const actor = reviewActor(user);
    const approval = (
      await client.query(SQL.createAuditApproval, [
        session.audit_id,
        session.submitted_revision_id,
        request.id,
        actor.userId,
        actor.username,
        null,
      ])
    ).rows[0];
    const versionNumber = Number(
      (await client.query(SQL.nextPublicationVersion, [session.audit_id]))
        .rows[0].next,
    );
    const completeDocument = structuredClone(submitted.document || {});
    completeDocument.status = "Complete";
    const completeDocumentHash = hash(completeDocument);
    const assignmentSnapshot = completeDocument.assignments || {};
    const publication = (
      await client.query(SQL.createAuditPublication, [
        session.audit_id,
        versionNumber,
        title,
        completeDocument.description || null,
        null,
        session.submitted_revision_id,
        approval.id,
        JSON.stringify(completeDocument),
        completeDocumentHash,
        JSON.stringify(assignmentSnapshot),
        actor.userId,
        actor.username,
      ])
    ).rows[0];
    await client.query(SQL.approveApprovalRequest, [
      request.id,
      session.audit_id,
      actor.userId,
      actor.username,
    ]);
    await client.query(SQL.markReviewSessionApproved, [sessionId]);
    await client.query(SQL.publishAudit, [
      session.audit_id,
      approval.id,
      publication.id,
      session.submitted_revision_id,
      JSON.stringify(completeDocument),
      completeDocumentHash,
    ]);
    await client.query(SQL.resolveFinalApprovalInboxItems, [
      session.audit_id,
      request.id,
    ]);
    await client.query(SQL.createApprovalDecisionInboxItem, [
      request.requester_user_id,
      request.requester_username,
      session.audit_id,
      request.id,
      JSON.stringify({
        decision: "Approved",
        publicationId: Number(publication.id),
        versionNumber,
        reviewSessionId: Number(sessionId),
      }),
    ]);
    await client.query(SQL.recordFinalizedReviewActivity, [
      session.audit_id,
      actor.userId,
      actor.username,
      session.submitted_revision_id,
      request.id,
      approval.id,
      publication.id,
      versionNumber,
      "Review approved and published",
      JSON.stringify({
        reviewSessionId: Number(sessionId),
        completionStatus: "Complete",
      }),
    ]);
    await client.query("COMMIT");
    return {
      auditId: session.audit_id,
      workflowStatus: "Published",
      completionStatus: "Complete",
      decision: "Approved",
      approval,
      publication,
      finalSummary: summary,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
