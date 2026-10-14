/**
 * 04-persistence.js
 *
 * IndexedDB persistence layer for saved audits, autosave, import/export bundles, and active audit switching support.
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
 * Opens the IndexedDB database used for saved flows.
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
 * Reads all saved flow records from IndexedDB.
 */
async function dbAll() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ATLAS_FLOW_STORE, "readonly");
      const request = tx.objectStore(ATLAS_FLOW_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Writes a saved flow or autosave record to IndexedDB.
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
 * Reads a saved flow by id from IndexedDB.
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
 * Deletes a saved flow from IndexedDB.
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
// Saved audit operations
// -----------------------------------------------------------------------------
/**
 * Loads saved flows into state and updates the saved-flow selector.
 */
async function refreshSaved() {
  const all = (await dbAll()).filter(
    (record) => record.id !== ATLAS_AUTOSAVE_ID,
  );
  state.savedFlows = all.sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  e.flowSelect.innerHTML = state.savedFlows.length
    ? state.savedFlows
        .map(
          (flow) =>
            `<option value="${flow.id}">${esc(flow.name)} — ${new Date(flow.updatedAt).toLocaleString()}</option>`,
        )
        .join("")
    : '<option value="">No saved audits yet</option>';
  e.saveStatus.textContent = `${state.savedFlows.length} saved audit${state.savedFlows.length === 1 ? "" : "s"} in this browser.`;
}

/**
 * Prompts for a name and saves the current audit locally.
 */
async function saveFlow() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  capture();
  const id = e.flowSelect.value || uid("flow");
  const name = prompt(
    "Name this saved audit:",
    state.audit.name || "Audit Logic Flow",
  );
  if (!name) return;
  const existing = await dbGet(id);
  const record = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    audit: structuredClone({ ...state.audit, name }),
  };
  await dbPut(record);
  await refreshSaved();
  e.flowSelect.value = id;
  state.activeAuditValue = `local:${id}`;
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
  status(`Saved audit: ${name}`, "ok");
}

/**
 * Saves the active audit before switching when requested.
 */
async function saveCurrentAuditForSwitch() {
  if (window.ATLASAuditReview?.isActive?.()) return;
  capture?.();
  const isLocal = String(state.activeAuditValue || "").startsWith("local:");
  const id = isLocal
    ? state.activeAuditValue.split(":").slice(1).join(":")
    : uid("flow");
  const existing = isLocal ? await dbGet(id) : null;
  let name = state.audit.name || existing?.name || "Audit Logic Flow";
  if (!isLocal || !name) {
    const promptedName = prompt(
      "Save current audit as:",
      name || "Audit Logic Flow",
    );
    if (!promptedName) return false;
    name = promptedName;
  }
  const record = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    audit: structuredClone({ ...state.audit, name }),
  };
  await dbPut(record);
  await refreshSaved();
  state.activeAuditValue = `local:${id}`;
  if (e.flowSelect) e.flowSelect.value = id;
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
  status(`Saved audit: ${name}`, "ok");
  return true;
}

/**
 * Loads a locally saved audit.
 */
async function loadFlow() {
  const id = e.flowSelect.value;
  if (!id) return status("Select a saved audit first.", "warn");
  const record = await dbGet(id);
  if (!record) return;
  state.audit = structuredClone(record.audit);
  state.selectedStepId = state.audit.steps[0]?.id || null;
  state.activeAuditValue = `local:${id}`;
  markAuditSelected();
  atlasMarkAllPagesDirty?.();
  showSection("overview");
  atlasRenderActivePage?.({ force: true });
  status(`Loaded saved audit: ${record.name}.`, "ok");
  scheduleAutosave();
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
}

/**
 * Deletes the selected saved audit.
 */
async function deleteFlow() {
  const id = e.flowSelect.value;
  if (!id) return status("Select a saved audit first.", "warn");
  if (!confirm("Delete selected saved audit from this browser?")) return;
  await dbDelete(id);
  await refreshSaved();
  status("Saved audit deleted.", "ok");
}

/**
 * Exports the saved audit bundle.
 */
async function exportAll() {
  const bundle = {
    app: ATLAS_APP_NAME,
    bundleType: "atlas-align-audit-logic-flows",
    exportedAt: new Date().toISOString(),
    flows: state.savedFlows,
  };
  downloadJson(`atlas_align_saved_audits_${today()}.json`, bundle);
}

/**
 * Imports one or more saved audits from a JSON file.
 * @param {any} file - Browser File object to import.
 */
async function importAll(file) {
  const json = JSON.parse(await file.text());
  const flows = Array.isArray(json.flows)
    ? json.flows
    : Array.isArray(json)
      ? json
      : [
          {
            id: uid("flow"),
            name: json.name || json.preset_name || "Imported Audit",
            updatedAt: new Date().toISOString(),
            audit: json,
          },
        ];
  for (const flow of flows) {
    await dbPut({
      id: flow.id || uid("flow"),
      name: flow.name || flow.audit?.name || "Imported Audit",
      createdAt: flow.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: flow.audit || flow,
    });
  }
  await refreshSaved();
  status("Imported saved audit flow(s).", "ok");
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
  e.autosaveStatus.textContent = `Autosaved draft at ${new Date().toLocaleString()}.`;
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
  e.autosaveStatus.textContent = `Recovered browser draft from ${new Date(record.updatedAt).toLocaleString()}.`;
  return true;
}

/**
 * Deletes the autosave record.
 */
async function clearAutosave() {
  await dbDelete(ATLAS_AUTOSAVE_ID);
  state.recoveryCandidate = null;
  atlasRemoveRecoveryOffer();
  e.autosaveStatus.textContent = "Autosaved draft cleared.";
}

/**
 * Deletes the IndexedDB database used for saved audits and autosave records.
 */
function deleteAtlasDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(ATLAS_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ||
          new Error("Could not delete the local audit database."),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other ATLAS Align tabs and try clearing local data again.",
        ),
      );
  });
}

/**
 * Removes browser storage used by this app. Repo JSON files are not changed.
 */
function deleteAtlasValidationDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve();
    const request = indexedDB.deleteDatabase("atlasAlignValidation");
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error || new Error("Could not delete local validation data."),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other ATLAS Align tabs and try clearing local data again.",
        ),
      );
  });
}

function clearAtlasBrowserStorage() {
  const appPrefixes = ["atlasAlign", "atlas-validation:"];
  [localStorage, sessionStorage].forEach((store) => {
    if (!store) return;
    Object.keys(store).forEach((key) => {
      if (appPrefixes.some((prefix) => key.startsWith(prefix)))
        store.removeItem(key);
    });
  });
}

/**
 * Confirms and clears all locally saved app data, then reloads from a clean state.
 */
async function resetLocalAppData() {
  const warning = [
    "Clear all saved ATLAS Align data from this browser?",
    "",
    "This will permanently delete locally saved audits, the autosaved draft, app preferences, and navigation state stored in this browser.",
    "Repo/source JSON files and downloaded exports will not be changed.",
    "",
    "This action cannot be undone. Continue?",
  ].join("\n");
  if (!confirm(warning)) return;
  state.autosavePaused = true;
  clearTimeout(autosaveTimer);
  await Promise.all([deleteAtlasDatabase(), deleteAtlasValidationDatabase()]);
  clearAtlasBrowserStorage();
  window.location.reload();
}

// PostgreSQL is the only durable audit store. IndexedDB remains crash recovery only.
function atlasRenderSavedAuditList() {
  const flowList = document.getElementById("flowAuditList");
  const audits = state.databaseAudits || [];
  if (!flowList) return;
  const query = String(document.getElementById("flowAuditSearch")?.value || "")
    .trim()
    .toLowerCase();
  const visible = audits.filter((audit) =>
    `${audit.name || ""} ${audit.id || ""}`.toLowerCase().includes(query),
  );
  flowList.hidden = false;
  flowList.innerHTML = visible.length
    ? visible
        .map(
          (audit) =>
            `<div class="atlas-saved-audit-row"><span>${esc(audit.name)} — revision ${esc(audit.currentRevisionNumber || 0)}</span><button type="button" class="btn secondary small" data-load-saved-audit="${esc(audit.id)}">Load</button></div>`,
        )
        .join("")
    : '<p class="hint">No matching saved audits.</p>';
}
refreshSaved = async function refreshDatabaseAudits() {
  await atlasRefreshDatabaseAudits?.();
  state.savedFlows = [];
  atlasRenderSavedAuditList();
  if (e.saveStatus)
    e.saveStatus.textContent = `${(state.databaseAudits || []).length} audit${(state.databaseAudits || []).length === 1 ? "" : "s"} in the shared database.`;
};
document.addEventListener("input", (event) => {
  if (event.target?.id !== "flowAuditSearch") return;
  atlasRenderSavedAuditList();
});
document.addEventListener("click", (event) => {
  const load = event.target.closest?.("[data-load-saved-audit]");
  if (!load) return;
  event.preventDefault();
  if (e.flowSelect) e.flowSelect.value = load.dataset.loadSavedAudit || "";
  loadFlow?.()?.catch?.((err) => status?.(err.message, "bad"));
});
saveFlow = async function saveDatabaseAudit() {
  return atlasSaveCurrentAudit?.();
};
saveCurrentAuditForSwitch = async function saveDatabaseAuditForSwitch() {
  return atlasSaveCurrentAudit?.("Saved before switching audits");
};
loadFlow = async function loadDatabaseAuditFromSelect() {
  const id = e.flowSelect?.value;
  if (!id) return status("Select a database audit first.", "warn");
  return atlasLoadDatabaseAudit(id);
};
deleteFlow = async function archiveDatabaseAudit() {
  return atlasArchiveCurrentAudit?.();
};
exportAll = async function exportDatabaseAuditIndex() {
  const payload = await atlasAuditApi("/api/audits");
  downloadJson(`atlas_align_database_audit_index_${today()}.json`, payload);
};
importAll = async function importJsonAuditsToDatabase(file) {
  return atlasImportAuditJsonFile(file);
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
