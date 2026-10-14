/**
 * 06-events-bootstrap.js
 *
 * Application event bootstrap. This file wires top-level buttons, input/change listeners, navigation, import controls, and startup initialization.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Event listener utility
// -----------------------------------------------------------------------------
/**
 * Attaches an event listener to an element by id if the element exists.
 * @param {any} id - Element id or record id to look up.
 * @param {any} eventName - Input used by on.
 * @param {any} handler - Callback function for an event.
 */
function on(id, eventName, handler) {
  const el = $(id);
  if (el) el.addEventListener(eventName, handler);
}

/**
 * Returns true when a broad body input/change handler should skip a nested UI surface
 * that has its own specialized event handling.
 * @param {Event} event - DOM event from a delegated body listener.
 */
function shouldSkipBaseBodyEditEvent(event) {
  const skipSelector = [
    "[data-live-editor-step-id]",
    "#completeStatementsToggle",
    "#includeNotesToggle",
    "#previewStyle",
    "[data-preview-tab]",
    ".visual-picker-modal-backdrop",
    ".join-picker-backdrop",
    ".source-replace-backdrop",
    ".field-replace-backdrop",
    ".condition-repair-backdrop",
    ".logic-issue-panel",
    ".logic-issues-backdrop",
    ".new-rule-menu-panel",
    ".tutorial-card",
    ".tutorial-overlay",
    ".modal",
    "[data-my-audits-role]",
    "#myAuditsSearch",
  ].join(", ");
  return !!event.target.closest?.(skipSelector);
}

// -----------------------------------------------------------------------------
// Top-level event bindings
// -----------------------------------------------------------------------------
/**
 * Registers all top-level UI event handlers.
 */
function bindEvents() {
  if (window.__atlasCoreEventsBound) return;
  window.__atlasCoreEventsBound = true;
  if (e.completeStatements)
    e.completeStatements.checked = state.previewStatementMode === "complete";
  document.querySelectorAll(".rail-item").forEach((button) => {
    button.onclick = (event) => {
      if (button.classList.contains("is-locked")) {
        event.preventDefault();
        return;
      }
      atlasNavigateToSection(button.dataset.section).catch((err) =>
        status(`Navigation save failed: ${err.message}`, "bad"),
      );
    };
  });

  document.querySelectorAll("[data-my-audits-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.myAuditsRole;
      if (
        ![
          "assigned",
          "backup",
          "developer",
          "other",
          "all",
          "deleted",
        ].includes(role)
      )
        return;
      state.myAuditsRoleFilter = role;
      if (role === "deleted") atlasRefreshDeletedAudits().catch(() => {});
      renderMyAudits?.();
    });
  });
  on("myAuditsSearch", "input", (event) => {
    state.myAuditsSearch = event.target.value;
    renderMyAudits?.();
  });
  on("myAuditsStatusFilter", "change", (event) => {
    state.myAuditsStatusFilter = event.target.value;
    renderMyAudits?.();
  });
  on("auditStatus", "change", (event) => {
    const next = event.target.value;
    const previous = state.audit.status || "Draft";
    const message = $("auditStatusMessage");
    if (["Ready for Review", "Complete"].includes(next)) {
      globalThis.ATLASAuditIssues?.invalidate?.();
      const result = globalThis.ATLASAuditIssues?.current?.();
      if ((result?.counts?.critical || 0) > 0) {
        event.target.value = previous;
        atlasSyncChoiceSelection?.(event.target);
        if (message)
          message.textContent =
            "Resolve all Critical Errors before marking this audit Ready for Review or Complete.";
        status("Status change blocked by Critical Errors.", "warn");
        return;
      }
    }
    state.audit.status = next;
    if (message) message.textContent = "";
    scheduleAutosave();
    renderMyAudits?.();
  });
  on("createAuditBtn", "click", async () => {
    if (!state.currentUser?.access?.canCreate)
      return status(
        "The verified atlas-admin-team role is required to create audits.",
        "warn",
      );
    const name = prompt("Name the new audit:", "New Audit Logic Flow");
    if (!name) return;
    if (!(await atlasSaveIfDirty("new audit"))) return;
    state.audit = defaultAudit();
    state.audit.name = name;
    state.selectedStepId = null;
    state.activeAuditValue = `draft:${state.audit.id}`;
    markAuditSelected();
    renderAll();
    showSection("overview");
    scheduleAutosave();
    updateActiveAuditBaseline();
    renderActiveAuditSelect?.();
    atlasCreateCurrentAudit("Created audit").catch((err) =>
      status(`Database create failed: ${err.message}`, "bad"),
    );
  });
  on("renameAuditBtn", "click", () => {
    const name = prompt("Rename active audit:", state.audit.name);
    if (!name) return;
    state.audit.name = name;
    renderAll();
    scheduleAutosave();
  });
  on("auditVersionHistoryBtn", "click", () =>
    atlasOpenAuditHistory?.().catch((err) => status(err.message, "bad")),
  );
  on("stepVersionHistoryBtn", "click", () =>
    atlasOpenStepHistory?.().catch((err) => status(err.message, "bad")),
  );
  on("deleteAuditBtn", "click", () => {
    atlasArchiveCurrentAudit().catch((error) =>
      status(
        `Delete Audit failed: ${error.message} Try again or refresh the audit before retrying.`,
        "bad",
      ),
    );
  });
  on("duplicateAuditBtn", "click", async () => {
    if (!state.currentUser?.access?.canCreate)
      return status(
        "The verified atlas-admin-team role is required to duplicate audits.",
        "warn",
      );
    if (!(await atlasSaveIfDirty("duplicate audit"))) return;
    capture();
    const clone = structuredClone(state.audit);
    clone.id = uid("audit");
    clone.name = `${clone.name} Copy`;
    clone.steps = clone.steps.map((step) => ({
      ...step,
      id: step.autoGeneratedReference
        ? `reference_${uid("source")}`
        : uid("step"),
      parentId: null,
    }));
    state.audit = clone;
    state.selectedStepId = state.audit.steps[0]?.id || null;
    state.activeAuditValue = `draft:${state.audit.id}`;
    markAuditSelected();
    renderAll();
    showSection("overview");
    scheduleAutosave();
    updateActiveAuditBaseline();
    renderActiveAuditSelect?.();
    atlasCreateCurrentAudit("Duplicated audit").catch((err) =>
      status(`Database create failed: ${err.message}`, "bad"),
    );
  });
  on("newAuditBtn", "click", async () => {
    if (!state.currentUser?.access?.canCreate)
      return status(
        "The verified atlas-admin-team role is required to create audits.",
        "warn",
      );
    if (
      confirm(
        "Start a new audit logic flow? Unsaved changes remain in autosave until cleared.",
      )
    ) {
      if (!(await atlasSaveIfDirty("new audit"))) return;
      const candidate = defaultAudit();
      const button = $("newAuditBtn");
      state.creatingAudit = true;
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      }
      try {
        await atlasCreateAuditDocument(candidate, "Created audit");
      } catch (err) {
        if (!hasSelectedAudit?.()) {
          state.activeAuditValue = "";
          state.pendingActiveAuditValue = "";
          clearAuditSelection();
          showSection("my-audits");
          renderActiveAuditSelect?.();
        }
        status(`Database create failed: ${err.message}`, "bad");
      } finally {
        state.creatingAudit = false;
        if (button) {
          button.disabled = !state.currentUser?.access?.canCreate;
          button.removeAttribute("aria-busy");
        }
      }
    }
  });

  on("exportCurrentBtn", "click", exportCurrent);
  on("downloadDocBtn", "click", exportCurrent);
  on("downloadCsvBtn", "click", exportCsv);
  on("downloadExcelBtn", "click", () =>
    exportAuditExcel().catch((err) =>
      status(`Excel export failed: ${err.message}`, "bad"),
    ),
  );
  on("downloadQtestExcelBtn", "click", () =>
    exportQtestExcel().catch((err) =>
      status(`Qtest Excel export failed: ${err.message}`, "bad"),
    ),
  );
  on("downloadHtmlBtn", "click", exportAuditHtml);
  on("copyHtmlBtn", "click", () => copyAuditHtml());
  on("copyMarkdownBtn", "click", copyMarkdown);
  on("completeStatementsToggle", "change", () => {
    state.previewStatementMode = e.completeStatements?.checked
      ? "complete"
      : "nested";
    localStorage.setItem(
      "atlasAlignPreviewStatementMode",
      state.previewStatementMode,
    );
    atlasRequestRender?.({ preview: true });
  });
  on("includeNotesToggle", "change", () =>
    atlasRequestRender?.({ preview: true }),
  );
  on("previewStyle", "change", () => atlasRequestRender?.({ preview: true }));
  on("addStepBtn", "click", (event) => atlasToggleNewRuleTypeMenu?.(event));
  on("loadLibraryAuditBtn", "click", () =>
    loadSelectedLibraryAudit().catch((err) =>
      status(`Audit library load failed: ${err.message}`, "bad"),
    ),
  );
  on("refreshLibraryBtn", "click", () =>
    loadRepoLibrary().catch((err) =>
      status(`Database audit refresh failed: ${err.message}`, "bad"),
    ),
  );
  on("saveFlowBtn", "click", () =>
    saveFlow().catch((err) => status(err.message, "bad")),
  );
  if (!document.__atlasSaveShortcutBound) {
    document.addEventListener("keydown", (event) => {
      const isSaveShortcut =
        String(event.key || "").toLowerCase() === "s" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey;
      if (!isSaveShortcut) return;
      event.preventDefault();
      if (!hasSelectedAudit?.())
        return status("Select or create an audit before saving.", "warn");
      atlasSaveIfDirty("keyboard shortcut").catch((err) =>
        status(err.message, "bad"),
      );
    });
    document.__atlasSaveShortcutBound = true;
  }
  on("loadFlowBtn", "click", () =>
    loadFlow().catch((err) => status(err.message, "bad")),
  );
  on("deleteFlowBtn", "click", () =>
    deleteFlow().catch((err) => status(err.message, "bad")),
  );
  on("exportAllBtn", "click", exportAll);
  on("clearAutosaveBtn", "click", () => clearAutosave());
  on("resetLocalDataBtn", "click", () =>
    resetLocalAppData().catch((err) =>
      status(`Clear saved data failed: ${err.message}`, "bad"),
    ),
  );
  on("activeAuditSelect", "change", () => {
    state.pendingActiveAuditValue = $("activeAuditSelect")?.value || "";
    renderActiveAuditSelect?.();
  });
  on("confirmActiveAuditBtn", "click", () => {
    const value =
      state.pendingActiveAuditValue || $("activeAuditSelect")?.value || "";
    if (!value || value === state.activeAuditValue) {
      renderActiveAuditSelect?.();
      return;
    }
    switchActiveAudit(value)
      .then(() => {
        state.pendingActiveAuditValue = "";
        renderActiveAuditSelect?.();
      })
      .catch((err) => {
        status(`Audit switch failed: ${err.message}`, "bad");
        renderActiveAuditSelect?.();
      });
  });
  on("fieldDisplayModeBtn", "click", () => {
    toggleFieldDisplayMode?.();
    renderFieldDisplayModeButton?.();
  });
  on("themeBtn", "click", () =>
    setTheme(themeMode() === "dark" ? "light" : "dark"),
  );
  on("helpBtn", "click", () => startTutorial("global"));
  on("auditTutorialBtn", "click", () => startTutorial("audit"));
  on("fieldsTutorialBtn", "click", () => startTutorial("fields"));
  on("stepsTutorialBtn", "click", () => startTutorial("steps"));
  on("saveTutorialBtn", "click", () => startTutorial("save"));

  const importAllFile = $("importAllFile");
  if (importAllFile) {
    importAllFile.onchange = async (event) => {
      const file = event.target.files[0];
      try {
        if (file) await atlasImportAuditJsonFile(file);
      } catch (err) {
        status(`Audit import failed: ${err.message}`, "bad");
      } finally {
        event.target.value = "";
      }
    };
  }
  const importCurrentFile = $("importCurrentFile");
  if (importCurrentFile) {
    importCurrentFile.onchange = async (event) => {
      const file = event.target.files[0];
      try {
        if (!file) return;
        const result = await atlasImportAuditJsonFile(file);
        const first = result.imported?.[0];
        if (first?.audit?.id) {
          await atlasLoadDatabaseAudit(first.audit.id);
          showSection("overview");
        }
      } catch (err) {
        status(`Audit import failed: ${err.message}`, "bad");
      } finally {
        event.target.value = "";
      }
    };
  }

  document.body.addEventListener("input", (event) => {
    if (shouldSkipBaseBodyEditEvent(event)) return;
    capture();
    atlasRequestRender?.({ preview: true });
    scheduleAutosave();
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.closest("#activeAuditSelect, #auditLibrarySelect")) return;
    if (shouldSkipBaseBodyEditEvent(event)) return;
    capture();
    atlasRequestRender?.({
      selectedStep: true,
      preview: true,
      logicTable: true,
      validation: true,
    });
    scheduleAutosave();
  });
  document.body.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore-deleted-audit]");
    if (restoreButton) {
      atlasRestoreDeletedAudit(restoreButton.dataset.restoreDeletedAudit).catch(
        (error) => status(error.message, "bad"),
      );
      return;
    }
    const permanentButton = event.target.closest(
      "[data-permanently-delete-audit]",
    );
    if (permanentButton) {
      atlasPermanentlyDeleteAudit(
        permanentButton.dataset.permanentlyDeleteAudit,
      ).catch((error) => status(error.message, "bad"));
      return;
    }
    const openAuditButton = event.target.closest("[data-open-database-audit]");
    if (openAuditButton) {
      const auditId = String(
        openAuditButton.dataset.openDatabaseAudit || "",
      ).trim();
      if (!auditId) return;
      event.preventDefault();
      atlasLoadDatabaseAudit(auditId).catch((err) =>
        status(`Audit load failed: ${err.message}`, "bad"),
      );
      return;
    }
    const card = event.target.closest(".step-card");
    if (event.target.matches("[data-select-step]") && card) {
      if (typeof atlasSelectStepWithoutListRender === "function") {
        atlasSelectStepWithoutListRender(card.dataset.id);
      } else {
        state.selectedStepId = card.dataset.id;
        renderSteps();
        renderSelectedStep();
      }
    }
    if (event.target.matches("[data-add-child-step]") && card) {
      capture();
      const parentStep = state.audit.steps.find(
        (item) => item.id === card.dataset.id,
      );
      if (parentStep?.autoGeneratedReference)
        return status(
          "Generated reference steps cannot have child logic steps.",
          "warn",
        );
      if (parentStep) addChildStep(parentStep);
      return;
    }
    if (event.target.matches("[data-delete-step]") && card) {
      capture();
      const step = state.audit.steps.find(
        (item) => item.id === card.dataset.id,
      );
      if (step?.autoGeneratedReference)
        return status(
          "Generated reference steps are removed by removing the source file.",
          "warn",
        );
      state.audit.steps = state.audit.steps.filter(
        (item) => item.id !== card.dataset.id,
      );
      atlasRequestStructuralStepRender?.();
      scheduleAutosave();
    }
    if (event.target.matches("[data-indent]") && card) {
      capture();
      const step = state.audit.steps.find(
        (item) => item.id === card.dataset.id,
      );
      if (step?.autoGeneratedReference)
        return status("Generated reference steps cannot be nested.", "warn");
      if (!makeChildOfPrevious(step))
        status("This step cannot be nested under the previous step.", "warn");
      atlasRequestStructuralStepRender?.();
      scheduleAutosave();
    }
    if (event.target.matches("[data-outdent]") && card) {
      capture();
      const step = state.audit.steps.find(
        (item) => item.id === card.dataset.id,
      );
      if (!outdentStep(step)) status("This step is already top-level.", "warn");
      atlasRequestStructuralStepRender?.();
      scheduleAutosave();
    }
  });
  window.addEventListener("resize", positionTutorial);
  if (!window.__atlasPageHideSaveBound) {
    window.addEventListener("pagehide", atlasSaveOnPageHide);
    window.__atlasPageHideSaveBound = true;
  }
}

// -----------------------------------------------------------------------------
// Startup sequence
// -----------------------------------------------------------------------------
/**
 * Initializes theme, catalogs, events, autosave restore, and the initial render.
 */
async function init() {
  atlasSetApplicationReady(false);
  setTheme(localStorage.getItem("atlasAlignTheme") || "light");
  state.activeAuditValue = "";
  state.pendingActiveAuditValue = "";
  state.selectedStepId = null;
  clearAuditSelection();

  // Make the already-loaded shell interactive before awaiting remote startup data.
  bindEvents();
  bindCatalogFieldBrowserEvents?.();
  showSection("my-audits");
  updateNavigationLockState?.();
  renderFlowNavControls?.();

  const essentialStartup = await Promise.allSettled([
    initPhraseCatalog?.(),
    atlasInitSourceDatabase?.(),
    atlasInitAuditDatabase?.({ render: false }),
    atlasLoadCurrentUser?.({ render: false }),
  ]);
  renderCurrentUserProfile?.();
  await atlasInitValidation?.();
  renderMyAudits?.();
  renderStepTemplateOptions?.();

  await loadRepoLibrary?.({ render: false, refreshAudits: false });
  await inspectAutosaveRecovery().catch((error) => {
    state.recoveryCandidate = null;
    status(`Browser recovery could not be inspected: ${error.message}`, "warn");
  });
  state.selectedStepId = null;
  state.activeAuditValue = "";
  state.pendingActiveAuditValue = "";
  clearAuditSelection();
  syncAutoReferenceSteps?.();
  updateNavigationLockState?.();
  renderFlowNavControls?.();
  renderActiveAuditSelect?.();
  renderFieldDisplayModeButton?.();

  const startupFailures = essentialStartup.filter(
    (result) => result.status === "rejected",
  );
  showSection("my-audits");
  renderActiveAuditSelect?.();
  atlasSetApplicationReady(true);
  status(
    startupFailures.length
      ? "Ready with startup warnings. Review the visible loading or error messages."
      : "Ready. Select source files, build logic steps, and export the audit.",
    startupFailures.length ? "warn" : "ok",
  );
}
init();
