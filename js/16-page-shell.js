/**
 * 16-page-shell.js
 *
 * Page shell enhancements for dashboard metrics, topbar audit switching, navigation lock state, flow navigation, and field display toggle rendering.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Dashboard metric helpers
// -----------------------------------------------------------------------------
/**
 * Sets textContent for an element by id.
 * @param {any} id - Element id or record id to look up.
 * @param {any} value - Value to process or assign.
 */
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/** Shows the archive button only when the saved audit may be archived. */
function atlasSyncArchiveButton() {
  const deleteAuditButton = $("deleteAuditBtn");
  if (!deleteAuditButton) return;
  const canArchive = Boolean(
    hasSelectedAudit?.() &&
    state.auditPersistence?.auditId === state.audit?.id &&
    state.auditPersistence?.revisionId &&
    state.auditPersistence?.access?.canArchive,
  );
  deleteAuditButton.hidden = !canArchive;
  if (!deleteAuditButton.matches('[aria-busy="true"]'))
    deleteAuditButton.disabled = !canArchive;
}

/**
 * Updates overview and source metrics.
 */
function updateDashboardMetrics() {
  const audit = atlasDisplayDocument?.() || state.audit;
  const repoAudits = repoLibraryState?.audits?.length || 0;
  const savedAudits = state.savedFlows?.length || 0;
  const selectedSources = audit.sources?.length || 0;
  const logicSteps = audit.steps?.length || 0;
  // Without an audit field list, counting builds every field of every source.
  // Only the Overview field count and ready badge use it, and showSection calls
  // this again after Overview becomes the active page.
  const overviewVisible = Boolean(
    document.querySelector('.page.active[data-page="overview"]'),
  );
  if (!overviewVisible && !(audit.fields || []).length) {
    setText("metricRepoAudits", repoAudits.toLocaleString());
    setText("metricSavedAudits", savedAudits.toLocaleString());
    setText("metricSelectedSources", selectedSources.toLocaleString());
    setText("metricLogicSteps", logicSteps.toLocaleString());
    setText("overviewSourceCount", selectedSources.toLocaleString());
    setText("overviewStepCount", logicSteps.toLocaleString());
    setText("selectedSourceBadge", selectedSources.toLocaleString());
    atlasSyncArchiveButton();
    return;
  }
  const fieldCount =
    (audit.fields || []).length ||
    (audit.sources || []).reduce(
      (total, source) =>
        total +
        (typeof fieldsForSource === "function"
          ? fieldsForSource(source.name).length
          : 0),
      0,
    );

  setText("metricRepoAudits", repoAudits.toLocaleString());
  setText("metricSavedAudits", savedAudits.toLocaleString());
  setText("metricSelectedSources", selectedSources.toLocaleString());
  setText("metricLogicSteps", logicSteps.toLocaleString());
  setText("overviewSourceCount", selectedSources.toLocaleString());
  setText("overviewFieldCount", fieldCount.toLocaleString());
  setText("overviewStepCount", logicSteps.toLocaleString());
  setText("selectedSourceBadge", selectedSources.toLocaleString());
  atlasSyncArchiveButton();

  const progress = Math.min(
    100,
    Math.round(
      ([
        state.audit.name && state.audit.name !== "New Audit Logic Flow",
        !!state.audit.purpose,
        selectedSources > 0,
        fieldCount > 0,
        logicSteps > 0,
      ].filter(Boolean).length /
        5) *
        100,
    ),
  );
  setText("overviewProgressBadge", `${progress}% ready`);
}

// -----------------------------------------------------------------------------
// Render wrappers for page shell
// -----------------------------------------------------------------------------
function renderPageShellStatus() {
  updateDashboardMetrics();
  updateNavigationLockState?.();
  renderFlowNavControls?.();
  renderActiveAuditSelect?.();
  renderFieldDisplayModeButton?.();
}

const pageShellRenderAllBase =
  typeof renderAll === "function" ? renderAll : null;
if (pageShellRenderAllBase) {
  /**
   * Central render coordinator for the current audit UI.
   */
  renderAll = function renderAllWithPageShell(options = {}) {
    pageShellRenderAllBase();
    if (options.shell !== false) renderPageShellStatus();
  };
}

const pageShellRefreshSavedBase =
  typeof refreshSaved === "function" ? refreshSaved : null;
if (pageShellRefreshSavedBase) {
  /**
   * Loads saved flows into state and updates the saved-flow selector.
   */
  refreshSaved = async function refreshSavedWithPageShell() {
    await pageShellRefreshSavedBase();
    if (typeof renderAuditLibrarySelect === "function")
      renderAuditLibrarySelect();
    updateDashboardMetrics();
    renderActiveAuditSelect?.();
    renderFieldDisplayModeButton?.();
  };
}

// -----------------------------------------------------------------------------
// Topbar audit switcher
// -----------------------------------------------------------------------------

/**
 * Returns the active page name.
 */
function activePageName() {
  return (
    document.querySelector(".page.active")?.dataset.page ||
    localStorage.getItem("atlasAlignActiveSection") ||
    "my-audits"
  );
}

/**
 * Shows or hides the topbar audit switcher.
 */
function renderTopbarAuditSwitcherVisibility() {
  const wrapper = document.querySelector(".topbar-audit-switcher");
  if (!wrapper) return;
  wrapper.hidden = activePageName() === "my-audits";
}

/**
 * Returns the audit value staged in the topbar selector.
 */
function pendingActiveAuditValue() {
  return state.pendingActiveAuditValue || $("activeAuditSelect")?.value || "";
}

// -----------------------------------------------------------------------------
// Display-mode button
// -----------------------------------------------------------------------------
/**
 * Renders the vanity/raw display toggle button.
 */
function renderFieldDisplayModeButton() {
  const button = $("fieldDisplayModeBtn");
  if (!button) return;

  const mode = fieldDisplayMode?.() || "source";
  const vanityOn = mode === "vanity";

  button.textContent = "Aa";
  button.title = vanityOn
    ? "Display Source Field Name"
    : "Display Vanity Label/Field Display Name";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(vanityOn));
  button.classList.toggle("active", vanityOn);
  renderSplitLogicConnectorsButton();
}

/**
 * Renders the display-only AND/OR line-break toggle button.
 */
function renderSplitLogicConnectorsButton() {
  const button = $("splitLogicConnectorsBtn");
  if (!button) return;

  const splitOn = !!state.splitLogicConnectors;
  button.title = splitOn
    ? "Show AND / OR inline"
    : "Show AND / OR on separate lines";
  button.setAttribute("aria-pressed", String(splitOn));
  button.classList.toggle("active", splitOn);
}

// -----------------------------------------------------------------------------
// Workflow navigation
// -----------------------------------------------------------------------------
const AUDIT_FLOW_PAGES = [
  { page: "overview", label: "Audit Overview", nextLabel: "Select Sources" },
  { page: "fields", label: "Select Sources", nextLabel: "Build Logic" },
  { page: "steps", label: "Logic Builder", nextLabel: "Requirements Preview" },
  {
    page: "preview",
    label: "Requirements Preview",
    nextLabel: "Readiness & Review",
  },
  {
    page: "review",
    label: "Readiness & Review",
    nextLabel: "Export",
  },
  { page: "export", label: "Export" },
];

/**
 * Locks or unlocks navigation based on active audit state.
 */
function updateNavigationLockState() {
  const locked = !hasSelectedAudit();
  document.body.classList.toggle("audit-selected", !locked);
  document.body.classList.toggle("audit-not-selected", locked);
  document.querySelectorAll(".navitem, .rail-item").forEach((button) => {
    const targetPage = pageForSection(
      button.dataset.section ||
        button.dataset.page ||
        button.dataset.panel ||
        "",
    );
    const shouldLock = locked && !ATLAS_AUDIT_FREE_PAGES.has(targetPage);
    button.classList.toggle("is-locked", shouldLock);
    if (shouldLock) {
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("title", "Select or create an audit first.");
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("title");
    }
  });
  renderFlowNavControls?.();
}

/**
 * Returns the active page for flow navigation.
 */
function activeAuditFlowPage() {
  return (
    document.querySelector(".page.active")?.dataset.page ||
    localStorage.getItem("atlasAlignActiveSection") ||
    "my-audits"
  );
}

/**
 * Renders Back/Next controls for the audit workflow.
 */
function renderFlowNavControls() {
  const controls = $("flowNavControls");
  const back = $("flowBackBtn");
  const next = $("flowNextBtn");
  if (!controls || !back || !next) return;
  const currentPage = activeAuditFlowPage();
  const currentIndex = AUDIT_FLOW_PAGES.findIndex(
    (item) => item.page === currentPage,
  );
  const showControls = hasSelectedAudit() && currentIndex >= 0;
  controls.hidden = !showControls;
  if (!showControls) {
    back.hidden = true;
    next.hidden = true;
    back.removeAttribute("data-flow-target");
    next.removeAttribute("data-flow-target");
    return;
  }
  const previous = AUDIT_FLOW_PAGES[currentIndex - 1];
  const current = AUDIT_FLOW_PAGES[currentIndex];
  const nextPage = AUDIT_FLOW_PAGES[currentIndex + 1];
  back.hidden = !previous;
  if (previous) {
    back.textContent = `Back: ${previous.label}`;
    back.dataset.flowTarget = previous.page;
  } else {
    back.removeAttribute("data-flow-target");
  }
  next.hidden = !nextPage;
  if (nextPage) {
    next.textContent = `Next: ${current.nextLabel || nextPage.label}`;
    next.dataset.flowTarget = nextPage.page;
  } else {
    next.removeAttribute("data-flow-target");
  }
}

// -----------------------------------------------------------------------------
// Page shell event handlers
// -----------------------------------------------------------------------------
const MOBILE_NAV_QUERY = "(max-width: 700px)";
let navCollapsedPreference =
  localStorage.getItem("atlasAlignNavCollapsed") === "Yes";

function isMobileNav() {
  return window.matchMedia(MOBILE_NAV_QUERY).matches;
}

function syncNavToggleButtons(collapsed) {
  const mobile = isMobileNav();
  const label = collapsed
    ? mobile
      ? "Open navigation"
      : "Expand navigation"
    : mobile
      ? "Close navigation"
      : "Collapse navigation";
  for (const id of ["collapseNavBtn", "openNavBtn"]) {
    const button = $(id);
    if (!button) continue;
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

function applyNavCollapsed(collapsed) {
  const sidebar = $("sidebar");
  const main = $("main");
  const mobile = isMobileNav();
  const drawerOpen = mobile && !collapsed;
  sidebar?.classList.toggle("collapsed", collapsed);
  main?.classList.toggle("expanded", collapsed);
  document.body.classList.toggle("nav-drawer-open", drawerOpen);
  const backdrop = $("navBackdrop");
  if (backdrop) backdrop.hidden = !drawerOpen;
  if (sidebar) {
    sidebar.inert = mobile && collapsed;
    if (mobile && collapsed) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
  }
  syncNavToggleButtons(collapsed);
}

function persistNavCollapsed(collapsed) {
  navCollapsedPreference = collapsed;
  localStorage.setItem("atlasAlignNavCollapsed", collapsed ? "Yes" : "No");
}

function toggleNav() {
  const nextCollapsed = !$("sidebar")?.classList.contains("collapsed");
  if (!isMobileNav()) persistNavCollapsed(nextCollapsed);
  applyNavCollapsed(nextCollapsed);
  if (!isMobileNav()) return;
  if (nextCollapsed) $("openNavBtn")?.focus();
  else $("collapseNavBtn")?.focus();
}

function closeMobileNav({ focusOpener = false } = {}) {
  if (!isMobileNav() || $("sidebar")?.classList.contains("collapsed")) return;
  applyNavCollapsed(true);
  if (focusOpener) $("openNavBtn")?.focus();
}

function syncNavToViewport() {
  if (isMobileNav()) {
    applyNavCollapsed(true);
    return;
  }
  applyNavCollapsed(navCollapsedPreference);
}

document.addEventListener("click", (event) => {
  const flowNav = event.target.closest("[data-flow-target]");
  if (flowNav) {
    event.preventDefault();
    atlasNavigateToSection(flowNav.dataset.flowTarget).catch((err) =>
      status(`Navigation save failed: ${err.message}`, "bad"),
    );
    renderActiveAuditSelect?.();
    renderFieldDisplayModeButton?.();
    return;
  }
  const nav = event.target.closest(".navitem");
  if (nav) {
    if (nav.classList.contains("is-locked")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    atlasNavigateToSection(nav.dataset.section).catch((err) =>
      status(`Navigation save failed: ${err.message}`, "bad"),
    );
    renderActiveAuditSelect?.();
    renderFieldDisplayModeButton?.();
    closeMobileNav({ focusOpener: true });
    return;
  }
  if (event.target.closest("#collapseNavBtn, #openNavBtn")) {
    event.preventDefault();
    toggleNav();
    return;
  }
  if (event.target.closest("#navBackdrop")) {
    event.preventDefault();
    closeMobileNav({ focusOpener: true });
    return;
  }
  if (event.target.closest("#myAuditsNewAuditBtn")) {
    $("newAuditBtn")?.click();
    return;
  }
  const previewTab = event.target.closest("[data-preview-tab]");
  if (previewTab) {
    document
      .querySelectorAll("[data-preview-tab]")
      .forEach((tab) => tab.classList.toggle("active", tab === previewTab));
    if (e.previewStyle) e.previewStyle.value = previewTab.dataset.previewTab;
    renderPreview?.();
  }
});

globalThis.ATLASAssignmentEditor = Object.freeze({
  add: atlasAddAuditAssignment,
  open: atlasOpenAssignmentPicker,
  searchRecent: (...args) => {
    if (typeof globalThis.atlasSearchCachedUsers !== "function") {
      return Promise.reject(
        new Error("Assignment profile search is not available yet."),
      );
    }
    return globalThis.atlasSearchCachedUsers(...args);
  },
  searchDirectory: (...args) => {
    if (typeof globalThis.atlasSearchDirectoryProfiles !== "function") {
      return Promise.reject(
        new Error("Assignment directory search is not available yet."),
      );
    }
    return globalThis.atlasSearchDirectoryProfiles(...args);
  },
  displayName: atlasDisplayUser,
});

document.addEventListener("DOMContentLoaded", () => {
  navCollapsedPreference =
    localStorage.getItem("atlasAlignNavCollapsed") === "Yes";
  syncNavToViewport();
  window
    .matchMedia(MOBILE_NAV_QUERY)
    .addEventListener("change", syncNavToViewport);
  updateNavigationLockState?.();
  renderFlowNavControls?.();
  renderActiveAuditSelect?.();
  renderFieldDisplayModeButton?.();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  closeMobileNav({ focusOpener: true });
});

// -----------------------------------------------------------------------------
// Final audit switcher override
// -----------------------------------------------------------------------------
/* Final audit switcher rendering and Switch button refinements */
function atlasOptionHtml(option) {
  return `<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`;
}
/**
 * Groups audit options for the topbar selector.
 * @param {any} options - Configuration/options object.
 * @param {any} includePlaceholder - Input used by atlasGroupedAuditOptionsHtml.
 * @param {any} placeholder - Input used by atlasGroupedAuditOptionsHtml.
 */
function atlasGroupedAuditOptionsHtml(
  options,
  includePlaceholder = false,
  placeholder = "Select an audit...",
) {
  const groups = [
    ...new Set((options || []).map((option) => option.group || "Audits")),
  ];
  const placeholderHtml = includePlaceholder
    ? `<option value="">${esc(placeholder)}</option>`
    : "";
  return (
    placeholderHtml +
    groups
      .map(
        (group) =>
          `<optgroup label="${esc(group)}">${options
            .filter((option) => (option.group || "Audits") === group)
            .map(atlasOptionHtml)
            .join("")}</optgroup>`,
      )
      .join("")
  );
}
/**
 * Renders the topbar active-audit selector.
 */
renderActiveAuditSelect = function renderActiveAuditSelectFinal() {
  const select = $("activeAuditSelect");
  const confirmButton = $("confirmActiveAuditBtn");
  const wrapper = document.querySelector(".topbar-audit-switcher");
  const priorLabel = document.querySelector("[data-reviewing-audit-label]");
  if (atlasIsReviewerMode?.()) {
    const audit = atlasDisplayDocument?.() || {};
    const context = atlasReviewerModeContext?.() || {};
    if (wrapper) wrapper.hidden = true;
    const label = priorLabel || document.createElement("span");
    label.dataset.reviewingAuditLabel = "true";
    label.className = "topbar-reviewing-audit-label";
    label.textContent = `Reviewing: ${audit.name || audit.id || "Submitted audit"} · revision ${context.submittedRevisionId || "submitted"}`;
    label.setAttribute("role", "status");
    if (!priorLabel) wrapper?.insertAdjacentElement("afterend", label);
    return;
  }
  priorLabel?.remove();
  if (wrapper) wrapper.hidden = false;
  renderTopbarAuditSwitcherVisibility?.();
  if (!select) return;
  const options = topbarAuditOptions?.() || [];
  const hasOptions = options.length > 0;
  let renderOptions = options;
  if (
    hasSelectedAudit?.() &&
    state.activeAuditValue &&
    state.audit?.name &&
    !renderOptions.some((option) => option.value === state.activeAuditValue)
  ) {
    renderOptions = [
      {
        group: "Current Audit",
        value: state.activeAuditValue,
        label: state.audit.name,
      },
      ...renderOptions,
    ];
  }
  const stagedValue = state.pendingActiveAuditValue || "";
  const includePlaceholder = !hasSelectedAudit?.();
  const placeholder = hasOptions ? "Search audits" : "No audit selected";
  const valueToShow =
    stagedValue && renderOptions.some((option) => option.value === stagedValue)
      ? stagedValue
      : state.activeAuditValue || "";
  select.value =
    valueToShow && renderOptions.some((option) => option.value === valueToShow)
      ? valueToShow
      : includePlaceholder
        ? ""
        : renderOptions[0]?.value || "";
  atlasTopbarAuditOptions = renderOptions;
  const search = $("activeAuditSearch");
  const current = renderOptions.find((option) => option.value === select.value);
  if (search) {
    search.disabled = !renderOptions.length;
    search.placeholder = placeholder;
    if (document.activeElement !== search) {
      search.value = current?.label || "";
      atlasAuditSwitcherQuery = null;
      atlasHideAuditSwitcherResults();
    } else if (atlasAuditSwitcherQuery == null)
      atlasRenderAuditSwitcherResults("");
    else atlasRenderAuditSwitcherResults(atlasAuditSwitcherQuery);
  }
  if (confirmButton) confirmButton.hidden = true;
};

let atlasTopbarAuditOptions = [];
let atlasAuditSwitcherQuery = null;
let atlasAuditSwitcherActiveIndex = 0;

function atlasAuditSwitcherMatches(query = "") {
  const wanted = String(query || "")
    .trim()
    .toLowerCase();
  return atlasTopbarAuditOptions.filter(
    (option) =>
      !wanted ||
      String(option.label || "")
        .toLowerCase()
        .includes(wanted),
  );
}

function atlasHighlightAuditSwitcherOption() {
  const results = $("activeAuditResults");
  const search = $("activeAuditSearch");
  const options = [
    ...(results?.querySelectorAll("[data-audit-switch-value]") || []),
  ];
  if (!options.length) {
    search?.removeAttribute("aria-activedescendant");
    return;
  }
  if (atlasAuditSwitcherActiveIndex >= options.length)
    atlasAuditSwitcherActiveIndex = 0;
  options.forEach((option, index) => {
    const on = index === atlasAuditSwitcherActiveIndex;
    option.classList.toggle("is-active", on);
    option.id = `activeAuditOption-${index}`;
    if (!on) return;
    search?.setAttribute("aria-activedescendant", option.id);
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < results.scrollTop) results.scrollTop = top;
    else if (bottom > results.scrollTop + results.clientHeight)
      results.scrollTop = bottom - results.clientHeight;
  });
}

function atlasRenderAuditSwitcherResults(
  query = "",
  { resetIndex = false } = {},
) {
  const results = $("activeAuditResults");
  const search = $("activeAuditSearch");
  if (!results) return;
  const matches = atlasAuditSwitcherMatches(query);
  const selectedValue = $("activeAuditSelect")?.value || "";
  if (resetIndex) {
    const currentIndex = matches.findIndex(
      (option) => option.value === selectedValue,
    );
    atlasAuditSwitcherActiveIndex = currentIndex >= 0 ? currentIndex : 0;
  }
  results.hidden = false;
  search?.setAttribute("aria-expanded", "true");
  results.innerHTML = matches.length
    ? matches
        .map((option) => {
          const selected = option.value === selectedValue;
          return `<button type="button" class="atlas-audit-switcher-option" role="option" aria-selected="${selected ? "true" : "false"}" data-audit-switch-value="${esc(option.value)}"><span>${esc(option.label)}</span><small>${esc(selected ? "Current" : option.group || "")}</small></button>`;
        })
        .join("")
    : '<p class="hint">No matching audits.</p>';
  atlasHighlightAuditSwitcherOption();
}

function atlasHideAuditSwitcherResults() {
  const results = $("activeAuditResults");
  const search = $("activeAuditSearch");
  if (results) results.hidden = true;
  search?.setAttribute("aria-expanded", "false");
  search?.removeAttribute("aria-activedescendant");
}

function atlasRestoreAuditSwitcherLabel() {
  const search = $("activeAuditSearch");
  const select = $("activeAuditSelect");
  if (!search || document.activeElement === search) return;
  const current = atlasTopbarAuditOptions.find(
    (option) => option.value === select?.value,
  );
  search.value = current?.label || "";
  atlasAuditSwitcherQuery = null;
}

function atlasChooseAuditSwitcherValue(value) {
  const select = $("activeAuditSelect");
  const search = $("activeAuditSearch");
  if (select) select.value = value;
  state.pendingActiveAuditValue = "";
  atlasAuditSwitcherQuery = null;
  atlasHideAuditSwitcherResults();
  search?.blur();
  if (!value || value === state.activeAuditValue) {
    renderActiveAuditSelect?.();
    return;
  }
  switchActiveAudit(value)
    .then(() => renderActiveAuditSelect?.())
    .catch((err) => {
      status?.(`Audit switch failed: ${err.message}`, "bad");
      renderActiveAuditSelect?.();
    });
}

document.addEventListener("focusin", (event) => {
  if (event.target?.id !== "activeAuditSearch") return;
  atlasAuditSwitcherQuery = null;
  atlasRenderAuditSwitcherResults("", { resetIndex: true });
  event.target.select?.();
});
document.addEventListener("input", (event) => {
  if (event.target?.id !== "activeAuditSearch") return;
  atlasAuditSwitcherQuery = event.target.value;
  atlasRenderAuditSwitcherResults(event.target.value, { resetIndex: true });
});
document.addEventListener("keydown", (event) => {
  if (event.target?.id !== "activeAuditSearch") return;
  const options = [
    ...($("activeAuditResults")?.querySelectorAll(
      "[data-audit-switch-value]",
    ) || []),
  ];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if ($("activeAuditResults")?.hidden) {
      atlasAuditSwitcherQuery = null;
      atlasRenderAuditSwitcherResults("", { resetIndex: true });
    }
    const list = [
      ...($("activeAuditResults")?.querySelectorAll(
        "[data-audit-switch-value]",
      ) || []),
    ];
    if (!list.length) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    atlasAuditSwitcherActiveIndex =
      (atlasAuditSwitcherActiveIndex + delta + list.length) % list.length;
    atlasHighlightAuditSwitcherOption();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const option = options[atlasAuditSwitcherActiveIndex] || options[0];
    if (option)
      atlasChooseAuditSwitcherValue(option.dataset.auditSwitchValue || "");
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    atlasAuditSwitcherQuery = null;
    atlasHideAuditSwitcherResults();
    event.target.blur();
  }
});
document.addEventListener(
  "mousedown",
  (event) => {
    if (
      event.target.closest?.(".topbar-audit-switcher [data-audit-switch-value]")
    )
      event.preventDefault();
  },
  true,
);
document.addEventListener("focusout", (event) => {
  if (event.target?.id !== "activeAuditSearch") return;
  setTimeout(() => {
    if (document.activeElement?.closest?.(".topbar-audit-switcher")) return;
    atlasAuditSwitcherQuery = null;
    atlasHideAuditSwitcherResults();
    atlasRestoreAuditSwitcherLabel();
  }, 0);
});
document.addEventListener(
  "click",
  (event) => {
    const option = event.target.closest?.(
      ".topbar-audit-switcher [data-audit-switch-value]",
    );
    if (option) {
      event.preventDefault();
      atlasChooseAuditSwitcherValue(option.dataset.auditSwitchValue || "");
      return;
    }
    if (!event.target.closest?.(".topbar-audit-switcher")) {
      atlasAuditSwitcherQuery = null;
      atlasHideAuditSwitcherResults();
      atlasRestoreAuditSwitcherLabel();
    }
  },
  true,
);

// Database-only audit selectors and metrics.
topbarAuditOptions = function topbarDatabaseAuditOptions() {
  const options = (state.databaseAudits || []).map((audit) => ({
    group: "Database Audits",
    value: `database:${audit.id}`,
    label: `${audit.name || audit.id} · r${audit.currentRevisionNumber || 0}`,
  }));
  if (typeof workbookState !== "undefined" && workbookState.loaded)
    (workbookState.auditSheets || []).forEach((name) =>
      options.push({
        group: "Workbook Imports",
        value: `workbook:${name}`,
        label: name,
      }),
    );
  if (
    hasSelectedAudit() &&
    String(state.activeAuditValue || "").startsWith("draft:")
  )
    options.push({
      group: "Current Draft",
      value: state.activeAuditValue,
      label: state.audit.name || "Unsaved Draft",
    });
  return options;
};
const atlasDatabaseMetricsBase = updateDashboardMetrics;
updateDashboardMetrics = function updateDatabaseOnlyMetrics() {
  atlasDatabaseMetricsBase();
  setText(
    "metricSavedAudits",
    (state.databaseAudits || []).length.toLocaleString(),
  );
  setText(
    "auditRevisionBadge",
    state.auditPersistence?.revisionNumber
      ? `Revision ${state.auditPersistence.revisionNumber}`
      : "Unsaved",
  );
};

const ATLAS_ASSIGNMENT_ROLES = ["assigned", "backup", "developer"];

// Assignment search state is required by the initial page-shell render and by
// the input handlers registered later during bootstrap.
state.assignmentUserSearch = state.assignmentUserSearch || {};
ATLAS_ASSIGNMENT_ROLES.forEach((role) => {
  state.assignmentUserSearch[role] = state.assignmentUserSearch[role] || {
    query: "",
    results: [],
    loading: false,
    error: "",
    source: "recent",
    controller: null,
  };
});
// Signed-in profile, personal audit work queue, and assignment editor.
function atlasUserInitials(user) {
  const source = String(user?.fullName || user?.username || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : source.slice(0, 2)
  ).toUpperCase();
}
function atlasDisplayUser(user) {
  return String(user?.fullName || user?.username || "Unknown user");
}
function atlasUserMatches(left, right) {
  const leftId = String(left?.id || "").trim(),
    rightId = String(right?.id || "").trim();
  if (leftId && rightId) return leftId === rightId;
  const a = String(left?.username || "")
      .trim()
      .toLowerCase(),
    b = String(right?.username || "")
      .trim()
      .toLowerCase();
  return !!a && a === b;
}
function atlasAssignmentRole(role) {
  return ATLAS_ASSIGNMENT_ROLES.includes(role) ? role : "";
}
function atlasEnsureAuditAssignments() {
  const assignments = normalizeAuditAssignments?.(state.audit?.assignments) || {
    assigned: [],
    backup: [],
    developer: [],
  };
  state.audit.assignments = assignments;
  return assignments;
}
function atlasCommitAssignmentMutation(role) {
  renderAssignmentEditor();
  renderMyAudits();
  atlasInvalidatePages?.(["my-audits", "overview"]);
  scheduleAutosave?.();
  globalThis.ATLASAuditIssues?.invalidate?.();
  const roleLabel =
    {
      assigned: "Assigned Analysts",
      backup: "Backup Analysts",
      developer: "Developers",
    }[role] || "Audit Assignments";
  status?.(`${roleLabel} updated.`, "ok");
}
function atlasAddAuditAssignment(role, user) {
  if (!state.auditPersistence?.access?.canEdit) return false;
  const validRole = atlasAssignmentRole(role);
  const normalizedUser = normalizeAssignmentUser?.(user);
  if (!validRole || !normalizedUser || user?.disabled === true) return false;
  const assignments = atlasEnsureAuditAssignments();
  if (
    assignments[validRole].some((value) =>
      atlasUserMatches(value, normalizedUser),
    )
  )
    return false;
  assignments[validRole].push(normalizedUser);
  atlasCommitAssignmentMutation(validRole);
  return true;
}
function atlasRemoveAuditAssignment(role, identity) {
  if (!state.auditPersistence?.access?.canEdit) return false;
  const validRole = atlasAssignmentRole(role);
  if (!validRole) return false;
  const assignments = atlasEnsureAuditAssignments();
  const current = assignments[validRole];
  const next = current.filter((user) => !atlasUserMatches(user, identity));
  if (next.length === current.length) return false;
  assignments[validRole] = next;
  atlasCommitAssignmentMutation(validRole);
  return true;
}
function atlasAuditMembership(audit) {
  const current = state.currentUser,
    assignments = normalizeAuditAssignments?.(audit?.assignments) || {
      assigned: [],
      backup: [],
      developer: [],
    };
  if (!current || state.currentUserStatus !== "ready")
    return { assigned: false, backup: false, developer: false, role: "Other" };
  const assigned = assignments.assigned.some((user) =>
    atlasUserMatches(user, current),
  );
  const backup = assignments.backup.some((user) =>
    atlasUserMatches(user, current),
  );
  const developer = assignments.developer.some((user) =>
    atlasUserMatches(user, current),
  );

  return {
    assigned,
    backup,
    developer,
    role: assigned
      ? "Assigned Analyst"
      : backup
        ? "Backup Analyst"
        : developer
          ? "Developer"
          : "Other",
  };
}

function renderCurrentUserProfile() {
  const root = $("currentUserProfile");
  if (!root) return;
  root.replaceChildren();
  if (
    state.currentUserStatus === "loading" ||
    state.currentUserStatus === "idle"
  ) {
    root.textContent = "Loading profile…";
    root.setAttribute("aria-label", "Loading signed-in user profile");
    return;
  }
  if (state.currentUserStatus !== "ready" || !state.currentUser) {
    root.textContent = "Profile unavailable";
    root.setAttribute("aria-label", "Signed-in user profile unavailable");
    return;
  }

  const user = state.currentUser,
    avatar = document.createElement("span");
  avatar.className = "avatar profile-avatar";
  avatar.textContent = atlasUserInitials(user);
  avatar.setAttribute("aria-hidden", "true");

  if (user.avatar) {
    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = `${atlasDisplayUser(user)} profile photo`;
    img.addEventListener("error", () => img.remove(), { once: true });
    avatar.append(img);
  }

  const text = document.createElement("span");
  text.className = "profile-text";
  const primary = document.createElement("strong");
  primary.textContent = atlasDisplayUser(user);
  const secondary = document.createElement("span");
  secondary.className = "profile-secondary";
  secondary.textContent = user.username || user.email || "";
  text.append(primary, secondary);
  root.append(avatar, text);
  if (user.impersonation?.active) {
    const indicator = document.createElement("span");
    indicator.className = "profile-impersonating-indicator";
    indicator.append(document.createTextNode("Impersonating · "));
    const countdown = document.createElement("span");
    countdown.dataset.impersonationCountdown = "";
    countdown.textContent = "calculating…";
    indicator.append(countdown);
    root.append(indicator);
  }
  root.classList.toggle(
    "is-impersonation-enabled",
    user.impersonation?.enabled === true,
  );
  root.setAttribute("role", user.impersonation?.enabled ? "button" : "group");
  if (user.debugMetadata && typeof user.debugMetadata === "object") {
    // TEMP DEBUG: remove with the server-side user metadata debug payload.
    try {
      const tooltip = document.createElement("span");
      tooltip.className = "profile-debug-tooltip";
      tooltip.setAttribute("role", "tooltip");
      const label = document.createElement("strong");
      label.className = "profile-debug-tooltip-label";
      label.textContent = "Temporary user metadata debug";
      const json = document.createElement("pre");
      json.className = "profile-debug-tooltip-json";
      json.textContent = JSON.stringify(user.debugMetadata, null, 2);
      tooltip.append(label, json);
      root.append(tooltip);
      root.setAttribute("aria-describedby", "currentUserDebugMetadata");
      tooltip.id = "currentUserDebugMetadata";
    } catch (_error) {
      root.removeAttribute("aria-describedby");
    }
  } else {
    root.removeAttribute("aria-describedby");
  }
  root.setAttribute(
    "aria-label",
    `${user.impersonation?.active ? "Impersonating" : "Signed in as"} ${atlasDisplayUser(user)}${user.impersonation?.enabled ? ". Open profile picker" : ""}`,
  );
}
function atlasAssignmentNames(users) {
  return (users || []).map(atlasDisplayUser).join(", ") || "None";
}
function atlasAuditSearchText(audit) {
  const a = normalizeAuditAssignments?.(audit.assignments) || {
    assigned: [],
    backup: [],
    developer: [],
  };

  return [
    audit.name,
    audit.id,
    audit.purpose,
    audit.description,
    ...a.assigned.flatMap((u) => [u.fullName, u.username]),
    ...a.backup.flatMap((u) => [u.fullName, u.username]),
    ...a.developer.flatMap((u) => [u.fullName, u.username]),
  ]
    .join(" ")
    .toLowerCase();
}

function renderMyAudits() {
  const body = $("myAuditsTableBody"),
    stateHost = $("myAuditsState");
  if (!body || !stateHost) return;
  const canCreateAudit = Boolean(
    state.currentUserStatus === "ready" && state.currentUser?.access?.canCreate,
  );
  ["newAuditBtn", "myAuditsNewAuditBtn"].forEach((id) => {
    const button = $(id);
    if (!button) return;
    button.hidden = !canCreateAudit;
    button.disabled = !canCreateAudit;
  });
  const importLabel = $("importCurrentFileLabel");
  if (importLabel) {
    importLabel.hidden = !canCreateAudit;
    const input = $("importCurrentFile");
    if (input) input.disabled = !canCreateAudit;
  }

  const activeAudits = state.databaseAudits || [],
    deletedAudits = state.deletedAudits || [],
    identityReady = state.currentUserStatus === "ready",
    canManageDeletedAudits = Boolean(
      identityReady && state.currentUser?.access?.canManageDeletedAudits,
    ),
    requestedDeletedMode = state.myAuditsRoleFilter === "deleted",
    deletedMode = requestedDeletedMode && canManageDeletedAudits,
    effectiveFilter =
      requestedDeletedMode && !canManageDeletedAudits
        ? "all"
        : state.myAuditsRoleFilter,
    audits = deletedMode ? deletedAudits : activeAudits,
    listStatus = deletedMode
      ? state.deletedAuditsStatus
      : state.databaseAuditsStatus,
    listError = deletedMode
      ? state.deletedAuditsError
      : state.databaseAuditsError;

  const metrics = {
    assigned: 0,
    backup: 0,
    developer: 0,
    other: 0,
    all: activeAudits.length,
  };

  activeAudits.forEach((audit) => {
    const membership = atlasAuditMembership(audit);
    if (identityReady && membership.assigned) metrics.assigned++;
    if (identityReady && membership.backup) metrics.backup++;
    if (identityReady && membership.developer) metrics.developer++;
    if (
      !identityReady ||
      (!membership.assigned && !membership.backup && !membership.developer)
    )
      metrics.other++;
  });

  Object.entries(metrics).forEach(([key, value]) =>
    setText(`myAuditsMetric${key[0].toUpperCase() + key.slice(1)}`, value),
  );

  const deletedFilter = $("myAuditsDeletedFilter");
  if (deletedFilter) deletedFilter.hidden = !canManageDeletedAudits;
  setText("myAuditsDeletedCount", String(deletedAudits.length));

  document.querySelectorAll("[data-my-audits-role]").forEach((button) => {
    const filter = button.dataset.myAuditsRole;
    const active = filter === effectiveFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled =
      (filter === "deleted" && !canManageDeletedAudits) ||
      (!identityReady && filter !== "all");
  });

  if (listStatus === "loading") {
    body.replaceChildren();
    stateHost.textContent = deletedMode
      ? "Loading Deleted Items…"
      : "Loading database audits…";
    stateHost.className = "my-audits-state loading";
    return;
  }

  if (listStatus === "error") {
    body.replaceChildren();
    const label = deletedMode ? "Deleted Items" : "Audit list";
    stateHost.textContent = `${label} could not be loaded. ${listError || ""}`;
    stateHost.className = "my-audits-state error";
    return;
  }

  if (!identityReady && effectiveFilter !== "all") {
    body.replaceChildren();
    stateHost.textContent =
      "Personalized audit filters are unavailable because your profile could not be loaded. Choose All to browse audits.";
    stateHost.className = "my-audits-state error";
    return;
  }

  const statusFilter = state.myAuditsStatusFilter || "all";
  const statusControl = $("myAuditsStatusFilter");
  if (statusControl) {
    statusControl.value = statusFilter;
    atlasSyncChoiceSelection?.(statusControl);
  }
  const query = String(state.myAuditsSearch ?? "")
    .trim()
    .toLowerCase();
  const filtered = audits.filter((audit) => {
    const searchMatches = !query || atlasAuditSearchText(audit).includes(query);
    if (deletedMode) return searchMatches;
    const statusMatches =
      statusFilter === "all" || (audit.status || "Draft") === statusFilter;

    const membership = atlasAuditMembership(audit);
    const filterMatches =
      effectiveFilter === "all" ||
      (effectiveFilter === "assigned" && membership.assigned) ||
      (effectiveFilter === "backup" && membership.backup) ||
      (effectiveFilter === "developer" && membership.developer) ||
      (effectiveFilter === "other" &&
        !membership.assigned &&
        !membership.backup &&
        !membership.developer);
    return filterMatches && statusMatches && searchMatches;
  });

  body.replaceChildren();
  stateHost.textContent = "";
  stateHost.className = "my-audits-state";

  filtered.forEach((audit) => {
    const membership = atlasAuditMembership(audit),
      assignments = normalizeAuditAssignments?.(audit.assignments) || {
        assigned: [],
        backup: [],
        developer: [],
      },
      row = document.createElement("tr");
    const cells = [
      [audit.name || audit.id, audit.id],
      [membership.role, ""],
      [audit.status || "Draft", ""],
      [atlasAssignmentNames(assignments.assigned), ""],
      [atlasAssignmentNames(assignments.backup), ""],
      [atlasAssignmentNames(assignments.developer), ""],
      [
        audit.updatedAt
          ? new Date(audit.updatedAt).toLocaleString()
          : "Not set",
        "",
      ],
    ];

    cells.forEach(([main, sub], index) => {
      const cell = document.createElement("td");
      if (index === 1) {
        const badge = document.createElement("span");
        badge.className = "badge role-badge";
        badge.textContent = main;
        cell.append(badge);
      } else if (index === 2) {
        const statusValue = String(main || "").trim() || "Draft";
        const statusClasses = {
          Draft: "draft",
          "Requirement Gathering": "requirement-gathering",
          "Ready for Review": "ready-for-review",
          Complete: "complete",
        };
        const statusText = document.createElement("span");
        statusText.textContent = statusValue;
        if (statusClasses[statusValue])
          statusText.className = `audit-status-pill audit-status-pill-${statusClasses[statusValue]}`;
        cell.append(statusText);
        cell.title = statusValue;
      } else {
        const mainText = document.createElement(
          index === 0 ? "strong" : "span",
        );
        mainText.textContent = main;
        cell.append(mainText);
        if (sub) {
          const secondaryText = document.createElement("small");
          secondaryText.textContent = sub;
          cell.append(secondaryText);
        }
        cell.title = main;
      }
      row.append(cell);
    });

    const action = document.createElement("td");
    if (deletedMode) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "btn secondary small";
      restore.dataset.restoreDeletedAudit = audit.id;
      restore.textContent = "Restore";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn secondary small";
      remove.dataset.permanentlyDeleteAudit = audit.id;
      remove.textContent = "Delete permanently";
      action.append(restore, document.createTextNode(" "), remove);
    } else {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "btn primary small";
      open.dataset.openDatabaseAudit = audit.id;
      open.textContent = "Open";
      action.append(open);
      if ((audit.status || "Draft") === "Complete") {
        const publish = document.createElement("details");
        publish.className = "audit-publish-menu";
        const summary = document.createElement("summary");
        summary.className = "btn secondary small";
        summary.textContent = "Export";
        const menu = document.createElement("div");
        menu.className = "audit-publish-menu-panel";
        (window.ATLASExportFormats?.visible?.() || []).forEach((format) =>
          format.actions.forEach((action) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn ghost small";
            button.dataset.publishAudit = audit.id;
            button.dataset.publishFormat = format.id;
            button.dataset.publishAction = action;
            button.textContent =
              action === "copy" ? `Copy ${format.label}` : format.label;
            menu.append(button);
          }),
        );
        publish.append(summary, menu);
        publish.addEventListener("toggle", () => {
          if (!publish.open) {
            menu.removeAttribute("style");
            menu.removeAttribute("data-positioned");
            return;
          }
          document
            .querySelectorAll(".audit-publish-menu[open]")
            .forEach((other) => {
              if (other !== publish) other.open = false;
            });
          const margin = 8;
          const gap = 6;
          menu.style.visibility = "hidden";
          menu.style.left = "0px";
          menu.style.top = "0px";
          menu.style.maxHeight = `${Math.max(120, window.innerHeight - margin * 2)}px`;
          const triggerRect = summary.getBoundingClientRect();
          const panelRect = menu.getBoundingClientRect();
          const left = Math.min(
            Math.max(margin, triggerRect.right - panelRect.width),
            Math.max(margin, window.innerWidth - panelRect.width - margin),
          );
          const availableBelow =
            window.innerHeight - triggerRect.bottom - margin;
          const availableAbove = triggerRect.top - margin;
          const openAbove =
            panelRect.height > availableBelow &&
            availableAbove > availableBelow;
          const availableHeight = Math.max(
            120,
            openAbove ? availableAbove - gap : availableBelow - gap,
          );
          const top = openAbove
            ? Math.max(
                margin,
                triggerRect.top -
                  Math.min(panelRect.height, availableHeight) -
                  gap,
              )
            : Math.min(triggerRect.bottom + gap, window.innerHeight - margin);
          menu.style.left = `${left}px`;
          menu.style.top = `${top}px`;
          menu.style.maxHeight = `${availableHeight}px`;
          menu.style.visibility = "visible";
          menu.dataset.positioned = "true";
        });
        publish.addEventListener("keydown", (event) => {
          if (event.key !== "Escape" || !publish.open) return;
          event.preventDefault();
          publish.open = false;
          summary.focus();
        });
        action.append(document.createTextNode(" "), publish);
      }
    }
    row.append(action);
    body.append(row);
  });

  if (!filtered.length) {
    const messages = {
      assigned: "No audits are currently assigned to you.",
      backup: "You are not currently listed as backup on any audits.",
      developer: "You are not listed as Developer for any audits.",
      other: "No other audits are available.",
      all: "No database audits are available.",
      deleted: "Deleted Items is empty.",
    };
    stateHost.textContent = messages[effectiveFilter] || messages.all;
    stateHost.className = "my-audits-state empty";
  }
}
function atlasRenderAssignmentAvatar(user) {
  const resolved = atlasResolvedAssignmentUser?.(user) || user;
  const span = document.createElement("span");
  span.className = "avatar assignment-avatar";
  span.textContent = atlasUserInitials(resolved);
  span.setAttribute("aria-hidden", "true");
  if (resolved?.avatar) {
    const img = document.createElement("img");
    img.src = resolved.avatar;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove(), { once: true });
    span.append(img);
  }
  return span;
}

function renderAssignmentEditor() {
  const audit = atlasDisplayDocument?.() || state.audit;
  ["assigned", "backup", "developer"].forEach((role) => {
    const root = $(
      `assignment${role[0].toUpperCase() + role.slice(1)}Selected`,
    );
    if (!root) return;
    root.replaceChildren();
    const users = normalizeAuditAssignments?.(audit.assignments)?.[role] || [];
    users.forEach((user) => {
      const chip = document.createElement("span");
      chip.className = "assignment-chip";
      chip.append(atlasRenderAssignmentAvatar(user));
      const name = document.createElement("span");
      name.textContent = atlasDisplayUser(
        atlasResolvedAssignmentUser?.(user) || user,
      );
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removeAssignmentRole = role;
      remove.dataset.assignmentUserId = user.id || "";
      remove.dataset.assignmentUsername = user.username || "";
      remove.setAttribute(
        "aria-label",
        `Remove ${atlasDisplayUser(user)} from ${role}`,
      );
      remove.textContent = "×";
      chip.append(name, remove);
      root.append(chip);
    });
    if (!users.length)
      root.textContent = `No ${role === "developer" ? "developers" : role + " analysts"} selected.`;
  });
}
function renderAssignmentSearchResults(role) {
  const host = $(`assignment${role[0].toUpperCase() + role.slice(1)}Results`);
  if (!host) return;
  const search = state.assignmentUserSearch?.[role];
  host.replaceChildren();
  if (!search) {
    host.className = "assignment-results error";
    host.textContent = "Assignment search is not available yet.";
    return;
  }
  if (search.loading) {
    host.textContent = "Searching users…";
    return;
  }
  if (search.error) {
    host.textContent = search.error;
    host.className = "assignment-results error";
    return;
  }
  host.className = "assignment-results";
  search.results.forEach((user, index) => {
    const row = document.createElement("div");
    row.className = "assignment-result";
    const identity = document.createElement("span");
    identity.className = "assignment-result-user";
    identity.append(atlasRenderAssignmentAvatar(user));
    const label = document.createElement("span");
    label.className = "assignment-result-label";
    const resolvedUser = atlasResolvedAssignmentUser?.(user) || user;
    label.textContent = `${atlasDisplayUser(resolvedUser)}${resolvedUser.username ? ` · ${resolvedUser.username}` : ""}`;
    identity.append(label);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "btn primary small assignment-result-action";
    action.dataset.addAssignmentRole = role;
    action.dataset.assignmentResultIndex = String(index);
    const already = (state.audit.assignments?.[role] || []).some((value) =>
      atlasUserMatches(value, user),
    );
    action.disabled = already || user.disabled;

    const roleLabel =
      {
        assigned: "Assigned",
        backup: "Backup",
        developer: "Developer",
      }[role] || "Unknown role";

    action.textContent = already
      ? "Already selected"
      : `Assign as ${roleLabel}`;

    const ATLAS_ASSIGNMENT_ROLE_LABELS = {
      assigned: "Assigned",
      backup: "Backup",
      developer: "Developer",
    };

    action.textContent = already
      ? "Already selected"
      : `Assign as ${ATLAS_ASSIGNMENT_ROLE_LABELS[role] || "Unknown role"}`;

    row.append(identity, action);
    host.append(row);
  });
  if (
    search.query.length >= 2 &&
    !search.loading &&
    !search.error &&
    !search.results.length
  )
    host.textContent = "No users found.";
}

const assignmentRenderBase = renderPageShellStatus;
renderPageShellStatus = function renderPageShellStatusWithAssignments() {
  assignmentRenderBase();
  renderCurrentUserProfile();
  renderMyAudits();
  renderAssignmentEditor();
};

// -----------------------------------------------------------------------------
// Assignment user profile cache, recent suggestions, and directory fallback
// -----------------------------------------------------------------------------
state.assignmentProfileCache = state.assignmentProfileCache || new Map();
state.assignmentRecentUsers = state.assignmentRecentUsers || [];
state.assignmentUserSearch = state.assignmentUserSearch || {};
ATLAS_ASSIGNMENT_ROLES.forEach((role) => {
  state.assignmentUserSearch[role] = state.assignmentUserSearch[role] || {
    query: "",
    results: [],
    loading: false,
    error: "",
    source: "recent",
    controller: null,
  };
});

function atlasUserProfileKey(user) {
  return String(user?.id || user?.username || "")
    .trim()
    .toLowerCase();
}
function atlasCacheAssignmentProfiles(users) {
  (users || []).forEach((user) => {
    const key = atlasUserProfileKey(user);
    if (key) state.assignmentProfileCache.set(key, user);
  });
}
function atlasResolvedAssignmentUser(user) {
  const byId = String(user?.id || "")
    .trim()
    .toLowerCase();
  const byUsername = String(user?.username || "")
    .trim()
    .toLowerCase();
  return (
    state.assignmentProfileCache.get(byId) ||
    state.assignmentProfileCache.get(byUsername) ||
    user
  );
}
function atlasMergeAssignmentUsers(...lists) {
  const result = [];
  lists.flat().forEach((user) => {
    if (!user || result.some((item) => atlasUserMatches(item, user))) return;
    result.push(user);
  });
  return result;
}
async function atlasLoadRecentAssignmentUsers(role, query = "") {
  const search = state.assignmentUserSearch[role];
  if (!search) return;
  search.controller?.abort?.();
  search.controller = new AbortController();
  search.query = String(query || "").trim();
  search.loading = true;
  search.error = "";
  search.source = "recent";
  renderAssignmentSearchResults(role);
  try {
    const payload = await atlasSearchCachedUsers(search.query, {
      size: 20,
      signal: search.controller.signal,
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    atlasCacheAssignmentProfiles(items);
    state.assignmentRecentUsers = items;
    search.results = items;
  } catch (error) {
    if (error.name !== "AbortError") search.error = error.message;
  } finally {
    search.loading = false;
    renderAssignmentSearchResults(role);
  }
}
async function atlasSearchAllDirectoryUsers(role) {
  const search = state.assignmentUserSearch[role];
  if (!search || search.query.length < 2) {
    if (search)
      search.error =
        "Enter at least 2 characters before searching all Disney users.";
    renderAssignmentSearchResults(role);
    return;
  }
  search.controller?.abort?.();
  search.controller = new AbortController();
  search.loading = true;
  search.error = "";
  search.source = "directory";
  renderAssignmentSearchResults(role);
  try {
    const payload = await atlasSearchDirectoryProfiles(search.query, {
      size: 20,
      signal: search.controller.signal,
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    atlasCacheAssignmentProfiles(items);
    search.results = atlasMergeAssignmentUsers(search.results, items);
  } catch (error) {
    if (error.name !== "AbortError") search.error = error.message;
  } finally {
    search.loading = false;
    renderAssignmentSearchResults(role);
  }
}
function atlasAssignedUsersForHydration() {
  const assignments =
    normalizeAuditAssignments?.(state.audit?.assignments) || {};
  return atlasMergeAssignmentUsers(
    assignments.assigned || [],
    assignments.backup || [],
    assignments.developer || [],
  );
}
const atlasProfileHydrationInFlight = new Map();
async function atlasHydrateAssignedUserProfiles() {
  const auditId = state.audit?.id || "";
  const users = atlasAssignedUsersForHydration().filter(
    (user) => !state.assignmentProfileCache.has(atlasUserProfileKey(user)),
  );
  if (!users.length) return [];
  const key = users.map(atlasUserProfileKey).filter(Boolean).sort().join("|");
  if (atlasProfileHydrationInFlight.has(key))
    return atlasProfileHydrationInFlight.get(key);
  const request = atlasMeasure?.("atlas.profile.hydrate", async () => {
    try {
      const payload = await atlasResolveUserProfiles(users);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      atlasCacheAssignmentProfiles(items);
      if (state.audit?.id === auditId) {
        renderAssignmentEditor();
        if (atlasActivePage?.() === "my-audits") renderMyAudits();
      }
      return items;
    } catch (_error) {
      return [];
    } finally {
      atlasProfileHydrationInFlight.delete(key);
    }
  });
  atlasProfileHydrationInFlight.set(key, request);
  return request;
}
const ATLAS_ASSIGNMENT_PICKER_LABELS = Object.freeze({
  assigned: "Assigned Analyst",
  backup: "Backup Analyst",
  developer: "Developer",
});
let atlasAssignmentPickerRequest = 0;
let atlasAssignmentPickerTimer = null;
function atlasAssignmentPickerEntries(role, users) {
  const selected = atlasEnsureAuditAssignments()[role] || [];
  return atlasMergeAssignmentUsers(users).map((user) => {
    const resolved = atlasResolvedAssignmentUser(user);
    const already = selected.some((value) => atlasUserMatches(value, resolved));
    return {
      key: atlasUserProfileKey(resolved),
      label: atlasDisplayUser(resolved),
      rawName: resolved.username || atlasDisplayUser(resolved),
      detail:
        resolved.username && resolved.username !== atlasDisplayUser(resolved)
          ? resolved.username
          : "",
      sourceKey: "atlas-users",
      sourceLabel: "ATLAS Users",
      sourceColor: "#4d6fa9",
      avatar: resolved.avatar || "",
      initials: atlasUserInitials(resolved),
      disabled: already || resolved.disabled === true,
      badge: already
        ? "Assigned"
        : resolved.disabled === true
          ? "Unavailable"
          : "",
      user: resolved,
    };
  });
}
function atlasAssignmentPickerIsCurrent(context) {
  return Boolean(
    context &&
    state.audit?.id === context.auditId &&
    state.activeAuditValue === context.activeAuditValue,
  );
}
async function atlasRefreshAssignmentPicker(
  context,
  query = "",
  directory = false,
) {
  if (
    !atlasAssignmentPickerIsCurrent(context) ||
    !window.ATLASVisualPicker?.isOpen?.()
  )
    return false;
  const request = ++atlasAssignmentPickerRequest;
  context.controller?.abort?.();
  context.controller = new AbortController();
  const text = String(query || "").trim();
  if (directory && text.length < 2) {
    window.ATLASVisualPicker.setMessage(
      "Enter at least 2 characters before searching all Disney users.",
      "error",
    );
    return false;
  }
  window.ATLASVisualPicker.setEntries([], {
    message: directory
      ? "Searching the Disney directory…"
      : "Loading recent ATLAS users…",
  });
  try {
    const payload = await (directory
      ? atlasSearchDirectoryProfiles(text, {
          size: 20,
          signal: context.controller.signal,
        })
      : atlasSearchCachedUsers(text, {
          size: 20,
          signal: context.controller.signal,
        }));
    if (
      request !== atlasAssignmentPickerRequest ||
      !atlasAssignmentPickerIsCurrent(context)
    )
      return false;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    atlasCacheAssignmentProfiles(items);
    context.users = directory
      ? atlasMergeAssignmentUsers(context.users, items)
      : items;
    window.ATLASVisualPicker.setEntries(
      atlasAssignmentPickerEntries(context.role, context.users),
      {
        emptyMessage: directory
          ? "No matching Disney users were found."
          : "No matching recent ATLAS users were found.",
      },
    );
    return true;
  } catch (error) {
    if (error.name === "AbortError") return false;
    console.error("ATLAS Assignment Picker: user search failed safely.", {
      directory,
      message: error.message,
    });
    if (request === atlasAssignmentPickerRequest)
      window.ATLASVisualPicker.setEntries([], {
        message: directory
          ? "The Disney directory is unavailable. Try again."
          : "Recent ATLAS users could not be loaded. Try again.",
        kind: "error",
      });
    return false;
  }
}
function atlasOpenAssignmentPicker(role, options = {}) {
  if (!state.auditPersistence?.access?.canEdit) {
    status?.("Read-only access: assignments cannot be changed.", "warn");
    return false;
  }
  const validRole = atlasAssignmentRole(role);
  const picker = window.ATLASVisualPicker;
  if (!validRole || !picker?.open) return false;
  const context = {
    role: validRole,
    auditId: state.audit?.id || "",
    activeAuditValue: state.activeAuditValue || "",
    users: [],
    controller: null,
  };
  const label = ATLAS_ASSIGNMENT_PICKER_LABELS[validRole];
  const opened = picker.open({
    mode: "user",
    title: `Add ${label}`,
    guidance: "Choose a recent ATLAS user or search the full Disney directory.",
    searchPlaceholder: "Search recent ATLAS users",
    entries: [],
    sort: "alpha",
    actionLabel: "Search all Disney users",
    actionTitle: "Search the full Disney directory",
    closeOnSelect: false,
    emptyMessage: "Loading recent ATLAS users…",
    onQueryChange(query) {
      clearTimeout(atlasAssignmentPickerTimer);
      atlasAssignmentPickerTimer = setTimeout(
        () => atlasRefreshAssignmentPicker(context, query, false),
        180,
      );
    },
    onAction(query) {
      atlasRefreshAssignmentPicker(context, query, true);
    },
    onSelect(entry) {
      if (
        !atlasAssignmentPickerIsCurrent(context) ||
        options.validateSelection?.() === false
      ) {
        picker.close("stale");
        globalThis.ATLASAuditIssues?.invalidate?.();
        status?.(
          "The audit or issue changed. Reopen the assignment picker and try again.",
          "warn",
        );
        return;
      }
      const user = entry?.user || entry;
      if (!atlasAddAuditAssignment(validRole, user)) {
        picker.setMessage(
          "That user is already assigned to this role or is unavailable.",
          "error",
        );
        return;
      }
      options.onAssigned?.(user, validRole);
      picker.close("select");
    },
    onClose() {
      clearTimeout(atlasAssignmentPickerTimer);
      context.controller?.abort?.();
    },
  });
  if (opened) atlasRefreshAssignmentPicker(context, "", false);
  return opened;
}
ATLAS_ASSIGNMENT_ROLES.forEach((role) => {
  const suffix = role[0].toUpperCase() + role.slice(1);
  const input = $(`assignment${suffix}Search`);
  input?.addEventListener("focus", () =>
    atlasLoadRecentAssignmentUsers(role, input.value),
  );
  input?.addEventListener("input", () =>
    atlasLoadRecentAssignmentUsers(role, input.value),
  );
});
document.addEventListener("click", (event) => {
  const addAssignment = event.target.closest("[data-add-assignment-role]");
  if (addAssignment) {
    event.preventDefault();
    const role = atlasAssignmentRole(addAssignment.dataset.addAssignmentRole);
    const index = Number.parseInt(
      addAssignment.dataset.assignmentResultIndex,
      10,
    );
    const user =
      role && Number.isInteger(index)
        ? state.assignmentUserSearch?.[role]?.results?.[index]
        : null;
    if (!atlasAddAuditAssignment(role, user))
      status?.("The selected user could not be assigned.", "warn");
    return;
  }
  const openAssignmentPicker = event.target.closest(
    "[data-open-assignment-picker]",
  );
  if (openAssignmentPicker) {
    event.preventDefault();
    atlasOpenAssignmentPicker(
      openAssignmentPicker.dataset.openAssignmentPicker,
      { trigger: openAssignmentPicker },
    );
    return;
  }
  const removeAssignment = event.target.closest(
    "[data-remove-assignment-role]",
  );
  if (removeAssignment) {
    event.preventDefault();
    const removed = atlasRemoveAuditAssignment(
      removeAssignment.dataset.removeAssignmentRole,
      {
        id: removeAssignment.dataset.assignmentUserId || "",
        username: removeAssignment.dataset.assignmentUsername || "",
      },
    );
    if (!removed)
      status?.("The selected assignment could not be removed.", "warn");
    return;
  }
  const allUsers = event.target.closest("[data-search-all-assignment-users]");
  if (allUsers) {
    event.preventDefault();
    atlasSearchAllDirectoryUsers(allUsers.dataset.searchAllAssignmentUsers);
  }
});
document.addEventListener("DOMContentLoaded", () => {
  atlasHydrateAssignedUserProfiles();
});

// Source selection repaints Sources immediately and dirties Logic Builder.
document.addEventListener("change", (event) => {
  const control = event.target.closest(
    "[data-source-select], [data-source-picker], #sourceSelect, #activeSourceSelect",
  );
  if (!control) return;
  queueMicrotask(() => atlasInvalidateSourceMutation?.({ immediate: true }));
});

document.addEventListener("click", async (event) => {
  const publish = event.target.closest("[data-publish-audit]");
  if (!publish) return;
  event.preventDefault();
  try {
    await atlasLoadDatabaseAudit(publish.dataset.publishAudit);
    await window.ATLASExportFormats?.run?.(
      publish.dataset.publishFormat,
      publish.dataset.publishAction || "download",
    );
  } catch (error) {
    status(`Export failed: ${error.message}`, "bad");
  }
});
