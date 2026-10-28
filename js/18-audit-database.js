/** Durable database audit persistence. IndexedDB remains local crash recovery only. */
async function atlasAuditApi(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {}
  if (!response.ok) {
    const error = new Error(
      payload?.error || `Request failed with status ${response.status}.`,
    );
    error.status = response.status;
    error.code = payload?.code;
    error.currentRevisionId = payload?.currentRevisionId;
    error.currentRequestId = payload?.currentRequestId;
    error.currentApprovalId = payload?.currentApprovalId;
    error.currentPublicationId = payload?.currentPublicationId;
    throw error;
  }
  return payload;
}
function atlasApplyLoadedAudit(payload, source = "database", options = {}) {
  state.audit = normalizeLoadedAudit(payload.audit, source);
  state.selectedStepId = state.audit.steps?.[0]?.id || null;
  state.activeAuditValue = `database:${state.audit.id}`;
  state.auditPersistence = {
    auditId: state.audit.id,
    revisionId: payload.revision?.id || null,
    revisionNumber: payload.revision?.number || 0,
    access: payload.access || null,
    saving: false,
    conflict: null,
  };
  markAuditSelected();
  // The baseline below captures the overview controls, so sync them first;
  // otherwise a load that targets another page keeps the previous name, purpose, and status.
  renderHeader?.();
  atlasInvalidateSourceDerivedState?.();
  globalThis.ATLASAuditIssues?.invalidate?.();
  atlasMarkAllPagesDirty?.();
  const targetPage = options.targetPage || atlasActivePage?.() || "overview";
  showSection(targetPage);
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
  atlasResetDatabaseWriteState?.(state.audit.id, { acknowledged: true });
}
async function atlasLoadCurrentUser(options = {}) {
  const { render = true } = options;
  state.currentUserStatus = "loading";
  state.currentUserError = "";
  if (render) {
    renderCurrentUserProfile?.();
    renderMyAudits?.();
  }
  try {
    state.currentUser = await atlasAuditApi("/api/me");
    state.currentUserStatus = "ready";
    await atlasAuditApi("/api/user-profiles/me", {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    state.currentUser = null;
    state.currentUserStatus = "error";
    state.currentUserError = error.message;
  }
  if (render) {
    renderCurrentUserProfile?.();
    renderMyAudits?.();
  }
  return state.currentUser;
}
function atlasSetAuditLibraryLoading(loading) {
  const spinner = document.querySelector("[data-audit-loading-spinner]");
  if (spinner) spinner.hidden = !loading;
}
function atlasSetAuditLibraryStatus(message) {
  const text = document.querySelector("[data-audit-library-status-text]");
  if (text) text.textContent = message;
}
async function atlasRefreshDatabaseAudits(options = {}) {
  const { render = true } = options;
  state.databaseAuditsStatus = "loading";
  state.databaseAuditsError = "";
  if (render) renderMyAudits?.();
  atlasSetAuditLibraryLoading(true);
  atlasSetAuditLibraryStatus("Database audit library has not loaded yet.");
  try {
    const payload = await atlasAuditApi("/api/audits");
    state.databaseAudits = Array.isArray(payload.audits) ? payload.audits : [];
    state.databaseAuditsStatus = "ready";
    if (render) renderMyAudits?.();
    atlasSetAuditLibraryStatus(
      `Loaded ${state.databaseAudits.length} database audit(s).`,
    );
    return state.databaseAudits;
  } catch (error) {
    state.databaseAuditsStatus = "error";
    state.databaseAuditsError = error.message;
    if (render) renderMyAudits?.();
    atlasSetAuditLibraryStatus(
      "The database audit library could not be loaded.",
    );
    throw error;
  } finally {
    atlasSetAuditLibraryLoading(false);
  }
}
let atlasAuditLoadSequence = 0;
async function atlasLoadDatabaseAudit(id, options = {}) {
  const sequence = ++atlasAuditLoadSequence;
  return atlasMeasure?.("atlas.audit.load", async () => {
    const payload = await atlasAuditApi(
      `/api/audits/${encodeURIComponent(id)}`,
    );
    if (sequence !== atlasAuditLoadSequence) return null;
    atlasApplyLoadedAudit(payload, "database", {
      targetPage: options.targetPage || "overview",
    });
    scheduleAutosave({ database: false });
    return payload;
  });
}
const ATLAS_DATABASE_WRITE_DELAY_MS = 2500;
const ATLAS_DATABASE_MAX_DIRTY_MS = 20000;
const atlasDatabaseWriteCoordinator = {
  auditId: "",
  editGeneration: 0,
  acknowledgedGeneration: 0,
  dirtySince: 0,
  trailingTimer: null,
  maximumTimer: null,
  inFlight: null,
  conflict: false,
  error: null,
  pendingReason: "",
};
function atlasClearDatabaseWriteTimers() {
  clearTimeout(atlasDatabaseWriteCoordinator.trailingTimer);
  clearTimeout(atlasDatabaseWriteCoordinator.maximumTimer);
  atlasDatabaseWriteCoordinator.trailingTimer = null;
  atlasDatabaseWriteCoordinator.maximumTimer = null;
}
function atlasResetDatabaseWriteState(
  auditId = state.audit?.id || "",
  options = {},
) {
  atlasClearDatabaseWriteTimers();
  atlasDatabaseWriteCoordinator.auditId = auditId;
  atlasDatabaseWriteCoordinator.editGeneration = 0;
  atlasDatabaseWriteCoordinator.acknowledgedGeneration = options.acknowledged
    ? 0
    : -1;
  atlasDatabaseWriteCoordinator.dirtySince = 0;
  atlasDatabaseWriteCoordinator.inFlight = null;
  atlasDatabaseWriteCoordinator.conflict = false;
  atlasDatabaseWriteCoordinator.error = null;
  atlasDatabaseWriteCoordinator.pendingReason = "";
}
function atlasDatabaseWriteMatchesActiveAudit() {
  return (
    !!state.audit?.id &&
    atlasDatabaseWriteCoordinator.auditId === state.audit.id
  );
}
function atlasHasPendingDatabaseWrite() {
  return (
    atlasDatabaseWriteMatchesActiveAudit() &&
    (atlasDatabaseWriteCoordinator.inFlight ||
      atlasDatabaseWriteCoordinator.editGeneration >
        atlasDatabaseWriteCoordinator.acknowledgedGeneration)
  );
}
function atlasPatchDatabaseAuditListEntry(payload, snapshot) {
  const audit = payload?.audit || snapshot;
  if (!audit?.id) return;
  const current = (state.databaseAudits || []).find(
    (item) => item.id === audit.id,
  );
  const entry = {
    ...(current || {}),
    id: audit.id,
    name: audit.name,
    purpose: audit.purpose || "",
    status: String(audit.status || "").trim() || "Draft",
    assignments: audit.assignments || current?.assignments,
    currentRevisionId:
      payload?.revision?.id || current?.currentRevisionId || null,
    currentRevisionNumber:
      payload?.revision?.number || current?.currentRevisionNumber || 0,
    updatedAt:
      payload?.revision?.createdAt ||
      current?.updatedAt ||
      new Date().toISOString(),
    updatedByUsername:
      payload?.revision?.createdByUsername || current?.updatedByUsername || "",
  };
  if (current) Object.assign(current, entry);
  else state.databaseAudits.push(entry);
  renderMyAudits?.();
  renderActiveAuditSelect?.();
  updateDashboardMetrics?.();
}
function atlasApplyAuditSaveMetadata(payload, snapshot, sentGeneration) {
  if (!payload?.revision?.id)
    throw new Error(
      "The database save response did not include revision metadata.",
    );
  atlasDatabaseWriteCoordinator.acknowledgedGeneration = Math.max(
    atlasDatabaseWriteCoordinator.acknowledgedGeneration,
    sentGeneration,
  );
  atlasDatabaseWriteCoordinator.error = null;
  atlasDatabaseWriteCoordinator.conflict = false;
  atlasPatchDatabaseAuditListEntry(payload, snapshot);
  if (state.audit?.id !== snapshot.id) return;
  state.auditPersistence.auditId = snapshot.id;
  state.auditPersistence.revisionId = payload.revision.id;
  state.auditPersistence.revisionNumber = payload.revision.number || 0;
  state.auditPersistence.access =
    payload.access || state.auditPersistence.access || null;
  state.auditPersistence.conflict = null;
  state.activeAuditValue = `database:${snapshot.id}`;
  state.activeAuditBaseline = JSON.stringify(snapshot);
  renderActiveAuditSelect?.();
  updateDashboardMetrics?.();
}
function atlasMarkDatabaseDirty(reason = "edit") {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (state.auditPersistence?.access && !state.auditPersistence.access.canEdit)
    return;
  if (
    !hasSelectedAudit?.() ||
    !state.audit?.id ||
    state.autosavePaused ||
    $("deleteAuditBtn")?.matches('[aria-busy="true"]')
  )
    return;
  if (!atlasDatabaseWriteMatchesActiveAudit())
    atlasResetDatabaseWriteState(state.audit.id);
  atlasDatabaseWriteCoordinator.editGeneration += 1;
  atlasDatabaseWriteCoordinator.pendingReason = reason;
  atlasDatabaseWriteCoordinator.error = null;
  if (!atlasDatabaseWriteCoordinator.dirtySince)
    atlasDatabaseWriteCoordinator.dirtySince = Date.now();
  const needsCreate =
    !state.auditPersistence?.revisionId ||
    state.auditPersistence.auditId !== state.audit.id;
  if (needsCreate) {
    queueMicrotask(() =>
      atlasFlushDatabaseWrite("Created audit").catch((error) =>
        status?.(`Database create failed: ${error.message}`, "bad"),
      ),
    );
    return;
  }
  atlasScheduleDatabaseWrite(reason);
}
function atlasScheduleDatabaseWrite(reason = "edit") {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (
    !atlasDatabaseWriteMatchesActiveAudit() ||
    atlasDatabaseWriteCoordinator.conflict
  )
    return;
  clearTimeout(atlasDatabaseWriteCoordinator.trailingTimer);
  atlasDatabaseWriteCoordinator.trailingTimer = setTimeout(
    () =>
      atlasFlushDatabaseWrite(`Autosaved after ${reason}`).catch((error) =>
        status?.(`Database save failed: ${error.message}`, "bad"),
      ),
    ATLAS_DATABASE_WRITE_DELAY_MS,
  );
  if (!atlasDatabaseWriteCoordinator.maximumTimer) {
    atlasDatabaseWriteCoordinator.maximumTimer = setTimeout(
      () =>
        atlasFlushDatabaseWrite("Maximum dirty interval").catch((error) =>
          status?.(`Database save failed: ${error.message}`, "bad"),
        ),
      ATLAS_DATABASE_MAX_DIRTY_MS,
    );
  }
}
async function atlasPerformDatabaseWrite(changeSummary) {
  if (window.ATLASAuditReview?.isActive?.()) return;
  const exists =
    state.auditPersistence.auditId === state.audit?.id &&
    !!state.auditPersistence.revisionId;
  const allowed = exists
    ? state.auditPersistence?.access?.canEdit
    : state.currentUser?.access?.canCreate;
  if (!allowed)
    throw new Error(
      "The verified atlas-admin-team role is required to change audits.",
    );
  capture?.();
  const auditId = state.audit.id;
  const snapshot = structuredClone(state.audit);
  const sentGeneration = atlasDatabaseWriteCoordinator.editGeneration;
  const expectedRevisionId = exists ? state.auditPersistence.revisionId : null;
  state.auditPersistence.saving = true;
  try {
    const payload = await atlasAuditApi(
      exists ? `/api/audits/${encodeURIComponent(auditId)}` : "/api/audits",
      {
        method: exists ? "PUT" : "POST",
        body: JSON.stringify({
          audit: snapshot,
          expectedRevisionId,
          changeSummary: changeSummary || null,
        }),
      },
    );
    atlasApplyAuditSaveMetadata(payload, snapshot, sentGeneration);
    status?.(
      `Saved ${snapshot.name} as revision ${payload.revision.number}.`,
      "ok",
    );
    return true;
  } catch (error) {
    atlasDatabaseWriteCoordinator.error = error;
    if (
      error.status === 409 &&
      error.code === "AUDIT_PENDING_APPROVAL_LOCKED"
    ) {
      atlasClearDatabaseWriteTimers();
      atlasDatabaseWriteCoordinator.acknowledgedGeneration =
        atlasDatabaseWriteCoordinator.editGeneration;
      status?.(error.message, "warn");
      await window.ATLASWorkflow?.refresh?.();
      return false;
    }
    if (error.status === 409) {
      atlasDatabaseWriteCoordinator.conflict = true;
      state.auditPersistence.conflict = {
        currentRevisionId: error.currentRevisionId,
      };
      atlasOpenConflictDialog?.(error);
      return false;
    }
    throw error;
  } finally {
    if (state.audit?.id === auditId) state.auditPersistence.saving = false;
  }
}
async function atlasFlushDatabaseWrite(reason = "explicit save") {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (!hasSelectedAudit?.() || !state.audit?.id) return true;
  if (!atlasDatabaseWriteMatchesActiveAudit())
    atlasResetDatabaseWriteState(state.audit.id);
  atlasClearDatabaseWriteTimers();
  if (atlasDatabaseWriteCoordinator.conflict) return false;
  if (atlasDatabaseWriteCoordinator.inFlight) {
    await atlasDatabaseWriteCoordinator.inFlight;
    if (atlasDatabaseWriteCoordinator.conflict) return false;
    if (
      atlasDatabaseWriteCoordinator.editGeneration <=
      atlasDatabaseWriteCoordinator.acknowledgedGeneration
    )
      return true;
  }
  const needsCreate =
    !state.auditPersistence?.revisionId ||
    state.auditPersistence.auditId !== state.audit.id;
  if (
    !needsCreate &&
    atlasDatabaseWriteCoordinator.editGeneration <=
      atlasDatabaseWriteCoordinator.acknowledgedGeneration &&
    !auditHasUnsavedChanges()
  )
    return true;
  const write = atlasPerformDatabaseWrite(reason);
  atlasDatabaseWriteCoordinator.inFlight = write;
  let result;
  try {
    result = await write;
  } finally {
    if (atlasDatabaseWriteCoordinator.inFlight === write)
      atlasDatabaseWriteCoordinator.inFlight = null;
  }
  if (!result) return false;
  if (
    atlasDatabaseWriteCoordinator.editGeneration >
    atlasDatabaseWriteCoordinator.acknowledgedGeneration
  ) {
    return atlasFlushDatabaseWrite("Saved edits made during database write");
  }
  atlasDatabaseWriteCoordinator.dirtySince = 0;
  return true;
}
async function atlasCreateAuditDocument(document, reason = "Created audit") {
  if (!document?.id) throw new Error("A new audit document ID is required.");
  if (!state.currentUser?.access?.canCreate)
    throw new Error(
      "The verified atlas-admin-team role is required to create audits.",
    );
  const payload = await atlasAuditApi("/api/audits", {
    method: "POST",
    body: JSON.stringify({
      audit: structuredClone(document),
      expectedRevisionId: null,
      changeSummary: reason,
    }),
  });
  if (!payload?.audit?.id || !payload?.revision?.id)
    throw new Error(
      "The audit create response did not include accepted revision identity.",
    );
  atlasApplyLoadedAudit(payload, "database", { targetPage: "overview" });
  scheduleAutosave({ database: false });
  return payload;
}

async function atlasCreateCurrentAudit(reason = "Created audit") {
  if (!state.audit?.id) return false;
  if (!state.currentUser?.access?.canCreate)
    throw new Error(
      "The verified atlas-admin-team role is required to create audits.",
    );
  atlasResetDatabaseWriteState(state.audit.id);
  atlasDatabaseWriteCoordinator.editGeneration = 1;
  atlasDatabaseWriteCoordinator.dirtySince = Date.now();
  return atlasFlushDatabaseWrite(reason);
}
async function atlasSaveCurrentAudit(changeSummary = "") {
  if (window.ATLASAuditReview?.isActive?.()) return;
  return atlasFlushDatabaseWrite(changeSummary || "Explicit save");
}
function atlasIsDatabaseAuditDirty() {
  if (!hasSelectedAudit?.() || !state.audit?.id) return false;
  const needsCreate =
    !state.auditPersistence?.revisionId ||
    state.auditPersistence.auditId !== state.audit.id;
  return (
    needsCreate || atlasHasPendingDatabaseWrite() || auditHasUnsavedChanges()
  );
}
async function atlasSaveIfDirty(reason = "navigation") {
  if (!atlasIsDatabaseAuditDirty()) return true;
  return atlasFlushDatabaseWrite(`Saved on ${reason}`);
}
async function atlasNavigateToSection(section) {
  const target = pageForSection(section);
  const current = document.querySelector(".page.active")?.dataset.page || "";
  if (target === current) return;
  const workspacePages = ATLAS_WORKSPACE_PAGES;
  if (workspacePages.has(target) && window.ATLASAuditReview?.isActive?.())
    await window.ATLASAuditReview.close({ restoreFocus: false });
  showSection(target);
  if (atlasIsDatabaseAuditDirty())
    atlasScheduleDatabaseWrite("page navigation");
}
function atlasSaveOnPageHide() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (
    $("deleteAuditBtn")?.matches('[aria-busy="true"]') ||
    !atlasIsDatabaseAuditDirty() ||
    !state.auditPersistence?.revisionId
  )
    return;
  capture?.();
  const auditId = state.auditPersistence.auditId;
  const body = JSON.stringify({
    audit: structuredClone(state.audit),
    expectedRevisionId: state.auditPersistence.revisionId,
    changeSummary: "Saved on window close",
  });
  fetch(`/api/audits/${encodeURIComponent(auditId)}`, {
    method: "PUT",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}

function atlasAuditDocumentsFromJson(json) {
  const candidates = Array.isArray(json?.flows)
    ? json.flows
    : Array.isArray(json?.audits)
      ? json.audits
      : Array.isArray(json)
        ? json
        : [json];
  return candidates
    .map((item) => item?.audit || item)
    .filter((item) => item && typeof item === "object" && !Array.isArray(item));
}
async function atlasImportAuditDocuments(
  documents,
  summary = "Imported JSON audit",
) {
  if (!state.currentUser?.access?.canCreate)
    throw new Error(
      "The verified atlas-admin-team role is required to import audits.",
    );
  const flushed = await atlasSaveIfDirty("audit import");
  if (!flushed)
    throw new Error("Resolve the current audit save before importing.");
  const normalized = documents.map((document) =>
    normalizeLoadedAudit(document, "database-import"),
  );
  const payload = await atlasAuditApi("/api/audits/import", {
    method: "POST",
    body: JSON.stringify({ audits: normalized, changeSummary: summary }),
  });
  await atlasRefreshDatabaseAudits();
  await refreshSaved?.();
  renderAuditLibrarySelect?.();
  renderActiveAuditSelect?.();
  updateDashboardMetrics?.();
  return payload;
}
async function atlasImportAuditJsonFile(file) {
  const json = JSON.parse(await file.text());
  const parsed = atlasAuditDocumentsFromJson(json);
  if (!parsed.length)
    throw new Error(
      "The selected JSON file does not contain an audit or saved audit bundle.",
    );
  if (!state.currentUser?.access?.canCreate)
    throw new Error(
      "The verified atlas-admin-team role is required to import audits.",
    );
  // Sources missing from the Source Library are created or mapped first.
  const documents = await atlasReviewImportSources(json, parsed, file.name);
  if (!documents) {
    status("Import canceled. No audits or sources were saved.", "warn");
    return { imported: [], skipped: [], failed: [], canceled: true };
  }
  const result = await atlasImportAuditDocuments(
    documents,
    `Imported from ${file.name}`,
  );
  const summary = $("auditImportSummary");
  const imported = result.imported?.length || 0;
  const skipped = result.skipped?.length || 0;
  const failed = result.failed?.length || 0;
  if (summary)
    summary.textContent = `Import complete: ${imported} imported, ${skipped} unchanged, ${failed} failed.`;
  if (failed)
    status(
      `Imported ${imported} audit(s); ${failed} failed. Review the import summary.`,
      "warn",
    );
  else status(`Imported ${imported} audit(s) into the database.`, "ok");
  return result;
}
async function atlasArchiveCurrentAudit() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  const archiveButton = $("deleteAuditBtn");
  if (archiveButton?.matches('[aria-busy="true"]')) return false;
  if (
    !hasSelectedAudit?.() ||
    !state.auditPersistence?.revisionId ||
    state.auditPersistence.auditId !== state.audit?.id
  )
    throw new Error("Select a saved database audit before deleting it.");
  if (!state.auditPersistence.access?.canArchive)
    throw new Error("You do not have permission to delete this audit.");
  if (
    !confirm(
      `Delete ${state.audit.name}? This audit will move to Recently Deleted and can be restored by an authorized administrator.`,
    )
  )
    return false;

  const auditId = state.audit.id;
  const auditName = state.audit.name;
  const previousAutosavePaused = state.autosavePaused;
  let archived = false;
  if (archiveButton) {
    archiveButton.disabled = true;
    archiveButton.setAttribute("aria-busy", "true");
    archiveButton.textContent = "Deleting audit...";
  }
  state.autosavePaused = true;
  clearTimeout(autosaveTimer);
  atlasAuditLoadSequence += 1;
  try {
    const flushed = await atlasSaveIfDirty("archive");
    if (!flushed)
      throw new Error(
        "Resolve the current database save conflict before deleting this audit.",
      );
    if (state.audit?.id !== auditId)
      throw new Error(
        "The active audit changed before deletion could complete.",
      );

    atlasClearDatabaseWriteTimers();
    await atlasAuditApi(`/api/audits/${encodeURIComponent(auditId)}`, {
      method: "DELETE",
      body: JSON.stringify({
        expectedRevisionId: state.auditPersistence.revisionId,
      }),
    });
    archived = true;
    atlasAutosaveDirty = false;
    atlasAutosaveSavedRevision = atlasAutosaveRevision;
    await dbDelete(ATLAS_AUTOSAVE_ID);
    await atlasRefreshDatabaseAudits({ render: false });
    state.audit = defaultAudit();
    state.auditPersistence = {
      auditId: null,
      revisionId: null,
      revisionNumber: 0,
      access: null,
      saving: false,
      conflict: null,
    };
    state.activeAuditValue = "";
    state.pendingActiveAuditValue = "";
    clearAuditSelection();
    atlasResetDatabaseWriteState("");
    atlasMarkAllPagesDirty?.();
    showSection("my-audits");
    renderAll();
    status(`${auditName} was moved to Recently Deleted.`, "ok");
    return true;
  } finally {
    state.autosavePaused = previousAutosavePaused;
    if (archiveButton) {
      archiveButton.removeAttribute("aria-busy");
      archiveButton.textContent = "Delete Audit";
      archiveButton.disabled = false;
    }
    if (!archived && hasSelectedAudit?.()) scheduleAutosave();
  }
}
async function atlasInitAuditDatabase(options = {}) {
  await atlasRefreshDatabaseAudits(options);
}

// Minimal profile-cache API. Avatar refreshes remain presentation state and do not save audits.
async function atlasSearchCachedUsers(query = "", options = {}) {
  const q = String(query || "").trim();
  return atlasAuditApi(
    `/api/user-profiles?q=${encodeURIComponent(q)}&size=${Math.min(25, options.size || 20)}`,
    { signal: options.signal },
  );
}
async function atlasSearchDirectoryProfiles(query, options = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return { items: [] };
  return atlasAuditApi(
    `/api/user-profiles/directory?q=${encodeURIComponent(q)}&page=${options.page || 1}&size=${Math.min(25, options.size || 10)}`,
    { signal: options.signal },
  );
}
async function atlasResolveUserProfiles(users, options = {}) {
  const identities = (users || [])
    .map((user) => ({
      id: String(user?.id || "").trim(),
      username: String(user?.username || "").trim(),
    }))
    .filter((user) => user.id || user.username);
  return atlasAuditApi("/api/user-profiles/resolve", {
    method: "POST",
    body: JSON.stringify({ users: identities }),
    signal: options.signal,
  });
}
const atlasProfileHydrationApplyBase = atlasApplyLoadedAudit;
atlasApplyLoadedAudit = function atlasApplyLoadedAuditWithProfileHydration(
  payload,
  source = "database",
  options = {},
) {
  const result = atlasProfileHydrationApplyBase(payload, source, options);
  queueMicrotask(() => atlasHydrateAssignedUserProfiles?.());
  return result;
};

async function atlasRefreshDeletedAudits() {
  if (!state.currentUser?.access?.canManageDeletedAudits) return [];
  state.deletedAuditsStatus = "loading";
  renderMyAudits();
  try {
    const p = await atlasAuditApi("/api/admin/audits/deleted");
    state.deletedAudits = Array.isArray(p.audits) ? p.audits : [];
    state.deletedAuditsStatus = "ready";
    state.deletedAuditsError = "";
    renderMyAudits();
    return state.deletedAudits;
  } catch (e) {
    state.deletedAuditsStatus = "error";
    state.deletedAuditsError = e.message;
    renderMyAudits();
    throw e;
  }
}
async function atlasRestoreDeletedAudit(id) {
  const a = (state.deletedAudits || []).find((x) => x.id === id);
  if (!a || !confirm(`Restore "${a.name}" to the active Audit Library?`))
    return;
  await atlasAuditApi(`/api/admin/audits/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  await Promise.all([
    atlasRefreshDeletedAudits(),
    atlasRefreshDatabaseAudits(),
  ]);
  status("Audit restored.", "ok");
}
async function atlasPermanentlyDeleteAudit(id) {
  const a = (state.deletedAudits || []).find((x) => x.id === id);
  if (!a || !confirm(`Permanently delete "${a.name}"? This cannot be undone.`))
    return;
  await atlasAuditApi(`/api/admin/audits/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await atlasRefreshDeletedAudits();
  status("Audit permanently deleted.", "ok");
}
