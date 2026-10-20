/**
 * 01-state-dom.js
 *
 * Global state, cached DOM references, status/theme helpers, field-display helpers, and navigation helpers. Later modules read and mutate this shared state directly.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// State initialization
// -----------------------------------------------------------------------------
/**
 * Creates a new empty audit object with the expected state shape.
 */
function defaultAudit() {
  return {
    // Generate a unique audit identifier using the shared uid helper (from 00-config-utils.js).
    id: uid("audit"),

    // Default display name used until the user provides an audit name.
    name: "Untitled Audit",

    // Optional audit purpose or business context entered by the user.
    purpose: "",

    // User-controlled audit workflow status.
    status: "Draft",

    // Source systems, files, tables, or datasets associated with this audit.
    sources: [],

    // Field definitions or mapped data elements used by the audit.
    fields: [],

    // User-controlled final output field selections. Logic usage remains derived.
    displayFields: [],

    // Audit workflow steps, validations, or review activities.
    steps: [],
  };
}

const state = {
  // Current working audit object loaded into the application.
  audit: defaultAudit(),

  // Tracks the currently selected audit step for detail editing or preview.
  selectedStepId: null,

  // Collection of saved audit flows available to the user.
  savedFlows: [],

  // Controls whether autosave is temporarily suspended.
  autosavePaused: false,

  // Cached repository/library data used by the audit flow experience.
  repoLibrary: null,

  // Indicates whether the user has actively selected an audit.
  auditSelected: false,

  // Startup readiness is independent from audit selection.
  startupReady: false,

  // Browser-local recovery is inspected at startup and applied only by user action.
  recoveryCandidate: null,

  // Prevents duplicate New Audit activation while POST /api/audits is pending.
  creatingAudit: false,

  // Current active audit selector value.
  activeAuditValue: "",

  // Temporary audit selector value used while an audit switch is pending.
  pendingActiveAuditValue: "",

  // Baseline active audit value used to detect or restore switch state.
  activeAuditBaseline: "",

  // Prevents duplicate or conflicting audit-switch operations while one is running.
  auditSwitchInProgress: false,
  databaseAudits: [],
  deletedAudits: [],
  deletedAuditsStatus: "idle",
  deletedAuditsError: "",
  // My Audits view state. Assigned is the default for each application load.
  myAuditsRoleFilter: "assigned",
  myAuditsStatusFilter: "all",
  myAuditsSearch: "",
  auditPersistence: {
    auditId: null,
    revisionId: null,
    revisionNumber: 0,
    access: null,
    saving: false,
    conflict: null,
  },

  // Stores the preferred field display mode, defaulting to source-based display.
  // The value is persisted in localStorage so the preference survives page reloads.
  fieldDisplayMode:
    localStorage.getItem("atlasAlignFieldDisplayMode") || "source",

  // Requirements Preview display mode. Nested is the default; complete is display-only.
  previewStatementMode:
    localStorage.getItem("atlasAlignPreviewStatementMode") || "nested",

  // Display-only: starts AND/OR connectors on new lines in Rules step cards.
  splitLogicConnectors:
    localStorage.getItem("atlasAlignSplitLogicConnectors") === "true",
};

const e = {
  // Audit metadata inputs.
  auditName: $("auditName"),
  auditPurpose: $("auditPurpose"),
  auditStatus: $("auditStatus"),

  // Primary list containers for audit configuration sections.
  sourcesList: $("sourcesList"),
  fieldsList: $("fieldsList"),
  stepsList: $("stepsList"),

  // Preview and detail panels used to display generated logic and selected step data.
  logicPreview: $("logicPreview"),
  selectedStepDetails: $("selectedStepDetails"),

  // General status and save status indicators.
  status: $("status"),
  saveStatus: $("saveStatus"),
  autosaveStatus: $("autosaveStatus"),

  // Flow selection and preview configuration controls.
  flowSelect: $("flowSelect"),
  previewStyle: $("previewStyle"),
  includeNotes: $("includeNotesToggle"),
  completeStatements: $("completeStatementsToggle"),

  // Theme toggle/control.
  theme: $("themeBtn"),

  // Workbook import controls and related status messaging.
  workbookFile: $("workbookFile"),
  workbookAuditSelect: $("workbookAuditSelect"),
  workbookStatus: $("workbookStatus"),

  // Audit library selector and repository/library status messaging.
  auditLibrarySelect: $("auditLibrarySelect"),
  repoLibraryStatus: $("repoLibraryStatus"),
};

// -----------------------------------------------------------------------------
// UI feedback and theme state
// -----------------------------------------------------------------------------
/**
 * Displays a status message in the app status area.
 * @param {any} message - Status or validation message.
 * @param {any} kind - Picker or record kind.
 */
function status(message, kind = "") {
  if (!e.status) return;
  e.status.innerHTML = `<div class="status ${esc(kind)}">${esc(message)}</div>`;
}

/**
 * Returns the active light/dark theme.
 */
function themeMode() {
  return document.body.classList.contains("dark") ? "dark" : "light";
}

/**
 * Applies the requested light/dark theme and persists the preference.
 * @param {any} mode - Requested mode value.
 */
function setTheme(mode) {
  const normalizedMode = mode === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark", normalizedMode === "dark");
  if (e.theme) e.theme.textContent = normalizedMode === "dark" ? "☀" : "⏾";
  localStorage.setItem("atlasAlignTheme", normalizedMode);
  if (typeof scheduleAutosave === "function")
    scheduleAutosave({ database: false });
}

/**
 * Returns whether an audit has been selected or created.
 */
function atlasSetApplicationReady(ready) {
  state.startupReady = Boolean(ready);
  document.body.dataset.atlasReady = state.startupReady ? "true" : "false";
  if (state.startupReady)
    document.dispatchEvent(new CustomEvent("atlas:ready"));
}

function hasSelectedAudit() {
  return !!state.auditSelected;
}

/**
 * Marks the app as having an active audit and unlocks audit pages.
 */
function markAuditSelected() {
  state.auditSelected = true;
  document.body.classList.add("audit-selected");
  document.body.classList.remove("audit-not-selected");
  updateNavigationLockState?.();
}

/**
 * Marks the app as not having an active audit and locks audit pages.
 */
function clearAuditSelection() {
  state.auditSelected = false;
  document.body.classList.remove("audit-selected");
  document.body.classList.add("audit-not-selected");
  updateNavigationLockState?.();
}

/**
 * Captures the current audit state as a JSON string for change detection.
 */
function auditSnapshot() {
  capture?.();
  return JSON.stringify(state.audit || {});
}

/**
 * Stores the current audit snapshot as the clean baseline.
 */
function updateActiveAuditBaseline() {
  state.activeAuditBaseline = auditSnapshot();
}

/**
 * Compares the current audit snapshot to the saved baseline.
 */
function auditHasUnsavedChanges() {
  if (!hasSelectedAudit()) return false;
  return auditSnapshot() !== state.activeAuditBaseline;
}

// -----------------------------------------------------------------------------
// Field display mode helpers
// -----------------------------------------------------------------------------
/**
 * Returns whether raw source names or vanity labels should be displayed.
 */
function fieldDisplayMode() {
  return state.fieldDisplayMode === "vanity" ? "vanity" : "source";
}

/**
 * Finds the catalog field record that matches a raw or display field name.
 * @param {any} value - Value to process or assign.
 * @param {any} sourceFile - Raw source file name.
 */
function findFieldDisplayCandidate(value, sourceFile = "") {
  const text = String(value || "");
  if (!text) return null;
  const pools = [];
  if (typeof fieldsForSource === "function")
    pools.push(...fieldsForSource(sourceFile || ""));
  pools.push(...((atlasDisplayDocument?.() || state.audit).fields || []));
  return (
    pools.find((field) =>
      [
        field.fieldName,
        field.rawFieldName,
        field.name,
        field.label,
        field.vanityLabel,
      ].some((item) => item && String(item) === text),
    ) || null
  );
}

/**
 * Returns the field name to show based on the active display mode.
 * @param {any} fieldOrName - Input used by fieldDisplayName.
 * @param {any} sourceFile - Raw source file name.
 */
function fieldDisplayParts(fieldOrName, sourceFile = "") {
  const fallback = String(typeof fieldOrName === "string" ? fieldOrName : "");
  if (!fieldOrName) return { raw: "", vanity: "", display: "", alternate: "" };
  const field =
    typeof fieldOrName === "string"
      ? findFieldDisplayCandidate(fieldOrName, sourceFile)
      : fieldOrName;
  if (!field)
    return {
      raw: fallback,
      vanity: fallback,
      display: fallback,
      alternate: "",
    };
  const raw = String(
    field.fieldName ||
      field.rawFieldName ||
      fallback ||
      field.name ||
      field.label ||
      "",
  );
  const vanity = String(
    field.vanityLabel ||
      (field.name && field.name !== raw ? field.name : "") ||
      field.label ||
      raw,
  );
  const display =
    fieldDisplayMode() === "vanity" ? vanity || raw : raw || vanity;
  const alternate =
    fieldDisplayMode() === "vanity"
      ? raw !== display
        ? raw
        : ""
      : vanity !== display
        ? vanity
        : "";
  return { raw, vanity, display, alternate };
}

function fieldDisplayName(fieldOrName, sourceFile = "") {
  return fieldDisplayParts(fieldOrName, sourceFile).display;
}

/**
 * Updates and persists the field display mode, then re-renders the UI.
 * @param {any} mode - Requested mode value.
 */
function setFieldDisplayMode(mode) {
  state.fieldDisplayMode = mode === "vanity" ? "vanity" : "source";
  localStorage.setItem("atlasAlignFieldDisplayMode", state.fieldDisplayMode);
  atlasInvalidatePages?.(["fields", "steps", "preview", "review"]);
  atlasRenderActivePage?.({ force: true });
  renderFieldDisplayModeButton?.();
}

/**
 * Updates and persists the display-only AND/OR line-break mode for step cards.
 * Step data and generated logic text are not changed.
 * @param {boolean} enabled - Whether connectors start new lines.
 */
function setSplitLogicConnectors(enabled) {
  state.splitLogicConnectors = !!enabled;
  localStorage.setItem(
    "atlasAlignSplitLogicConnectors",
    String(state.splitLogicConnectors),
  );
  atlasInvalidatePages?.(["steps"]);
  atlasRenderActivePage?.({ force: true });
  renderSplitLogicConnectorsButton?.();
}

/**
 * Switches between raw/source and vanity-label display modes.
 */
function toggleFieldDisplayMode() {
  setFieldDisplayMode(fieldDisplayMode() === "vanity" ? "source" : "vanity");
}

/**
 * Maps legacy section names to current page ids.
 * @param {any} section - Section/page identifier.
 */
function pageForSection(section) {
  if (section === "audit") return "overview";
  if (section === "logic") return "steps";
  if (section === "publication") return "save";
  if (section === "sources") return "fields";
  if (section === "group") return "my-audits";
  return section || "my-audits";
}

// -----------------------------------------------------------------------------
// Page navigation helpers
// -----------------------------------------------------------------------------
/**
 * Activates a page, updates navigation state, and refreshes page-level controls.
 * @param {any} section - Section/page identifier.
 */
function showSection(section) {
  // Resolve the requested section into the canonical page name used by the app.
  let page = pageForSection(section);

  // If no audit is selected, keep users on an allowed landing/setup page.
  // This prevents navigation into audit-specific pages before an audit context exists.
  if (!hasSelectedAudit() && page !== "my-audits") page = "my-audits";

  // Update the active state for navigation buttons in both the top nav and rail.
  // Each button may identify its target through section, page, or panel metadata.
  document.querySelectorAll(".navitem, .rail-item").forEach((button) => {
    const buttonPage = pageForSection(
      button.dataset.section ||
        button.dataset.page ||
        button.dataset.panel ||
        "",
    );
    button.classList.toggle("active", buttonPage === page);
  });

  // Show the matching main page panel and hide all other page panels.
  // Supports matching by data-page, page-prefixed id, or direct id for compatibility.
  document.querySelectorAll(".page").forEach((panel) => {
    panel.classList.toggle(
      "active",
      panel.dataset.page === page ||
        panel.id === `page-${page}` ||
        panel.id === page,
    );
  });

  // Show the matching setup panel when the selected page maps to setup content.
  document.querySelectorAll(".setup-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === page);
  });

  // Persist the active section so the app can restore the user's last location later.
  localStorage.setItem("atlasAlignActiveSection", page);

  // Refresh page-dependent UI elements after navigation changes.
  // Function checks keep this safe when optional modules are not loaded.
  if (typeof updateDashboardMetrics === "function") updateDashboardMetrics();
  if (
    page === "preview" &&
    typeof atlasPreviewDirty !== "undefined" &&
    atlasPreviewDirty
  ) {
    atlasRequestRender?.({ preview: true });
  }
  if (typeof positionTutorial === "function") positionTutorial();
  updateNavigationLockState?.();
  renderFlowNavControls?.();
  renderActiveAuditSelect?.();
  renderFieldDisplayModeButton?.();
  atlasRenderPage?.(page);
  globalThis.ATLASAuditIssues?.render?.();

  // Return the viewport to the top of the newly displayed section.
  window.scrollTo({ top: 0, behavior: "auto" });
}

// Package 2D.3 detached display-document provider. Editable state.audit remains untouched.
function atlasIsReviewerMode() {
  return Boolean(window.ATLASAuditReview?.isActive?.());
}
function atlasReviewerModeDocument() {
  return window.ATLASAuditReview?.document?.() || null;
}
function atlasDisplayDocument() {
  return typeof window.atlasCurrentRenderDocument === "function"
    ? window.atlasCurrentRenderDocument()
    : atlasReviewerModeDocument() || state.audit;
}
function atlasReviewerModeContext() {
  return window.ATLASAuditReview?.context?.() || null;
}
