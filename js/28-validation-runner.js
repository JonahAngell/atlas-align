/**
 * Preview-only Phase 1 Read-Only Isolation validation runner.
 * Loaded before bootstrap; no validation global or storage is created until the
 * server-authenticated /api/me response explicitly enables the feature.
 */
let atlasInitValidation = async function atlasInitValidation() {
  const availability = state.currentUser?.validation;
  if (
    availability?.enabled !== true ||
    !availability.authenticatedUserId ||
    !availability.effectiveProfileId
  )
    return false;

  const DB_NAME = "atlasAlignValidation";
  const DB_VERSION = 1;
  const STORE_NAME = "runs";
  const STATUS = new Set([
    "not_run",
    "in_progress",
    "passed",
    "failed",
    "blocked",
  ]);
  const suites = new Map();
  let activeSuiteId = "";
  let activeStepIndex = 0;
  let dialogRoot = null;
  let lastFocus = null;

  function openValidationDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME))
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readRun(id) {
    const db = await openValidationDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function writeRun(run) {
    const db = await openValidationDb();
    try {
      await new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME)
          .put(run);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  function storageId(suiteId) {
    return `atlas-validation:${availability.authenticatedUserId}:${suiteId}`;
  }

  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = ordered(value[key]);
        return result;
      }, {});
  }

  function signature(value) {
    const text = JSON.stringify(ordered(value));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function auditIdentity() {
    return state.audit?.id || state.auditPersistence?.auditId || null;
  }

  function persistenceSnapshot() {
    const coordinator =
      typeof atlasDatabaseWriteCoordinator === "object"
        ? atlasDatabaseWriteCoordinator
        : null;
    return {
      autosavePaused: Boolean(state.autosavePaused),
      autosaveDirty:
        typeof atlasAutosaveDirty === "boolean" ? atlasAutosaveDirty : null,
      saving: Boolean(state.auditPersistence?.saving),
      conflict: Boolean(state.auditPersistence?.conflict),
      databaseDirty:
        typeof atlasIsDatabaseAuditDirty === "function"
          ? Boolean(atlasIsDatabaseAuditDirty())
          : null,
      pendingReason: coordinator?.pendingReason || null,
      inFlight: Boolean(coordinator?.inFlight),
    };
  }

  async function autosaveSnapshot() {
    if (!window.indexedDB)
      return { available: false, reason: "IndexedDB unavailable" };
    try {
      const record = await dbGet(ATLAS_AUTOSAVE_ID);
      return {
        available: true,
        exists: Boolean(record),
        updatedAt: record?.updatedAt || null,
        auditId: record?.audit?.id || null,
      };
    } catch (error) {
      return {
        available: false,
        reason: error?.message || "Autosave could not be read",
      };
    }
  }

  async function takeSnapshot() {
    const audit = structuredClone(state.audit || null);
    return {
      capturedAt: new Date().toISOString(),
      audit: {
        id: auditIdentity(),
        signature: signature(audit),
      },
      persistence: persistenceSnapshot(),
      revision: {
        auditId: state.auditPersistence?.auditId || null,
        revisionId: state.auditPersistence?.revisionId || null,
        revisionNumber: state.auditPersistence?.revisionNumber || 0,
        submittedRevisionId:
          window.ATLASAuditReview?.context?.()?.submittedRevisionId || null,
      },
      autosave: await autosaveSnapshot(),
    };
  }

  function comparable(snapshot) {
    return {
      audit: snapshot.audit,
      persistence: snapshot.persistence,
      revision: snapshot.revision,
      autosave: snapshot.autosave,
    };
  }

  function validateSuite(definition) {
    if (!definition || definition.id !== "read-only-isolation")
      throw new Error(
        "Only the Read-Only Isolation suite is supported in Phase 1.",
      );
    if (
      !definition.version ||
      !definition.title ||
      !Array.isArray(definition.steps) ||
      !definition.steps.length
    )
      throw new Error("The Read-Only Isolation suite is incomplete.");
    const ids = new Set();
    for (const step of definition.steps) {
      if (!step.id || ids.has(step.id))
        throw new Error("Validation step IDs must be unique.");
      ids.add(step.id);
      for (const field of [
        "title",
        "purpose",
        "instructions",
        "page",
        "expected",
      ])
        if (!step[field])
          throw new Error(`Validation step ${step.id} is missing ${field}.`);
    }
  }

  function registerSuite(definition) {
    validateSuite(definition);
    suites.set(definition.id, Object.freeze(definition));
    render();
  }

  async function normalizedRun(suite) {
    const id = storageId(suite.id);
    const existing = await readRun(id);
    if (existing?.suiteVersion === suite.version) {
      existing.steps ||= {};
      Object.values(existing.steps).forEach((result) => {
        if (!STATUS.has(result.status)) result.status = "not_run";
      });
      return existing;
    }
    return {
      id,
      suiteId: suite.id,
      suiteVersion: suite.version,
      authenticatedUserId: availability.authenticatedUserId,
      currentStepIndex: 0,
      steps: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function currentContext() {
    const suite = suites.get(activeSuiteId) || suites.values().next().value;
    if (!suite) return { suite: null, run: null, step: null };
    activeSuiteId = suite.id;
    const run = await normalizedRun(suite);
    activeStepIndex = Math.max(
      0,
      Math.min(run.currentStepIndex || 0, suite.steps.length - 1),
    );
    return { suite, run, step: suite.steps[activeStepIndex] };
  }

  async function persistStep(run, step, patch) {
    const previous = run.steps[step.id] || { status: "not_run" };
    run.steps[step.id] = {
      ...previous,
      ...patch,
      stepId: step.id,
      title: step.title,
      authenticatedUserId: availability.authenticatedUserId,
      effectiveProfileId:
        state.currentUser?.validation?.effectiveProfileId ||
        state.currentUser?.id ||
        null,
    };
    run.currentStepIndex = activeStepIndex;
    run.updatedAt = new Date().toISOString();
    await writeRun(run);
    return run.steps[step.id];
  }

  async function startCurrentStep() {
    const { suite, run, step } = await currentContext();
    if (!suite) return;
    const before = await takeSnapshot();
    await persistStep(run, step, {
      status: "in_progress",
      startedAt: run.steps[step.id]?.startedAt || new Date().toISOString(),
      before,
      evidence: { source: "automated", message: "Baseline snapshot captured." },
    });
    render();
  }

  async function move(direction) {
    const { suite, run } = await currentContext();
    if (!suite) return;
    activeStepIndex = Math.max(
      0,
      Math.min(activeStepIndex + direction, suite.steps.length - 1),
    );
    run.currentStepIndex = activeStepIndex;
    run.updatedAt = new Date().toISOString();
    await writeRun(run);
    await startCurrentStep();
  }

  function clearHighlight() {
    document
      .querySelectorAll("[data-atlas-validation-highlight]")
      .forEach((item) => item.remove());
  }

  async function goToStep() {
    const { run, step } = await currentContext();
    if (!step) return;
    showSection(step.page);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const target = step.selector ? document.querySelector(step.selector) : null;
    if (!target) {
      await persistStep(run, step, {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        evidence: {
          source: "automated",
          message: `Target not found: ${step.selector || step.page}`,
        },
      });
      render();
      return;
    }
    target.scrollIntoView?.({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    const rect = target.getBoundingClientRect();
    clearHighlight();
    const highlight = document.createElement("div");
    highlight.dataset.atlasValidationHighlight = "true";
    highlight.className = "tutorial-highlight";
    Object.assign(highlight.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "99999",
      left: `${Math.max(4, rect.left - 6)}px`,
      top: `${Math.max(4, rect.top - 6)}px`,
      width: `${Math.max(12, rect.width + 12)}px`,
      height: `${Math.max(12, rect.height + 12)}px`,
    });
    document.body.append(highlight);
    setTimeout(clearHighlight, 2500);
  }

  async function checkCurrent() {
    const { run, step } = await currentContext();
    if (!step) return;
    const before = run.steps[step.id]?.before;
    if (!before) {
      await persistStep(run, step, {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        evidence: {
          source: "automated",
          message: "No baseline snapshot is available. Reopen this step.",
        },
      });
      render();
      return;
    }
    const after = await takeSnapshot();
    const passed =
      JSON.stringify(comparable(before)) === JSON.stringify(comparable(after));
    await persistStep(run, step, {
      status: passed ? "passed" : "failed",
      checkedAt: new Date().toISOString(),
      after,
      assertions: [{ id: "protected-state-unchanged", passed }],
      evidence: {
        source: "automated",
        message: passed
          ? "Protected audit, persistence, revision, and autosave values are unchanged."
          : "One or more protected values changed after the baseline snapshot.",
      },
    });
    render();
  }

  async function mark(status) {
    if (!new Set(["passed", "failed", "blocked"]).has(status)) return;
    const { run, step } = await currentContext();
    await persistStep(run, step, {
      status,
      checkedAt: new Date().toISOString(),
      evidence: { source: "manual", message: `Tester recorded ${status}.` },
    });
    render();
  }

  async function exportResults() {
    const { suite, run } = await currentContext();
    if (!suite) return;
    const results = suite.steps.map((step) => {
      const result = run.steps[step.id] || { status: "not_run" };
      return {
        stepId: step.id,
        title: step.title,
        status: STATUS.has(result.status) ? result.status : "not_run",
        startedAt: result.startedAt || null,
        checkedAt: result.checkedAt || null,
        effectiveProfileId: result.effectiveProfileId || null,
        auditId: result.after?.audit?.id || result.before?.audit?.id || null,
        revision: result.after?.revision || result.before?.revision || null,
        observations: result.after || result.before || null,
        assertions: result.assertions || [],
        resultSource: result.evidence?.source || null,
      };
    });
    downloadJson(
      `atlas-validation-${suite.id}-${new Date().toISOString().slice(0, 10)}.json`,
      {
        applicationVersion:
          typeof ATLAS_APP_VERSION === "string" ? ATLAS_APP_VERSION : null,
        suiteId: suite.id,
        suiteVersion: suite.version,
        authenticatedUserId: availability.authenticatedUserId,
        exportedAt: new Date().toISOString(),
        results,
      },
    );
  }

  function focusableDialogElements() {
    if (!dialogRoot) return [];
    return [
      ...dialogRoot.querySelectorAll(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hidden);
  }
  function close() {
    clearHighlight();
    dialogRoot?.remove();
    dialogRoot = null;
    if (
      lastFocus &&
      document.contains(lastFocus) &&
      typeof lastFocus.focus === "function"
    )
      lastFocus.focus();
    lastFocus = null;
  }

  async function render() {
    if (!dialogRoot) return;
    const { suite, run, step } = await currentContext();
    const panel = dialogRoot.querySelector("[data-validation-panel]");
    if (!panel) return;
    if (!suite) {
      panel.innerHTML =
        '<p role="status">Loading the Read-Only Isolation suite…</p>';
      return;
    }
    const result = run.steps[step.id] || { status: "not_run" };
    panel.innerHTML = `
      <header><div><small>Read-Only Isolation</small><h2 id="atlas-validation-title">${esc(step.title)}</h2></div><button class="btn ghost" type="button" data-validation-close aria-label="Close Validation">×</button></header>
      <label for="atlas-validation-suite"><strong>Suite</strong></label>
      <select id="atlas-validation-suite" data-validation-suite><option value="read-only-isolation">Read-Only Isolation</option></select>
      <p><strong>Step ${activeStepIndex + 1} of ${suite.steps.length}</strong> · Status: <span role="status">${esc(result.status)}</span></p>
      <p><strong>Purpose:</strong> ${esc(step.purpose)}</p>
      <p><strong>Instructions:</strong> ${esc(step.instructions)}</p>
      <p><strong>Expected:</strong> ${esc(step.expected)}</p>
      <p><strong>Evidence:</strong> ${esc(result.evidence?.message || "No evidence recorded.")}</p>
      <div class="audit-history-actions">
        <button class="btn secondary" type="button" data-validation-prev ${activeStepIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="btn secondary" type="button" data-validation-next ${activeStepIndex === suite.steps.length - 1 ? "disabled" : ""}>Next</button>
        <button class="btn secondary" type="button" data-validation-go>Go to step</button>
        <button class="btn primary" type="button" data-validation-check>Check</button>
        <button class="btn secondary" type="button" data-validation-pass>Pass</button>
        <button class="btn secondary" type="button" data-validation-fail>Fail</button>
        <button class="btn secondary" type="button" data-validation-blocked>Blocked</button>
        <button class="btn secondary" type="button" data-validation-export>Export</button>
      </div>`;
    panel.querySelector("[data-validation-close]")?.focus();
  }

  function open() {
    if (dialogRoot) return;
    lastFocus = document.activeElement;
    dialogRoot = document.createElement("div");
    dialogRoot.className = "atlas-visual-picker-root";
    dialogRoot.dataset.atlasValidationRoot = "true";
    dialogRoot.innerHTML = `
      <div class="atlas-visual-picker-backdrop" data-validation-backdrop></div>
      <section class="atlas-visual-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-validation-title" tabindex="-1" data-validation-panel></section>`;
    dialogRoot.addEventListener("click", async (event) => {
      if (event.target.matches("[data-validation-backdrop]")) {
        close();
        return;
      }
      const target = event.target.closest("button");
      if (!target) return;
      if (target.matches("[data-validation-close]")) close();
      else if (target.matches("[data-validation-prev]")) await move(-1);
      else if (target.matches("[data-validation-next]")) await move(1);
      else if (target.matches("[data-validation-go]")) await goToStep();
      else if (target.matches("[data-validation-check]")) await checkCurrent();
      else if (target.matches("[data-validation-pass]")) await mark("passed");
      else if (target.matches("[data-validation-fail]")) await mark("failed");
      else if (target.matches("[data-validation-blocked]"))
        await mark("blocked");
      else if (target.matches("[data-validation-export]"))
        await exportResults();
    });
    dialogRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableDialogElements();
      if (!focusable.length) {
        event.preventDefault();
        dialogRoot?.querySelector("[data-validation-panel]")?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    document.body.append(dialogRoot);
    render();
    currentContext().then(({ run, step }) => {
      if (step && !run.steps[step.id]?.before) startCurrentStep();
    });
  }

  globalThis.ATLASValidation = Object.freeze({ registerSuite, open, close });
  const button = document.createElement("button");
  button.className = "btn secondary small";
  button.type = "button";
  button.textContent = "🚩";
  button.setAttribute("aria-label", "Open Read-Only Isolation validation");
  button.addEventListener("click", open);
  document.querySelector(".topbar-actions")?.prepend(button);

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/api/validation/read-only-isolation.js";
    script.onload = resolve;
    script.onerror = () =>
      reject(new Error("Could not load the Read-Only Isolation suite."));
    document.head.append(script);
  });
  return true;
};
