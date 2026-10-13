/** Phase 6 unified detached read-only history browser. Classic script. */
const historyView = {
  active: false,
  auditId: null,
  kind: null,
  revisionId: null,
  publicationId: null,
  publicationVersion: null,
  document: null,
  metadata: null,
  returnPage: "overview",
  revisions: [],
  activity: [],
  publications: [],
  activityCursor: null,
  activityComplete: false,
  requestGeneration: 0,
};
function atlasHistoryAuditId() {
  return state?.auditPersistence?.auditId || state?.audit?.id || null;
}
function atlasHistoryClone(v) {
  return v == null ? null : JSON.parse(JSON.stringify(v));
}
function atlasHistoryPage() {
  return document.querySelector(".page.active")?.dataset.page || "overview";
}
function atlasHistoryEventLabel(t) {
  return (
    {
      "approval.submission_requested": "Submitted for approval",
      "approval.request_approved": "Approval granted",
      "approval.request_denied": "Approval denied",
      "approval.request_invalidated": "Approval request invalidated",
      "approval.invalidated_by_restoration":
        "Approval invalidated by restoration",
      "workflow.approved_content_edited": "Approved content edited",
      "workflow.submitted_content_edited": "Submitted content edited",
      "audit.restored": "Audit restored",
      "step.restored": "Step restored",
      "audit.published": "Publication created",
      "audit.published_unlocked": "Published audit unlocked",
      "publication.sent_to_recently_deleted":
        "Publication sent to Recently Deleted",
    }[t] || String(t || "Activity event").replace(/[._]/g, " ")
  );
}
function atlasHistoryTime(x) {
  return x.eventAt || x.createdAt || x.publishedAt || x.deletedAt || "";
}
function atlasHistoryTimeline() {
  const events = historyView.activity.map((x) => ({
      ...x,
      kind: "activity",
      title: atlasHistoryEventLabel(x.eventType),
      sortId: Number(x.id) || 0,
    })),
    rids = new Set(),
    pids = new Set();
  events.forEach((x) => {
    if (x.sourceRevisionId) rids.add(Number(x.sourceRevisionId));
    if (x.resultingRevisionId) rids.add(Number(x.resultingRevisionId));
    if (x.publicationId) pids.add(Number(x.publicationId));
  });
  const revisions = historyView.revisions
    .filter((x) => !rids.has(Number(x.id)))
    .map((x) => ({
      ...x,
      kind: "revision",
      title:
        Number(x.number) === 1
          ? "Audit created"
          : `Working revision ${x.number}`,
      sortId: Number(x.id) || 0,
    }));
  const publications = historyView.publications
    .filter((x) => !pids.has(Number(x.id)))
    .map((x) => ({
      ...x,
      kind: "publication",
      title: `Publication v${x.versionNumber}`,
      sortId: Number(x.id) || 0,
    }));
  const current = {
    kind: "current",
    id: "current",
    title: window.ATLASWorkflow?.isPublishedLocked?.()
      ? "Current locked state"
      : "Current working state",
    createdAt: new Date().toISOString(),
    sortId: Number.MAX_SAFE_INTEGER,
  };
  return [...events, ...revisions, ...publications, current].sort(
    (a, b) =>
      (Date.parse(atlasHistoryTime(b)) || 0) -
        (Date.parse(atlasHistoryTime(a)) || 0) ||
      b.sortId - a.sortId ||
      `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
  );
}
function atlasHistoryRenderTimeline() {
  const h = document.getElementById("atlasHistoryTimeline");
  if (!h) return;
  h.innerHTML =
    atlasHistoryTimeline()
      .map(
        (x) =>
          `<button class="history-entry" type="button" role="listitem" data-history-kind="${esc(x.kind)}" data-history-id="${esc(x.id)}" ${x.kind === "current" ? 'aria-current="true"' : ""}><span class="history-entry-title">${esc(x.title)}</span><span class="history-entry-meta">${esc(x.actorUsername || x.createdByFullName || x.createdByUsername || x.publisherUsername || "")} ${atlasHistoryTime(x) ? `· ${esc(new Date(atlasHistoryTime(x)).toLocaleString())}` : ""}</span></button>`,
      )
      .join("") || '<p class="hint">No history records are available.</p>';
  document.getElementById("atlasHistoryMore").hidden =
    historyView.activityComplete;
}
function atlasHistoryRenderSelectors() {
  const r = document.getElementById("atlasRevisionSelector"),
    p = document.getElementById("atlasPublicationSelector");
  if (r) {
    r.innerHTML =
      '<option value="">Select revision</option>' +
      historyView.revisions
        .slice()
        .sort((a, b) => a.number - b.number)
        .map(
          (x) =>
            `<option value="${x.id}">Revision ${esc(x.number)} · ${esc(x.changeType || "")}</option>`,
        )
        .join("");
    r.value =
      historyView.kind === "revision"
        ? String(historyView.revisionId || "")
        : "";
  }
  if (p) {
    p.innerHTML =
      '<option value="">Select publication</option>' +
      historyView.publications
        .slice()
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map(
          (x) =>
            `<option value="${x.versionNumber}">v${esc(x.versionNumber)} · ${esc(x.versionTitle || "")}</option>`,
        )
        .join("");
    p.value =
      historyView.kind === "publication"
        ? String(historyView.publicationVersion || "")
        : "";
  }
  atlasHistoryUpdateNavigation();
}
function atlasHistoryUpdateNavigation() {
  const pubs = historyView.kind === "publication",
    list = pubs
      ? historyView.publications
          .slice()
          .sort((a, b) => a.versionNumber - b.versionNumber)
      : historyView.revisions.slice().sort((a, b) => a.number - b.number),
    id = pubs ? historyView.publicationId : historyView.revisionId,
    i = list.findIndex((x) => Number(x.id) === Number(id));
  for (const [n, d] of [
    ["atlasRevisionPrevious", pubs || i <= 0],
    ["atlasRevisionNext", pubs || i < 0 || i >= list.length - 1],
    ["atlasPublicationPrevious", !pubs || i <= 0],
    ["atlasPublicationNext", !pubs || i < 0 || i >= list.length - 1],
  ]) {
    const e = document.getElementById(n);
    if (e) e.disabled = d;
  }
  document.getElementById("atlasHistoryCompare").disabled =
    !historyView.document;
  const restore = document.getElementById("atlasHistoryRestore");
  restore.hidden =
    historyView.kind !== "revision" ||
    !window.ATLASWorkflow?.can?.("canRestoreAudit");
}
function atlasHistoryRenderDocument() {
  document.getElementById("atlasHistoryDocument").textContent =
    historyView.document
      ? JSON.stringify(historyView.document, null, 2)
      : "Select a timeline entry, revision, or publication.";
  const m = historyView.metadata || {};
  document.getElementById("atlasHistoryMetadata").innerHTML = Object.entries(m)
    .filter(([, v]) => v != null && typeof v !== "object")
    .slice(0, 10)
    .map(
      ([k, v]) =>
        `<div><span class="hint">${esc(k.replace(/([A-Z])/g, " $1"))}</span><div class="workflow-value">${esc(v)}</div></div>`,
    )
    .join("");
  document.getElementById("atlasHistoryViewerHeading")?.focus();
  atlasHistoryUpdateNavigation();
  atlasHistoryRenderTimeline();
}
async function atlasHistorySelectRevision(id) {
  const auditId = historyView.auditId,
    g = ++historyView.requestGeneration,
    r = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(auditId)}/revisions/${encodeURIComponent(id)}`,
    );
  if (
    !historyView.active ||
    g !== historyView.requestGeneration ||
    auditId !== historyView.auditId
  )
    return;
  historyView.kind = "revision";
  historyView.revisionId = Number(id);
  historyView.publicationId = null;
  historyView.publicationVersion = null;
  historyView.document = atlasHistoryClone(r.document);
  historyView.metadata = {
    number: r.number,
    changeType: r.changeType,
    changeSummary: r.changeSummary,
    createdByUsername: r.createdByUsername,
    createdAt: r.createdAt,
  };
  atlasHistoryRenderSelectors();
  atlasHistoryRenderDocument();
}
async function atlasHistorySelectPublication(version) {
  const auditId = historyView.auditId,
    g = ++historyView.requestGeneration,
    p = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(auditId)}/publications/${encodeURIComponent(version)}`,
    );
  if (
    !historyView.active ||
    g !== historyView.requestGeneration ||
    auditId !== historyView.auditId
  )
    return;
  historyView.kind = "publication";
  historyView.publicationId = Number(p.id);
  historyView.publicationVersion = Number(
    p.version_number || p.versionNumber || version,
  );
  historyView.revisionId = null;
  historyView.document = atlasHistoryClone(p.snapshot);
  historyView.metadata = {
    versionNumber: historyView.publicationVersion,
    versionTitle: p.version_title || p.versionTitle,
    publisherUsername: p.publisher_username || p.publisherUsername,
    publishedAt: p.published_at || p.publishedAt,
    deletionStatus: p.deletion_status || p.deletionStatus,
  };
  atlasHistoryRenderSelectors();
  atlasHistoryRenderDocument();
}
async function atlasHistoryLoad(more = false) {
  const auditId = historyView.auditId,
    g = ++historyView.requestGeneration,
    before =
      more && historyView.activityCursor
        ? `&beforeId=${encodeURIComponent(historyView.activityCursor)}`
        : "";
  document.getElementById("atlasHistoryStatus").textContent =
    "Loading history…";
  try {
    const [r, a, p] = await Promise.all([
      atlasAuditApi(`/api/audits/${encodeURIComponent(auditId)}/revisions`),
      atlasAuditApi(
        `/api/audits/${encodeURIComponent(auditId)}/activity?limit=50${before}`,
      ),
      atlasAuditApi(
        `/api/audits/${encodeURIComponent(auditId)}/publications?limit=100`,
      ),
    ]);
    if (
      !historyView.active ||
      g !== historyView.requestGeneration ||
      auditId !== historyView.auditId
    )
      return;
    historyView.revisions = r.revisions || [];
    const batch = a.activity || [];
    historyView.activity = more ? [...historyView.activity, ...batch] : batch;
    historyView.activityCursor = batch.length
      ? batch[batch.length - 1].id
      : historyView.activityCursor;
    historyView.activityComplete = batch.length < 50;
    historyView.publications = p.publications || [];
    atlasHistoryRenderSelectors();
    atlasHistoryRenderTimeline();
    document.getElementById("atlasHistoryStatus").textContent =
      `${historyView.revisions.length} revisions, ${historyView.activity.length} activities, ${historyView.publications.length} publications loaded.`;
  } catch (e) {
    document.getElementById("atlasHistoryStatus").textContent = e.message;
  }
}
async function atlasOpenUnifiedHistory(kind = null) {
  if (!window.ATLASWorkflow?.feature?.("history"))
    return status("History is not enabled for this rollout stage.", "warn");
  const id = atlasHistoryAuditId();
  if (!id) return status("Save this audit before opening history.", "warn");
  historyView.active = true;
  historyView.auditId = id;
  historyView.returnPage =
    atlasHistoryPage() === "history" ? "overview" : atlasHistoryPage();
  historyView.kind = null;
  historyView.document = null;
  showSection("history");
  await atlasHistoryLoad(false);
  if (kind === "publication" && historyView.publications[0])
    await atlasHistorySelectPublication(
      historyView.publications[0].versionNumber,
    );
  else if (historyView.revisions[0])
    await atlasHistorySelectRevision(historyView.revisions[0].id);
}
function atlasHistoryReturnToCurrent() {
  historyView.active = false;
  historyView.requestGeneration++;
  historyView.kind = null;
  historyView.revisionId = null;
  historyView.publicationId = null;
  historyView.document = null;
  showSection(historyView.returnPage || "overview");
}
async function atlasHistoryCompareCurrent() {
  if (historyView.kind === "revision")
    return atlasViewAuditRevision(historyView.revisionId, true);
  if (historyView.kind === "publication") {
    const p = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(historyView.auditId)}/previews/publications/${encodeURIComponent(historyView.publicationVersion)}`,
    );
    atlasShowHistoryModal(
      "Publication comparison",
      atlasStructuredComparisonHtml(p),
    );
  }
}
function atlasHistoryMove(kind, delta) {
  const list =
      kind === "revision"
        ? historyView.revisions.slice().sort((a, b) => a.number - b.number)
        : historyView.publications
            .slice()
            .sort((a, b) => a.versionNumber - b.versionNumber),
    id =
      kind === "revision" ? historyView.revisionId : historyView.publicationId,
    i = list.findIndex((x) => Number(x.id) === Number(id)),
    next = list[i + delta];
  if (next)
    return kind === "revision"
      ? atlasHistorySelectRevision(next.id)
      : atlasHistorySelectPublication(next.versionNumber);
}
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-history-kind]");
  if (!x) return;
  const kind = x.dataset.historyKind,
    id = x.dataset.historyId;
  if (kind === "revision") atlasHistorySelectRevision(id);
  else if (kind === "publication") {
    const p = historyView.publications.find((v) => String(v.id) === String(id));
    if (p) atlasHistorySelectPublication(p.versionNumber);
  } else if (kind === "activity") {
    const a = historyView.activity.find((v) => String(v.id) === String(id));
    if (a?.publicationVersion)
      atlasHistorySelectPublication(a.publicationVersion);
    else if (a?.resultingRevisionId || a?.sourceRevisionId)
      atlasHistorySelectRevision(a.resultingRevisionId || a.sourceRevisionId);
  } else if (kind === "current") atlasHistoryReturnToCurrent();
});
document
  .getElementById("atlasHistoryReturn")
  ?.addEventListener("click", atlasHistoryReturnToCurrent);
document
  .getElementById("atlasHistoryRefresh")
  ?.addEventListener("click", () => atlasHistoryLoad(false));
document
  .getElementById("atlasHistoryMore")
  ?.addEventListener("click", () => atlasHistoryLoad(true));
document
  .getElementById("atlasRevisionSelector")
  ?.addEventListener(
    "change",
    (e) => e.target.value && atlasHistorySelectRevision(e.target.value),
  );
document
  .getElementById("atlasPublicationSelector")
  ?.addEventListener(
    "change",
    (e) => e.target.value && atlasHistorySelectPublication(e.target.value),
  );
document
  .getElementById("atlasRevisionPrevious")
  ?.addEventListener("click", () => atlasHistoryMove("revision", -1));
document
  .getElementById("atlasRevisionNext")
  ?.addEventListener("click", () => atlasHistoryMove("revision", 1));
document
  .getElementById("atlasPublicationPrevious")
  ?.addEventListener("click", () => atlasHistoryMove("publication", -1));
document
  .getElementById("atlasPublicationNext")
  ?.addEventListener("click", () => atlasHistoryMove("publication", 1));
document
  .getElementById("atlasHistoryCompare")
  ?.addEventListener("click", () =>
    atlasHistoryCompareCurrent().catch((e) => status(e.message, "bad")),
  );
document
  .getElementById("atlasHistoryRestore")
  ?.addEventListener(
    "click",
    () =>
      historyView.kind === "revision" &&
      atlasRestoreAuditRevision(historyView.revisionId),
  );
window.ATLASHistory = {
  open: atlasOpenUnifiedHistory,
  returnToCurrent: atlasHistoryReturnToCurrent,
  refresh: atlasHistoryLoad,
  state: historyView,
};
atlasOpenAuditHistory = function () {
  return atlasOpenUnifiedHistory();
};
