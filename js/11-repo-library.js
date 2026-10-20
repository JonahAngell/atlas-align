/**
 * 11-repo-library.js
 *
 * Repository-backed audit/source library loading and active audit switching.
 * Fetches JSON catalog assets and normalizes loaded audits.
 * Auto-generated documentation comments explain function purpose, expected inputs,
 * and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Repository library state
// -----------------------------------------------------------------------------
const repoLibraryState = {
  loaded: false,
  index: null,
  audits: [],
  vanityLabels: [],
  sourceAliases: [],
  sourceFileIndex: [],
  sourceFiles: [],
  sourceFileCache: new Map(),
  warnings: [],
  fieldLibraryProvenance: null,
};

// -----------------------------------------------------------------------------
// Repository fetch helpers
// -----------------------------------------------------------------------------
/**
 * Fetches JSON and records a warning instead of throwing.
 * @param {any} path - Catalog path or file path.
 * @param {any} label - Human-readable label.
 */
async function fetchJsonGracefully(path, label) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    repoLibraryState.warnings.push(
      `${label || path} could not be loaded from ${path}.`,
    );
    return null;
  }
}

/**
 * Returns the stable catalog identity for a source entry.
 * sourceFile remains the business/physical source name; sourceKey is the app identity.
 * @param {any} sourceOrEntry - Source detail or index entry.
 */
function sourceCatalogKey(sourceOrEntry = {}) {
  return String(
    sourceOrEntry.sourceKey ||
      sourceOrEntry.catalogKey ||
      sourceOrEntry.alias ||
      sourceOrEntry.file ||
      sourceOrEntry.sourceFile ||
      sourceOrEntry.name ||
      "",
  ).trim();
}

/**
 * Builds a concise display name for source catalog rows and picker options.
 * @param {any} source - Source file record.
 */
function sourceCatalogDisplayName(source = {}) {
  const sourceFile =
    source.sourceFile || source.name || sourceCatalogKey(source);
  const alias = source.alias || "";
  return alias && alias !== sourceFile
    ? `${sourceFile} — ${alias}`
    : sourceFile;
}

/**
 * Builds source metadata subtitle text used to distinguish duplicate sourceFile values.
 * @param {any} source - Source file record.
 */
function sourceCatalogSubtitle(source = {}) {
  const meta = source.sourceMetadata || {};
  return [source.alias, meta.sourceSystem, meta.population, meta.frequency]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Loads and caches detailed source metadata from a source index entry.
 * @param {any} entry - Input used by loadSourceFileDetail.
 */
async function loadSourceFileDetail(entry) {
  if (!entry?.sourceFile && !entry?.alias && !entry?.file) return null;
  const entryKey = sourceCatalogKey(entry);
  if (entryKey && repoLibraryState.sourceFileCache.has(entryKey))
    return repoLibraryState.sourceFileCache.get(entryKey);
  const json = await fetchJsonGracefully(
    entry.file,
    entry.sourceFile || entry.alias || entry.file,
  );
  const detail = json || {
    version: 1,
    sourceFile: entry.sourceFile,
    alias: entry.alias || entry.sourceFile,
    fieldCount: entry.fieldCount || 0,
    fields: [],
  };

  detail.sourceFile =
    detail.sourceFile || entry.sourceFile || entry.alias || entry.file;
  detail.alias = detail.alias || entry.alias || detail.sourceFile;
  detail.catalogFile = entry.file || detail.catalogFile || "";
  detail.sourceKey = sourceCatalogKey({ ...entry, ...detail });
  detail.fields = Array.isArray(detail.fields) ? detail.fields : [];
  repoLibraryState.sourceFileCache.set(detail.sourceKey, detail);
  return detail;
}

/**
 * Loads source file metadata from configured repository catalog paths.
 * @param {any} index - Zero-based index used for ordering or display.
 */
async function loadSourceFileLibrary(_index) {
  repoLibraryState.fieldLibraryProvenance = null;
  atlasRenderFieldLibraryLightboard?.();
  try {
    const payload = await atlasFetchSourceLibrary();
    repoLibraryState.fieldLibraryProvenance = payload?.provenance || {
      state: "unavailable",
      label: "Unavailable",
      detail: "Field library unavailable.",
    };
    repoLibraryState.sourceFiles = (
      Array.isArray(payload?.sources) ? payload.sources : []
    ).map((source) => ({
      ...source,
      sourceKey: sourceCatalogKey(source),
      catalogFile: "",
      fields: Array.isArray(source.fields) ? source.fields : [],
    }));
    repoLibraryState.sourceFileIndex = repoLibraryState.sourceFiles.map(
      (source) => ({
        sourceKey: source.sourceKey,
        sourceFile: source.sourceFile,
        alias: source.alias || source.sourceFile,
        fieldCount: source.fields?.length || 0,
        file: "",
      }),
    );
  } catch (error) {
    repoLibraryState.fieldLibraryProvenance = {
      state: "unavailable",
      label: "Unavailable",
      detail: "Field library unavailable.",
    };
    atlasRenderFieldLibraryLightboard?.();
    throw error;
  }
  atlasRenderFieldLibraryLightboard?.();
}

// -----------------------------------------------------------------------------
// Library loading
// -----------------------------------------------------------------------------
/**
 * Loads repository audits, aliases, vanity labels, and source files.
 */
async function loadRepoLibrary(options = {}) {
  const { render = true, refreshAudits = true } = options;
  return atlasMeasure?.("atlas.repo.load", async () => {
    repoLibraryState.loaded = false;
    repoLibraryState.warnings = [];
    repoLibraryState.sourceFileCache.clear();
    repoLibraryState.index = null;
    repoLibraryState.audits = [];
    // The field library does not depend on the catalogs; fetch it alongside
    // them, but apply it after them as before.
    const sourceFiles = loadSourceFileLibrary();
    sourceFiles.catch(() => {});
    const [vanity, aliases] = await Promise.all([
      fetchJsonGracefully(
        "catalogs/vanity-labels.json",
        "vanity labels catalog",
      ),
      fetchJsonGracefully(
        "catalogs/source-table-aliases.json",
        "source aliases catalog",
      ),
    ]);
    repoLibraryState.vanityLabels = Array.isArray(vanity?.items)
      ? vanity.items
      : Array.isArray(vanity)
        ? vanity
        : [];
    repoLibraryState.sourceAliases = Array.isArray(aliases?.items)
      ? aliases.items
      : Array.isArray(aliases)
        ? aliases
        : [];
    if (refreshAudits) await atlasRefreshDatabaseAudits?.();
    await sourceFiles;
    repoLibraryState.loaded = true;
    state.repoLibrary = repoLibraryState;
    atlasInvalidateSourceDerivedState?.();
    atlasMarkFieldPickerDirty?.();
    atlasInvalidatePages?.([
      "my-audits",
      "overview",
      "fields",
      "steps",
      "review",
    ]);
    if (render) atlasRenderActivePage?.({ force: true });
    return repoLibraryState;
  });
}
// -----------------------------------------------------------------------------
// Library rendering
// -----------------------------------------------------------------------------
/**
 * Renders repository library load status.
 */
function renderRepoLibraryStatus() {
  const target = document.querySelector("[data-audit-library-status-text]");
  if (!target) return;
  if (!repoLibraryState.loaded) {
    target.textContent = "Database audit library has not loaded yet.";
    return;
  }
  const warningText = repoLibraryState.warnings.length
    ? ` ${repoLibraryState.warnings.length} warning(s).`
    : "";
  target.textContent = `Loaded ${(state.databaseAudits || []).length} database audit(s) and ${repoLibraryState.sourceFiles.length} database source file(s).${warningText}`;
}

// Audit library rendering is owned by 15-visual-ui-upgrades.js.
// Shared option data is exposed through getAuditLibraryItems().
function getAuditLibraryItems() {
  const items = (state.databaseAudits || []).map((audit) => ({
    value: `database:${audit.id}`,
    title: audit.name || audit.id,
    detail: `Revision ${audit.currentRevisionNumber || 0}${audit.updatedByUsername ? ` · ${audit.updatedByUsername}` : ""}`,
    kind: "Database Audit",
    group: "Database Audits",
  }));
  if (typeof workbookState !== "undefined" && workbookState.loaded) {
    (workbookState.auditSheets || []).forEach((name) =>
      items.push({
        value: `workbook:${name}`,
        title: name,
        detail: "Workbook audit sheet",
        kind: "Workbook Import",
        group: "Workbook Imports",
      }),
    );
  }
  return items;
}
// -----------------------------------------------------------------------------
// Audit load normalization
// -----------------------------------------------------------------------------
/**
 * Normalizes a loaded audit object into the current app shape.
 * @param {any} audit - Audit object to normalize or load.
 * @param {any} sourceKind - Input used by normalizeLoadedAudit.
 */
function normalizeAssignmentUser(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const id = String(user.id || "").trim();
  const username = String(user.username || "").trim();
  if (!id && !username) return null;
  return {
    id,
    username,
    fullName: String(user.fullName || "").trim(),
    email: String(user.email || "").trim(),
    avatar: String(user.avatar || "").trim() || null,
  };
}
function normalizeAssignmentUsers(users) {
  const seenIds = new Set(),
    seenNames = new Set();
  return (Array.isArray(users) ? users : [])
    .map(normalizeAssignmentUser)
    .filter((user) => {
      if (!user) return false;
      const name = user.username.toLowerCase();
      if ((user.id && seenIds.has(user.id)) || (name && seenNames.has(name)))
        return false;
      if (user.id) seenIds.add(user.id);
      if (name) seenNames.add(name);
      return true;
    });
}
function normalizeAuditAssignments(assignments) {
  const value =
    assignments &&
    typeof assignments === "object" &&
    !Array.isArray(assignments)
      ? assignments
      : {};
  return {
    assigned: normalizeAssignmentUsers(value.assigned),
    backup: normalizeAssignmentUsers(value.backup),
    developer: normalizeAssignmentUsers(value.developer),
  };
}
function normalizeLoadedAudit(audit, sourceKind = "unknown") {
  const normalized = structuredClone(audit || defaultAudit());
  normalized.id = normalized.id || uid("audit");
  normalized.name = normalized.name || "Untitled Audit";
  normalized.purpose = normalized.purpose || "";
  normalized.status = [
    "Draft",
    "Requirement Gathering",
    "Ready for Review",
    "Complete",
  ].includes(normalized.status)
    ? normalized.status
    : "Draft";
  normalized.sourceKind = normalized.sourceKind || sourceKind;
  normalized.sources = Array.isArray(normalized.sources)
    ? normalized.sources
    : [];
  normalized.sources.forEach((source) => {
    source.sourceKey = sourceCatalogKey(source);
    source.name =
      source.sourceKey ||
      source.name ||
      source.sourceFile ||
      source.alias ||
      "";
    source.sourceFile = source.sourceFile || source.name;
    source.alias = source.alias || source.sourceFile;
  });
  normalized.fields = Array.isArray(normalized.fields) ? normalized.fields : [];
  normalized.fields.forEach((field) => {
    field.sourceKey = field.sourceKey || field.sourceFile;
  });
  normalized.assignments = normalizeAuditAssignments(normalized.assignments);
  normalized.steps = Array.isArray(normalized.steps) ? normalized.steps : [];
  normalized.steps.forEach((step, index) =>
    normalizeCatalogStep?.(step, index),
  );
  return normalized;
}

/**
 * Loads the selected audit from repo, local storage, or workbook.
 */
async function loadSelectedLibraryAudit() {
  const value = $("auditLibrarySelect")?.value || "";
  if (!value)
    return status("Select an audit from the Audit Library first.", "warn");
  const [kind, ...idParts] = value.split(":");
  const id = idParts.join(":");
  if (kind === "database") {
    if (
      state.auditPersistence?.auditId &&
      state.auditPersistence.auditId !== id
    ) {
      const saved = await atlasSaveIfDirty("audit change");
      if (!saved) return;
    }
    return atlasLoadDatabaseAudit(id);
  }
  if (kind === "workbook") {
    const saved = await atlasSaveIfDirty("audit change");
    if (!saved) return;
    const result = await loadAuditFromWorkbook(id);
    showSection("overview");
    return result;
  }
  return status(
    "Only database audits can be loaded from the Audit Library.",
    "warn",
  );
}
/**
 * Asks how to handle unsaved changes before switching audits.
 */
async function confirmAuditSwitchSaveBehavior() {
  if (!auditHasUnsavedChanges()) return "discard";
  if (confirm("Save changes to the current audit before switching?"))
    return "save";
  if (confirm("Switch without saving changes?")) return "discard";
  return "cancel";
}

// -----------------------------------------------------------------------------
// Active audit switching
// -----------------------------------------------------------------------------
/**
 * Switches the active audit while preserving navigation context.
 * @param {any} value - Value to process or assign.
 */
async function switchActiveAudit(value) {
  if (state.auditSwitchInProgress || !value || value === state.activeAuditValue)
    return renderActiveAuditSelect?.();
  const [kind, ...idParts] = value.split(":");
  const id = idParts.join(":");
  state.auditSwitchInProgress = true;
  try {
    if (window.ATLASAuditReview?.isActive?.())
      await window.ATLASAuditReview.close({ restoreFocus: false });
    const saved = await atlasSaveIfDirty("audit change");
    if (!saved) return;
    if (kind === "database") await atlasLoadDatabaseAudit(id);
    else if (kind === "workbook") {
      await loadAuditFromWorkbook(id);
      showSection("overview");
    } else
      return status(
        "Only database and workbook audits can be selected.",
        "warn",
      );
  } finally {
    state.auditSwitchInProgress = false;
    renderActiveAuditSelect?.();
  }
}
