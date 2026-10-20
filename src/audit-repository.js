import { auditAccessForUser } from "./audit-authorization.js";
import {
  invalidateWorkflowAuthorityWithClient,
  recordAuditActivityWithClient,
} from "./audit-workflow-repository.js";
import { verifyRestorationPreviewWithClient } from "./audit-preview-repository.js";

import { upsertUserProfilesWithClient } from "./user-profile-repository.js";
import { canonicalJson, documentHash } from "./canonical-json.js";
import { loadSql } from "./sql.js";

export { canonicalJson, documentHash };

const SQL = Object.freeze({
  listAudits: loadSql(
    "../sql/audit-repository/list-audits.sql",
    import.meta.url,
  ),
  listArchivedAudits: loadSql(
    "../sql/audit-repository/list-archived-audits.sql",
    import.meta.url,
  ),
  getAudit: loadSql("../sql/audit-repository/get-audit.sql", import.meta.url),
  nextStepRevisionNumber: loadSql(
    "../sql/audit-repository/next-step-revision-number.sql",
    import.meta.url,
  ),
  upsertAuditStep: loadSql(
    "../sql/audit-repository/upsert-audit-step.sql",
    import.meta.url,
  ),
  insertStepRevision: loadSql(
    "../sql/audit-repository/insert-step-revision.sql",
    import.meta.url,
  ),
  setCurrentStepRevision: loadSql(
    "../sql/audit-repository/set-current-step-revision.sql",
    import.meta.url,
  ),
  lockAuditForSave: loadSql(
    "../sql/audit-repository/lock-audit-for-save.sql",
    import.meta.url,
  ),
  getCurrentDocumentHash: loadSql(
    "../sql/audit-repository/get-current-document-hash.sql",
    import.meta.url,
  ),
  insertAudit: loadSql(
    "../sql/audit-repository/insert-audit.sql",
    import.meta.url,
  ),
  insertAuditRevision: loadSql(
    "../sql/audit-repository/insert-audit-revision.sql",
    import.meta.url,
  ),
  getPreviousAuditDocument: loadSql(
    "../sql/audit-repository/get-previous-audit-document.sql",
    import.meta.url,
  ),
  nextDeletedStepRevisionNumber: loadSql(
    "../sql/audit-repository/next-step-revision-number.sql",
    import.meta.url,
  ),
  insertDeletedStepRevision: loadSql(
    "../sql/audit-repository/insert-deleted-step-revision.sql",
    import.meta.url,
  ),
  markStepDeleted: loadSql(
    "../sql/audit-repository/mark-step-deleted.sql",
    import.meta.url,
  ),
  updateAuditCurrentRevision: loadSql(
    "../sql/audit-repository/update-audit-current-revision.sql",
    import.meta.url,
  ),
  listAuditRevisions: loadSql(
    "../sql/audit-repository/list-audit-revisions.sql",
    import.meta.url,
  ),
  getAuditRevision: loadSql(
    "../sql/audit-repository/get-audit-revision.sql",
    import.meta.url,
  ),
  lockRestorationAudit: loadSql(
    "../sql/audit-repository/lock-restoration-audit.sql",
    import.meta.url,
  ),
  insertRestorationAuditRevision: loadSql(
    "../sql/audit-repository/insert-restoration-audit-revision.sql",
    import.meta.url,
  ),
  nextRestorationDeletedStepRevisionNumber: loadSql(
    "../sql/audit-repository/next-step-revision-number.sql",
    import.meta.url,
  ),
  insertRestorationDeletedStepRevision: loadSql(
    "../sql/audit-repository/insert-deleted-step-revision.sql",
    import.meta.url,
  ),
  markRestorationStepDeleted: loadSql(
    "../sql/audit-repository/mark-step-deleted.sql",
    import.meta.url,
  ),
  updateRestoredAuditCurrentRevision: loadSql(
    "../sql/audit-repository/update-audit-current-revision.sql",
    import.meta.url,
  ),
  getRestorationAuditRevision: loadSql(
    "../sql/audit-repository/get-restoration-audit-revision.sql",
    import.meta.url,
  ),
  listStepRevisions: loadSql(
    "../sql/audit-repository/list-step-revisions.sql",
    import.meta.url,
  ),
  getStepRevision: loadSql(
    "../sql/audit-repository/get-step-revision.sql",
    import.meta.url,
  ),
  getRestorationStepRevision: loadSql(
    "../sql/audit-repository/get-restoration-step-revision.sql",
    import.meta.url,
  ),
  archiveAudit: loadSql(
    "../sql/audit-repository/archive-audit.sql",
    import.meta.url,
  ),
  lockArchivedAuditForRestore: loadSql(
    "../sql/audit-repository/lock-archived-audit-for-restore.sql",
    import.meta.url,
  ),
  restoreArchivedAudit: loadSql(
    "../sql/audit-repository/restore-archived-audit.sql",
    import.meta.url,
  ),
  lockArchivedAuditForDelete: loadSql(
    "../sql/audit-repository/lock-archived-audit-for-delete.sql",
    import.meta.url,
  ),
  insertAuditDeletionEvent: loadSql(
    "../sql/audit-repository/insert-audit-deletion-event.sql",
    import.meta.url,
  ),
  clearStepCurrentRevisions: loadSql(
    "../sql/audit-repository/clear-step-current-revisions.sql",
    import.meta.url,
  ),
  clearAuditCurrentRevision: loadSql(
    "../sql/audit-repository/clear-audit-current-revision.sql",
    import.meta.url,
  ),
  deleteStepRevisions: loadSql(
    "../sql/audit-repository/delete-step-revisions.sql",
    import.meta.url,
  ),
  deleteAuditSteps: loadSql(
    "../sql/audit-repository/delete-audit-steps.sql",
    import.meta.url,
  ),
  deleteAuditRevisions: loadSql(
    "../sql/audit-repository/delete-audit-revisions.sql",
    import.meta.url,
  ),
  deleteAudit: loadSql(
    "../sql/audit-repository/delete-audit.sql",
    import.meta.url,
  ),
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
export function normalizeAssignmentUser(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const id = cleanText(user.id),
    username = cleanText(user.username);
  if (!id && !username) return null;
  return {
    id,
    username,
    fullName: cleanText(user.fullName),
    email: cleanText(user.email),
    avatar: cleanText(user.avatar) || null,
  };
}
export function normalizeAssignmentUsers(users) {
  const result = [],
    ids = new Set(),
    usernames = new Set();
  for (const value of Array.isArray(users) ? users : []) {
    const user = normalizeAssignmentUser(value);
    if (!user) continue;
    const username = user.username.toLowerCase();
    if ((user.id && ids.has(user.id)) || (username && usernames.has(username)))
      continue;
    if (user.id) ids.add(user.id);
    if (username) usernames.add(username);
    result.push(user);
  }
  return result;
}
export function normalizeAssignments(value) {
  const assignments =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    assigned: normalizeAssignmentUsers(assignments.assigned),
    backup: normalizeAssignmentUsers(assignments.backup),
    developer: normalizeAssignmentUsers(assignments.developer),
  };
}
export function assignmentProfiles(assignments) {
  const normalized = normalizeAssignments(assignments);
  return normalizeAssignmentUsers([
    ...normalized.assigned,
    ...normalized.backup,
    ...normalized.developer,
  ]).filter((user) => user.id && user.username);
}

function userFields(user) {
  return [
    user?.id || null,
    user?.username || "unknown",
    user?.fullName || null,
    user?.email || null,
  ];
}
export const AUDIT_STATUSES = Object.freeze([
  "Draft",
  "Requirement Gathering",
  "Ready for Review",
  "Complete",
]);

export function validateAudit(document) {
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw Object.assign(new Error("Audit document must be a JSON object."), {
      status: 400,
    });
  if (!String(document.id || "").trim())
    throw Object.assign(new Error("Audit id is required."), { status: 400 });
  if (!String(document.name || "").trim())
    throw Object.assign(new Error("Audit name is required."), { status: 400 });
  if (document.status == null || String(document.status).trim() === "")
    document.status = "Draft";
  if (!AUDIT_STATUSES.includes(document.status))
    throw Object.assign(new Error("Audit status is invalid."), { status: 400 });
  for (const key of ["sources", "fields", "steps"])
    if (!Array.isArray(document[key])) document[key] = [];
  document.assignments = normalizeAssignments(document.assignments);
  const ids = new Set();
  for (const step of document.steps) {
    if (!step?.id)
      throw Object.assign(new Error("Every audit step requires an id."), {
        status: 400,
      });
    if (ids.has(step.id))
      throw Object.assign(new Error(`Duplicate step id: ${step.id}`), {
        status: 400,
      });
    ids.add(step.id);
  }
  return document;
}
export async function listAudits(pool) {
  const result = await pool.query(SQL.listAudits);
  return result.rows.map((row) => ({
    ...row,
    assignments: normalizeAssignments(row.assignments),
  }));
}
export async function listArchivedAudits(pool) {
  const result = await pool.query(SQL.listArchivedAudits);
  return result.rows;
}

export async function getAudit(pool, auditId) {
  const result = await pool.query(SQL.getAudit, [auditId]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    audit: row.document,
    revision: {
      id: Number(row.current_revision_id),
      number: row.current_revision_number,
      createdAt: row.revision_created_at,
      createdByUsername: row.revision_created_by_username,
    },
  };
}
async function insertStepRevision(
  client,
  {
    auditId,
    auditRevisionId,
    step,
    operation,
    user,
    changeSummary,
    restoredFromStepRevisionId = null,
  },
) {
  const current = await client.query(SQL.nextStepRevisionNumber, [
    auditId,
    step.id,
  ]);
  const [uid, username, fullName] = userFields(user);
  await client.query(SQL.upsertAuditStep, [
    auditId,
    step.id,
    step.parentId || null,
    step.branchType || "root",
    Number(step.sortOrder || 0),
    step.step_type || step.type || null,
    step.enabled !== false,
    step.autoGeneratedReference === true,
    step.locked === true,
  ]);
  const inserted = await client.query(SQL.insertStepRevision, [
    auditId,
    step.id,
    auditRevisionId,
    current.rows[0].next,
    operation,
    JSON.stringify(step),
    documentHash(step),
    changeSummary || null,
    uid,
    username,
    fullName,
    restoredFromStepRevisionId,
  ]);
  await client.query(SQL.setCurrentStepRevision, [
    auditId,
    step.id,
    inserted.rows[0].id,
  ]);
}

function assertAuditDocumentMutationAllowed(auditRow) {
  if (auditRow?.workflow_status !== "Pending Approval") return;
  throw Object.assign(
    new Error(
      `This audit is read-only while approval request ${auditRow.current_approval_request_id} is pending. An assigned analyst must rescind the request before editing.`,
    ),
    {
      status: 409,
      code: "AUDIT_PENDING_APPROVAL_LOCKED",
      currentRevisionId: Number(auditRow.current_revision_id),
      currentRequestId: Number(auditRow.current_approval_request_id),
    },
  );
}
export async function saveAudit(
  pool,
  {
    document,
    expectedRevisionId,
    user,
    changeType = "save",
    changeSummary = null,
    restoredFromRevisionId = null,
    restoredStep = null,
  },
) {
  document = validateAudit(structuredClone(document));
  const client = await pool.connect();
  let unchanged = false;
  let saved;
  try {
    await client.query("BEGIN");
    const existing = await client.query(SQL.lockAuditForSave, [document.id]);
    const isCreate = !existing.rowCount;
    if (!isCreate) assertAuditDocumentMutationAllowed(existing.rows[0]);
    if (
      !isCreate &&
      expectedRevisionId != null &&
      Number(existing.rows[0].current_revision_id) !==
        Number(expectedRevisionId)
    ) {
      const error = new Error(
        "This audit has a newer database revision. Load the latest revision before saving.",
      );
      error.status = 409;
      error.currentRevisionId = Number(existing.rows[0].current_revision_id);
      throw error;
    }
    const hash = documentHash(document);
    if (!isCreate) {
      const currentDoc = await client.query(SQL.getCurrentDocumentHash, [
        existing.rows[0].current_revision_id,
      ]);
      if (
        currentDoc.rows[0]?.document_sha256 === hash &&
        changeType === "save"
      ) {
        await client.query("ROLLBACK");
        unchanged = true;
      }
    }
    if (!unchanged) {
    const revisionNumber = isCreate
      ? 1
      : Number(existing.rows[0].current_revision_number) + 1;
    const [uid, username, fullName, email] = userFields(user);
    if (isCreate) {
      await client.query(SQL.insertAudit, [
        document.id,
        document.name,
        document.purpose || "",
        document.description || "",
        Number(document.schemaVersion || 1),
        document.sourceKind || "database",
        uid,
        username,
      ]);
    }
    const revision = await client.query(SQL.insertAuditRevision, [
      document.id,
      revisionNumber,
      isCreate ? null : existing.rows[0].current_revision_id,
      JSON.stringify(document),
      hash,
      isCreate ? "create" : changeType,
      changeSummary,
      uid,
      username,
      fullName,
      email,
      restoredFromRevisionId,
    ]);
    const auditRevisionId = Number(revision.rows[0].id);
    if (
      !isCreate &&
      existing.rows[0].workflow_status === "Published" &&
      existing.rows[0].published_locked
    ) {
      throw Object.assign(
        new Error("Published audits must be unlocked before editing."),
        {
          status: 409,
          currentRevisionId: Number(existing.rows[0].current_revision_id),
        },
      );
    }
    let previousSteps = new Map();
    if (!isCreate) {
      const previous = await client.query(SQL.getPreviousAuditDocument, [
        existing.rows[0].current_revision_id,
      ]);
      previousSteps = new Map(
        (previous.rows[0]?.document?.steps || []).map((step) => [
          step.id,
          step,
        ]),
      );
    }
    const submitted = new Map(document.steps.map((step) => [step.id, step]));
    for (const step of document.steps) {
      const before = previousSteps.get(step.id);
      let operation = before ? "update" : "create";
      if (before && documentHash(before) === documentHash(step)) continue;
      if (
        before &&
        (before.parentId !== step.parentId ||
          Number(before.sortOrder || 0) !== Number(step.sortOrder || 0))
      )
        operation = "move";
      if (restoredStep?.stepId === step.id) operation = "restore";
      await insertStepRevision(client, {
        auditId: document.id,
        auditRevisionId,
        step,
        operation,
        user,
        changeSummary,
        restoredFromStepRevisionId:
          restoredStep?.stepId === step.id ? restoredStep.stepRevisionId : null,
      });
    }
    for (const [stepId, step] of previousSteps)
      if (!submitted.has(stepId)) {
        const current = await client.query(SQL.nextDeletedStepRevisionNumber, [
          document.id,
          stepId,
        ]);
        await client.query(SQL.insertDeletedStepRevision, [
          document.id,
          stepId,
          auditRevisionId,
          current.rows[0].next,
          JSON.stringify(step),
          documentHash(step),
          changeSummary,
          uid,
          username,
          fullName,
        ]);
        await client.query(SQL.markStepDeleted, [document.id, stepId]);
      }
    await client.query(SQL.updateAuditCurrentRevision, [
      document.id,
      document.name,
      document.purpose || "",
      document.description || "",
      Number(document.schemaVersion || 1),
      document.sourceKind || "database",
      auditRevisionId,
      revisionNumber,
      uid,
      username,
    ]);
    await upsertUserProfilesWithClient(
      client,
      assignmentProfiles(document.assignments),
    );
    if (
      !isCreate &&
      ["Pending Approval", "Approved"].includes(
        existing.rows[0].workflow_status,
      )
    ) {
      await invalidateWorkflowAuthorityWithClient(client, {
        auditRow: existing.rows[0],
        user,
        reason:
          changeType === "restore"
            ? "Audit restoration changed the current revision"
            : "Audit content changed",
        restoration: changeType === "restore",
        resultingRevisionId: auditRevisionId,
      });
    } else if (!isCreate && changeType === "restore") {
      await invalidateWorkflowAuthorityWithClient(client, {
        auditRow: existing.rows[0],
        user,
        reason: "Audit restoration changed the current revision",
        restoration: true,
        resultingRevisionId: auditRevisionId,
      });
    }
    await client.query("COMMIT");
    saved = {
      audit: document,
      revision: {
        id: auditRevisionId,
        number: revisionNumber,
        createdAt: revision.rows[0].created_at,
        createdByUsername: username,
      },
    };
    }
  } catch (error) {
    if (!unchanged) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (unchanged) return getAudit(pool, document.id);
  return saved;
}
export async function listAuditRevisions(pool, auditId) {
  const result = await pool.query(SQL.listAuditRevisions, [auditId]);
  return result.rows;
}
export async function getAuditRevision(pool, auditId, revisionId) {
  const result = await pool.query(SQL.getAuditRevision, [auditId, revisionId]);
  return result.rows[0] || null;
}
async function lockRestorationAudit(client, auditId) {
  const result = await client.query(SQL.lockRestorationAudit, [auditId]);
  return result.rows[0] || null;
}
function restorationConflict(row, expectedRevisionId) {
  if (Number(row.current_revision_id) !== Number(expectedRevisionId)) {
    const error = new Error(
      "The audit revision is stale. Generate a new restoration preview.",
    );
    error.status = 409;
    error.currentRevisionId = Number(row.current_revision_id);
    throw error;
  }
}
async function persistRestorationWithClient(
  client,
  {
    auditRow,
    document,
    user,
    changeSummary,
    restoredFromRevisionId = null,
    restoredStep = null,
    placementAdjustment = null,
  },
) {
  assertAuditDocumentMutationAllowed(auditRow);
  document = validateAudit(structuredClone(document));
  const hash = documentHash(document);
  if (hash === auditRow.document_sha256)
    return {
      status: "unchanged",
      audit: auditRow.document,
      revision: {
        id: Number(auditRow.current_revision_id),
        number: auditRow.current_revision_number,
      },
    };
  if (auditRow.workflow_status === "Published" && auditRow.published_locked)
    throw Object.assign(
      new Error("Published audits must be unlocked before restoration."),
      { status: 409, currentRevisionId: Number(auditRow.current_revision_id) },
    );
  const revisionNumber = Number(auditRow.current_revision_number) + 1;
  const [uid, username, fullName, email] = userFields(user);
  const revision = await client.query(SQL.insertRestorationAuditRevision, [
    auditRow.id,
    revisionNumber,
    auditRow.current_revision_id,
    JSON.stringify(document),
    hash,
    changeSummary,
    uid,
    username,
    fullName,
    email,
    restoredFromRevisionId,
  ]);
  const auditRevisionId = Number(revision.rows[0].id);
  const previousSteps = new Map(
    (auditRow.document?.steps || []).map((step) => [step.id, step]),
  );
  const submitted = new Map(document.steps.map((step) => [step.id, step]));
  for (const step of document.steps) {
    const before = previousSteps.get(step.id);
    if (before && documentHash(before) === documentHash(step)) continue;
    await insertStepRevision(client, {
      auditId: auditRow.id,
      auditRevisionId,
      step,
      operation:
        restoredStep?.stepId === step.id
          ? "restore"
          : before
            ? "update"
            : "create",
      user,
      changeSummary,
      restoredFromStepRevisionId:
        restoredStep?.stepId === step.id ? restoredStep.stepRevisionId : null,
    });
  }
  for (const [stepId, step] of previousSteps)
    if (!submitted.has(stepId)) {
      const current = await client.query(
        SQL.nextRestorationDeletedStepRevisionNumber,
        [auditRow.id, stepId],
      );
      await client.query(SQL.insertRestorationDeletedStepRevision, [
        auditRow.id,
        stepId,
        auditRevisionId,
        current.rows[0].next,
        JSON.stringify(step),
        documentHash(step),
        changeSummary,
        uid,
        username,
        fullName,
      ]);
      await client.query(SQL.markRestorationStepDeleted, [auditRow.id, stepId]);
    }
  await client.query(SQL.updateRestoredAuditCurrentRevision, [
    auditRow.id,
    document.name,
    document.purpose || "",
    document.description || "",
    Number(document.schemaVersion || 1),
    document.sourceKind || "database",
    auditRevisionId,
    revisionNumber,
    uid,
    username,
  ]);
  await upsertUserProfilesWithClient(
    client,
    assignmentProfiles(document.assignments),
  );
  await invalidateWorkflowAuthorityWithClient(client, {
    auditRow,
    user,
    reason: "Restoration changed the current revision",
    restoration: true,
    resultingRevisionId: auditRevisionId,
    affectedStepId: restoredStep?.stepId || null,
    sourceStepRevisionId: restoredStep?.stepRevisionId || null,
    placementAdjustment,
  });
  await recordAuditActivityWithClient(
    client,
    auditRow.id,
    restoredStep ? "step.restored" : "audit.restored",
    user,
    {
      sourceRevisionId:
        restoredFromRevisionId || Number(auditRow.current_revision_id),
      resultingRevisionId: auditRevisionId,
      affectedStepId: restoredStep?.stepId || null,
      summary: changeSummary,
      metadata: {
        sourceStepRevisionId: restoredStep?.stepRevisionId || null,
        placementAdjustment,
      },
    },
  );
  if (placementAdjustment)
    await recordAuditActivityWithClient(
      client,
      auditRow.id,
      "step.orphan_placement_adjusted",
      user,
      {
        sourceRevisionId: Number(auditRow.current_revision_id),
        resultingRevisionId: auditRevisionId,
        affectedStepId: restoredStep.stepId,
        summary:
          "Restored step placed at audit root because its historical parent is unavailable",
        metadata: {
          sourceStepRevisionId: restoredStep.stepRevisionId,
          ...placementAdjustment,
        },
      },
    );
  return {
    audit: document,
    revision: {
      id: auditRevisionId,
      number: revisionNumber,
      createdAt: revision.rows[0].created_at,
      createdByUsername: username,
    },
  };
}
export async function restoreAuditRevision(
  pool,
  { auditId, revisionId, expectedRevisionId, previewToken, user },
) {
  if (expectedRevisionId == null)
    throw Object.assign(new Error("expectedRevisionId is required."), {
      status: 400,
    });
  if (!previewToken)
    throw Object.assign(new Error("previewToken is required."), {
      status: 400,
    });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const auditRow = await lockRestorationAudit(client, auditId);
    if (!auditRow)
      throw Object.assign(new Error("Audit not found."), { status: 404 });
    restorationConflict(auditRow, expectedRevisionId);
    if (
      !auditAccessForUser(user, {
        ...auditRow.document,
        workflowStatus: auditRow.workflow_status,
      }).canRestoreAudit
    )
      throw Object.assign(new Error("Audit restoration access is required."), {
        status: 403,
      });
    await verifyRestorationPreviewWithClient(client, {
      previewToken,
      auditId,
      kind: "audit-restoration",
      sourceId: revisionId,
      stepId: null,
      user,
      currentRow: auditRow,
    });
    const source = await client.query(SQL.getRestorationAuditRevision, [
      auditId,
      revisionId,
    ]);
    if (!source.rowCount)
      throw Object.assign(new Error("Audit revision not found."), {
        status: 404,
      });
    const result = await persistRestorationWithClient(client, {
      auditRow,
      document: source.rows[0].document,
      user,
      changeSummary: `Restored audit revision ${source.rows[0].revision_number}`,
      restoredFromRevisionId: Number(revisionId),
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function listStepRevisions(pool, auditId, stepId) {
  const result = await pool.query(SQL.listStepRevisions, [auditId, stepId]);
  return result.rows;
}
export async function getStepRevision(pool, auditId, stepId, revisionId) {
  const result = await pool.query(SQL.getStepRevision, [
    auditId,
    stepId,
    revisionId,
  ]);
  return result.rows[0] || null;
}
export async function restoreStepRevision(
  pool,
  { auditId, stepId, revisionId, expectedRevisionId, previewToken, user },
) {
  if (expectedRevisionId == null)
    throw Object.assign(new Error("expectedRevisionId is required."), {
      status: 400,
    });
  if (!previewToken)
    throw Object.assign(new Error("previewToken is required."), {
      status: 400,
    });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const auditRow = await lockRestorationAudit(client, auditId);
    if (!auditRow)
      throw Object.assign(new Error("Audit not found."), { status: 404 });
    restorationConflict(auditRow, expectedRevisionId);
    if (
      !auditAccessForUser(user, {
        ...auditRow.document,
        workflowStatus: auditRow.workflow_status,
      }).canRestoreStep
    )
      throw Object.assign(new Error("Step restoration access is required."), {
        status: 403,
      });
    const verified = await verifyRestorationPreviewWithClient(client, {
      previewToken,
      auditId,
      kind: "step-restoration",
      sourceId: revisionId,
      stepId,
      user,
      currentRow: auditRow,
    });
    const source = await client.query(SQL.getRestorationStepRevision, [
      auditId,
      stepId,
      revisionId,
    ]);
    if (!source.rowCount || !source.rows[0].step_document)
      throw Object.assign(new Error("Step revision not found."), {
        status: 404,
      });
    const document = structuredClone(auditRow.document),
      index = document.steps.findIndex((step) => step.id === stepId),
      restoredStep = structuredClone(source.rows[0].step_document);
    if (verified.placementAdjustment) {
      restoredStep.parentId = verified.placementAdjustment.parentId;
      restoredStep.branchType = verified.placementAdjustment.branchType;
    }
    if (index >= 0) document.steps[index] = restoredStep;
    else document.steps.push(restoredStep);
    const result = await persistRestorationWithClient(client, {
      auditRow,
      document,
      user,
      changeSummary: `Restored step ${stepId} revision ${source.rows[0].step_revision_number}`,
      restoredStep: { stepId, stepRevisionId: Number(revisionId) },
      placementAdjustment: verified.placementAdjustment || null,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function archiveAudit(pool, auditId, expectedRevisionId, user) {
  const result = await pool.query(SQL.archiveAudit, [
    auditId,
    expectedRevisionId,
    user.username,
  ]);
  if (!result.rowCount) {
    const error = new Error("This audit has changed or is already archived.");
    error.status = 409;
    throw error;
  }
  return { id: auditId, archived: true };
}

export async function importAudit(
  pool,
  { document, user, changeSummary = "Imported JSON audit" },
) {
  const normalized = validateAudit(structuredClone(document));
  const current = await getAudit(pool, normalized.id);
  const incomingHash = documentHash(normalized);
  if (current && documentHash(current.audit) === incomingHash)
    return {
      status: "unchanged",
      auditId: normalized.id,
      revision: current.revision,
    };
  const result = await saveAudit(pool, {
    document: normalized,
    expectedRevisionId: current?.revision?.id ?? null,
    user,
    changeType: "import",
    changeSummary,
  });
  return { status: "imported", ...result };
}

export async function restoreArchivedAudit(pool, auditId, user) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(SQL.lockArchivedAuditForRestore, [
      auditId,
    ]);
    if (!current.rowCount)
      return await client.query("ROLLBACK").then(() => null);
    await client.query(SQL.restoreArchivedAudit, [
      auditId,
      ...userFields(user),
    ]);
    await client.query("COMMIT");
    return { restored: true, auditId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function permanentlyDeleteArchivedAudit(pool, auditId, user) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(SQL.lockArchivedAuditForDelete, [auditId]);
    if (!found.rowCount) return await client.query("ROLLBACK").then(() => null);
    const audit = found.rows[0];
    const [userId, username, fullName] = userFields(user);
    await client.query(SQL.insertAuditDeletionEvent, [
      audit.id,
      audit.name,
      userId,
      username,
      fullName,
      audit.current_revision_id,
      audit.current_revision_number,
    ]);
    await client.query(SQL.clearStepCurrentRevisions, [auditId]);
    await client.query(SQL.clearAuditCurrentRevision, [auditId]);
    await client.query(SQL.deleteStepRevisions, [auditId]);
    await client.query(SQL.deleteAuditSteps, [auditId]);
    await client.query(SQL.deleteAuditRevisions, [auditId]);
    await client.query(SQL.deleteAudit, [auditId]);
    await client.query("COMMIT");
    return { deleted: true, auditId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
