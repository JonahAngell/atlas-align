/**
 * 04-persistence.js
 *
 * IndexedDB crash-recovery autosave for the active audit.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Persistence state
// -----------------------------------------------------------------------------
let autosaveTimer = null;
let atlasAutosaveDirty = false;
let atlasAutosaveRevision = 0;
let atlasAutosaveSavedRevision = 0;

// -----------------------------------------------------------------------------
// IndexedDB helpers
// -----------------------------------------------------------------------------
/**
 * Opens the IndexedDB database used for the recovery draft.
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ATLAS_DB_NAME, ATLAS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATLAS_FLOW_STORE))
        db.createObjectStore(ATLAS_FLOW_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Writes the autosave record to IndexedDB.
 * @param {any} record - IndexedDB record to write.
 */
async function dbPut(record) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ATLAS_FLOW_STORE, "readwrite");
      const request = tx.objectStore(ATLAS_FLOW_STORE).put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Reads a record by id from IndexedDB.
 * @param {any} id - Element id or record id to look up.
 */
async function dbGet(id) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ATLAS_FLOW_STORE, "readonly");
      const request = tx.objectStore(ATLAS_FLOW_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Deletes a record from IndexedDB.
 * @param {any} id - Element id or record id to look up.
 */
async function dbDelete(id) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ATLAS_FLOW_STORE, "readwrite");
      const request = tx.objectStore(ATLAS_FLOW_STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// -----------------------------------------------------------------------------
// Autosave
// -----------------------------------------------------------------------------
/**
 * Debounces autosave after state changes.
 */
function scheduleAutosave(options = {}) {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (state.autosavePaused) return;
  atlasAutosaveDirty = true;
  atlasAutosaveRevision += 1;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveAutosave, 500);
  if (options.database !== false)
    atlasMarkDatabaseDirty?.(options.reason || "edit");
}

/**
 * Writes the current audit to the autosave record.
 */
async function saveAutosave() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  if (
    !atlasAutosaveDirty &&
    atlasAutosaveSavedRevision === atlasAutosaveRevision
  )
    return;
  const revision = atlasAutosaveRevision;
  capture();
  const auditSnapshot = structuredClone(state.audit);
  await dbPut({
    id: ATLAS_AUTOSAVE_ID,
    name: "Autosaved Draft",
    updatedAt: new Date().toISOString(),
    theme: themeMode(),
    audit: auditSnapshot,
  });
  atlasAutosaveSavedRevision = revision;
  atlasAutosaveDirty = atlasAutosaveRevision !== revision;
}

/**
 * Returns true only when the recovery record contains meaningful user work.
 * The current in-memory default audit is never treated as selected recovery.
 */
function atlasIsMeaningfulRecoveryRecord(record) {
  const audit = record?.audit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return false;
  const assignments = audit.assignments || {};
  const assignmentCount = [
    ...(assignments.assignedAnalysts || assignments.assigned || []),
    ...(assignments.backupAnalysts || assignments.backup || []),
    ...(assignments.developers || assignments.developer || []),
  ].length;
  const name = String(audit.name || "").trim();
  const description = String(audit.description ?? audit.purpose ?? "").trim();
  return Boolean(
    (name && name !== "Untitled Audit") ||
    description ||
    assignmentCount ||
    (audit.sources || audit.selectedSources || []).length ||
    (audit.fields || []).length ||
    (audit.displayFields || []).length ||
    (audit.steps || []).length,
  );
}

function atlasRemoveRecoveryOffer() {
  document.getElementById("atlasRecoveryOffer")?.remove();
}

function atlasRenderRecoveryOffer(record) {
  atlasRemoveRecoveryOffer();
  const page = document.getElementById("page-my-audits");
  const target = page?.querySelector(".my-audits-table-scroll");
  if (!page || !target || !record) return;
  const region = document.createElement("section");
  region.id = "atlasRecoveryOffer";
  region.className = "card";
  region.setAttribute("aria-label", "Browser recovery draft available");

  const heading = document.createElement("strong");
  heading.textContent = "Browser recovery draft available";
  const detail = document.createElement("p");
  detail.className = "hint";
  detail.textContent = `${String(record.audit?.name || "Recovered draft")} was saved in this browser. It has not replaced the database audit.`;
  const actions = document.createElement("div");
  actions.className = "actions";

  const recover = document.createElement("button");
  recover.type = "button";
  recover.className = "btn primary";
  recover.textContent = "Recover draft";
  recover.addEventListener("click", () => atlasApplyRecoveryCandidate());

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn secondary";
  dismiss.textContent = "Not now";
  dismiss.addEventListener("click", () => {
    state.recoveryCandidate = null;
    atlasRemoveRecoveryOffer();
  });

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "btn danger";
  clear.textContent = "Clear recovery draft";
  clear.addEventListener("click", () =>
    clearAutosave().catch((error) =>
      status(`Recovery draft could not be cleared: ${error.message}`, "bad"),
    ),
  );

  actions.append(recover, dismiss, clear);
  region.append(heading, detail, actions);
  target.before(region);
}

/**
 * Inspects browser recovery without promoting it to active audit state.
 */
async function inspectAutosaveRecovery() {
  const record = await dbGet(ATLAS_AUTOSAVE_ID);
  state.recoveryCandidate = atlasIsMeaningfulRecoveryRecord(record)
    ? structuredClone(record)
    : null;
  atlasRenderRecoveryOffer(state.recoveryCandidate);
  return state.recoveryCandidate;
}

/**
 * Applies the inspected recovery record only after explicit user activation.
 */
function atlasApplyRecoveryCandidate() {
  const record = state.recoveryCandidate;
  if (!atlasIsMeaningfulRecoveryRecord(record)) return false;
  state.autosavePaused = true;
  state.audit = structuredClone(record.audit);
  state.audit.id = state.audit.id || uid("audit");
  state.selectedStepId = state.audit.steps?.[0]?.id || null;
  state.activeAuditValue = `draft:${state.audit.id}`;
  state.auditPersistence = {
    auditId: null,
    revisionId: null,
    revisionNumber: 0,
    access: null,
    saving: false,
    conflict: null,
  };
  setTheme(record.theme || localStorage.getItem("atlasAlignTheme") || "light");
  state.autosavePaused = false;
  markAuditSelected();
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
  atlasRemoveRecoveryOffer();
  showSection("overview");
  renderAll?.();
  status(
    `Recovered browser draft from ${new Date(record.updatedAt).toLocaleString()}.`,
    "ok",
  );
  return true;
}

/**
 * Deletes the autosave record.
 */
async function clearAutosave() {
  await dbDelete(ATLAS_AUTOSAVE_ID);
  state.recoveryCandidate = null;
  atlasRemoveRecoveryOffer();
  status("Recovery draft cleared.", "ok");
}

// PostgreSQL is the only durable audit store. IndexedDB remains crash recovery only.
refreshSaved = async function refreshDatabaseAudits() {
  await atlasRefreshDatabaseAudits?.();
  state.savedFlows = [];
};
const atlasLocalAutosaveBase = saveAutosave;
saveAutosave = async function saveRecoveryDraftOnly() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  await atlasLocalAutosaveBase();
  const record = await dbGet(ATLAS_AUTOSAVE_ID);
  if (record) {
    record.databaseAuditId = state.auditPersistence?.auditId || null;
    record.baseRevisionId = state.auditPersistence?.revisionId || null;
    await dbPut(record);
  }
};
