import { createHmac, timingSafeEqual } from "node:crypto";
import { compareAuditDocuments, compareSteps } from "./audit-comparison.js";
import { fail } from "./http-error.js";
import { loadSql } from "./sql.js";

const SQL = Object.freeze({
  currentAuditRevision: loadSql(
    "../sql/audit-preview-repository/get-current-audit-revision.sql",
    import.meta.url,
  ),
  auditRevisionForRestoration: loadSql(
    "../sql/audit-preview-repository/get-audit-revision-for-restoration.sql",
    import.meta.url,
  ),
  stepRevisionForRestoration: loadSql(
    "../sql/audit-preview-repository/get-step-revision-for-restoration.sql",
    import.meta.url,
  ),
  auditRevisionForHistory: loadSql(
    "../sql/audit-preview-repository/get-audit-revision-for-history.sql",
    import.meta.url,
  ),
  approvalRequest: loadSql(
    "../sql/audit-preview-repository/get-approval-request.sql",
    import.meta.url,
  ),
  publication: loadSql(
    "../sql/audit-preview-repository/get-publication.sql",
    import.meta.url,
  ),
  verifyAuditRestorationSource: loadSql(
    "../sql/audit-preview-repository/verify-audit-restoration-source.sql",
    import.meta.url,
  ),
  verifyStepRestorationSource: loadSql(
    "../sql/audit-preview-repository/verify-step-restoration-source.sql",
    import.meta.url,
  ),
});

const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
function secret() {
  const v = process.env.ATLAS_PREVIEW_TOKEN_SECRET;
  if (!v || v.length < 32)
    throw fail(503, "Restoration preview signing is not configured.");
  return v;
}
function sign(body) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}
function token(payload) {
  const body = enc(payload);
  return `${body}.${sign(body)}`;
}
export function readRestorationPreviewToken(value) {
  const [body, sig, extra] = String(value || "").split(".");
  if (!body || !sig || extra)
    throw fail(409, "The restoration preview token is invalid.");
  const expected = sign(body),
    a = Buffer.from(sig),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw fail(409, "The restoration preview token is invalid.");
  let p;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw fail(409, "The restoration preview token is invalid.");
  }
  if (!Number.isFinite(p.exp) || Date.now() > p.exp)
    throw fail(409, "The restoration preview has expired.");
  return p;
}
const who = (u) => String(u?.id || u?.username || "").toLowerCase();
async function current(pool, auditId) {
  const r = await pool.query(SQL.currentAuditRevision, [auditId]);
  if (!r.rowCount) throw fail(404, "Audit not found.");
  return r.rows[0];
}
function descriptor(kind, row, extra = {}) {
  return {
    kind,
    ...extra,
    hash: row.document_sha256 || row.step_sha256 || row.snapshot_sha256,
  };
}
export async function previewAuditRestoration(
  pool,
  { auditId, revisionId, user },
) {
  const [c, s] = await Promise.all([
    current(pool, auditId),
    pool.query(SQL.auditRevisionForRestoration, [auditId, revisionId]),
  ]);
  if (!s.rowCount) throw fail(404, "Audit revision not found.");
  const x = s.rows[0],
    payload = {
      v: 1,
      kind: "audit-restoration",
      auditId,
      sourceRevisionId: Number(x.id),
      sourceHash: x.document_sha256,
      currentRevisionId: Number(c.current_revision_id),
      currentHash: c.document_sha256,
      user: who(user),
      placementAdjustment: null,
      exp: Date.now() + 15 * 60 * 1000,
    };
  return {
    ...compareAuditDocuments(x.document, c.document, {
      context: "restoration",
      before: descriptor("audit-revision", x, { revisionId: Number(x.id) }),
      after: descriptor("audit-revision", c, {
        revisionId: Number(c.current_revision_id),
      }),
    }),
    restoration: {
      currentRevisionId: payload.currentRevisionId,
      currentRevisionHash: payload.currentHash,
      sourceRevisionId: payload.sourceRevisionId,
      sourceRevisionHash: payload.sourceHash,
      sourceStepRevisionId: null,
      placementAdjustment: null,
      previewToken: token(payload),
    },
  };
}
export async function previewStepRestoration(
  pool,
  { auditId, stepId, stepRevisionId, user },
) {
  const [c, s] = await Promise.all([
    current(pool, auditId),
    pool.query(SQL.stepRevisionForRestoration, [
      auditId,
      stepId,
      stepRevisionId,
    ]),
  ]);
  if (!s.rowCount) throw fail(404, "Step revision not found.");
  const x = s.rows[0],
    steps = Array.isArray(c.document?.steps) ? c.document.steps : [],
    currentStep = steps.find((v) => String(v.id) === String(stepId)) || null,
    source = structuredClone(x.step_document),
    parent = source.parentId
      ? steps.find((v) => String(v.id) === String(source.parentId))
      : null;
  const adjustment =
    source.parentId && !parent
      ? {
          reason: "historical-parent-unavailable",
          previousParentId: source.parentId,
          parentId: null,
          branchType: "root",
        }
      : null;
  if (adjustment) {
    source.parentId = null;
    source.branchType = "root";
  }
  const sourceHash = x.step_sha256;
  const payload = {
    v: 1,
    kind: "step-restoration",
    auditId,
    stepId,
    sourceStepRevisionId: Number(x.id),
    sourceHash,
    currentRevisionId: Number(c.current_revision_id),
    currentHash: c.document_sha256,
    user: who(user),
    placementAdjustment: adjustment,
    exp: Date.now() + 15 * 60 * 1000,
  };
  return {
    ...compareSteps(source, currentStep, {
      context: "restoration",
      before: {
        kind: "step-revision",
        stepRevisionId: Number(x.id),
        hash: sourceHash,
      },
      after: {
        kind: "current-step",
        revisionId: Number(c.current_revision_id),
        hash: currentStep ? null : null,
      },
    }),
    restoration: {
      currentRevisionId: payload.currentRevisionId,
      currentRevisionHash: payload.currentHash,
      sourceRevisionId: null,
      sourceRevisionHash: sourceHash,
      sourceStepRevisionId: payload.sourceStepRevisionId,
      placementAdjustment: adjustment,
      previewToken: token(payload),
    },
  };
}
export async function previewAuditRevision(
  pool,
  { auditId, revisionId, user },
) {
  const [c, s] = await Promise.all([
    current(pool, auditId),
    pool.query(SQL.auditRevisionForHistory, [auditId, revisionId]),
  ]);
  if (!s.rowCount) throw fail(404, "Audit revision not found.");
  const x = s.rows[0];
  return compareAuditDocuments(x.document, c.document, {
    context: "audit-history",
    before: descriptor("audit-revision", x, { revisionId: Number(x.id) }),
    after: descriptor("audit-revision", c, {
      revisionId: Number(c.current_revision_id),
    }),
  });
}
export async function previewApprovalRequest(
  pool,
  { auditId, requestId, expectedSubmittedRevisionId = null },
) {
  if (!String(auditId || "").trim())
    throw fail(400, "Audit identifier is invalid.");
  const numericRequestId = Number(requestId);
  if (!Number.isSafeInteger(numericRequestId) || numericRequestId <= 0)
    throw fail(400, "Approval request identifier is invalid.");
  const c = await current(pool, auditId),
    r = await pool.query(SQL.approvalRequest, [auditId, numericRequestId]);
  if (!r.rowCount) throw fail(404, "Approval request not found.");
  const x = r.rows[0];
  if (
    expectedSubmittedRevisionId != null &&
    Number(x.submitted_revision_id) !== Number(expectedSubmittedRevisionId)
  )
    throw fail(
      409,
      "The Inbox item points to a mismatched submitted revision.",
    );
  const comparison = compareAuditDocuments(x.document, c.document, {
    context: "approval",
    before: descriptor("audit-revision", x, {
      revisionId: Number(x.submitted_revision_id),
    }),
    after: descriptor("audit-revision", c, {
      revisionId: Number(c.current_revision_id),
    }),
  });
  return {
    ...comparison,
    review: {
      auditId,
      requestId: numericRequestId,
      submittedRevisionId: Number(x.submitted_revision_id),
      submittedRevisionNumber: Number(x.revision_number),
      currentRevisionId: Number(c.current_revision_id),
      requestStatus: x.request_status,
    },
    submittedRevision: {
      id: Number(x.submitted_revision_id),
      number: Number(x.revision_number),
      hash: x.document_sha256,
      document: structuredClone(x.document),
    },
  };
}
export async function previewPublication(
  pool,
  { auditId, versionNumber, mode = "working" },
) {
  const c = await current(pool, auditId),
    r = await pool.query(SQL.publication, [auditId, versionNumber]);
  if (!r.rowCount) throw fail(404, "Publication not found.");
  const p = r.rows[0],
    before = mode === "approved" ? p.approved_document : p.snapshot,
    after = mode === "approved" ? p.snapshot : c.document;
  return compareAuditDocuments(before, after, {
    context: mode === "approved" ? "publication" : "publication-working",
    before: {
      kind: mode === "approved" ? "audit-revision" : "publication",
      revisionId: mode === "approved" ? Number(p.approved_revision_id) : null,
      publicationId: Number(p.id),
      versionNumber: Number(p.version_number),
      hash: mode === "approved" ? p.approved_sha256 : p.snapshot_sha256,
    },
    after: {
      kind: mode === "approved" ? "publication" : "audit-revision",
      publicationId: mode === "approved" ? Number(p.id) : null,
      versionNumber: mode === "approved" ? Number(p.version_number) : null,
      revisionId: mode === "approved" ? null : Number(c.current_revision_id),
      hash: mode === "approved" ? p.snapshot_sha256 : c.document_sha256,
    },
  });
}
export async function verifyRestorationPreviewWithClient(
  client,
  { previewToken, auditId, kind, sourceId, stepId, user, currentRow = null },
) {
  const p = readRestorationPreviewToken(previewToken);
  if (
    p.kind !== kind ||
    p.auditId !== auditId ||
    p.user !== who(user) ||
    Number(p.sourceRevisionId || p.sourceStepRevisionId) !== Number(sourceId) ||
    String(p.stepId || "") !== String(stepId || "")
  )
    throw fail(409, "The restoration preview does not match this request.");
  const c = currentRow || (await current(client, auditId));
  const currentRevisionId = Number(c.current_revision_id);
  const currentHash = c.document_sha256;
  if (
    currentRevisionId !== Number(p.currentRevisionId) ||
    currentHash !== p.currentHash
  )
    throw fail(409, "The audit changed after preview.", { currentRevisionId });
  const q =
    kind === "audit-restoration"
      ? await client.query(SQL.verifyAuditRestorationSource, [
          auditId,
          sourceId,
        ])
      : await client.query(SQL.verifyStepRestorationSource, [
          auditId,
          stepId,
          sourceId,
        ]);
  if (!q.rowCount || q.rows[0].hash !== p.sourceHash)
    throw fail(409, "The restoration source changed after preview.");
  return p;
}

export async function verifyRestorationPreview(pool, options) {
  return verifyRestorationPreviewWithClient(pool, options);
}
