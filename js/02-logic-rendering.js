/**
 * 02-logic-rendering.js
 *
 * Base render pipeline and preview rendering. Later visual modules override several functions from this file, but renderAll remains the central render coordinator.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Base preview data helpers
// -----------------------------------------------------------------------------
/**
 * Generates notes for a step when manual notes are not provided.
 * @param {any} step - Logic step object being read or modified.
 * @param {any} index - Zero-based index used for ordering or display.
 */
function noteText(step, index) {
  return step.notes;
}

/**
 * Returns enabled steps in hierarchy order.
 */
function orderedSteps() {
  return hierarchicalStepEntries({ includeDisabled: false }).map(
    (entry) => entry.step,
  );
}

/**
 * Builds data rows for the requirements preview and exports.
 */
function previewRows() {
  syncAutoReferenceSteps?.();
  return hierarchicalStepEntries({ includeDisabled: false }).map(
    (entry, index) => ({
      step: `${entry.number}`,
      stepId: entry.step.id,
      branch: entry.branchLabel,
      analyst: analystLogic(entry.step),
      developer: developerLogic(entry.step),
      notes: noteText(entry.step, index),
      level: entry.level,
      source: entry.step.source || entry.step.params?.source_file || "",
    }),
  );
}

/** Normalizes source and field identity values for matching. */
function requirementsFieldIdentityPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Returns whether an audit field is custom, created, or calculated. */
function requirementsIsCustomField(field) {
  const type = requirementsFieldIdentityPart(field?.type);
  return !!(
    field?.custom ||
    field?.created ||
    field?.calculated ||
    type === "custom" ||
    type === "calculated" ||
    requirementsFieldIdentityPart(field?.sourceFile) === "calculated field"
  );
}

/** Resolves stable source identity while preserving key, file, and alias. */
function requirementsSourceIdentity(value) {
  const input = typeof value === "object" ? value || {} : { name: value };
  if (typeof atlasResolveSourceIdentity === "function")
    return atlasResolveSourceIdentity(input);
  return {
    sourceKey: input.sourceKey || input.sourceFile || input.name || "",
    sourceFile: input.sourceFile || input.name || "",
    alias: input.sourceAlias || input.alias || input.name || "",
  };
}

/** Returns enabled structured field references with hierarchy-ordered Notes. */
function requirementsLogicFieldReferences() {
  const references = [];
  hierarchicalStepEntries({ includeDisabled: false }).forEach(
    (entry, order) => {
      const step = entry.step;
      const found =
        typeof atlasLogicFieldReferences === "function"
          ? atlasLogicFieldReferences([step])
          : [];
      found.forEach((reference) =>
        references.push({
          sourceFile: reference.sourceFile || "",
          fieldName: reference.fieldName || "",
          notes: String(step.notes || "").trim(),
          order,
        }),
      );
    },
  );
  return references;
}

/** Builds canonical source-aware Fields rows for Preview and exports. */
function requirementsFieldRows(options = {}) {
  const includeNotes =
    options.includeNotes !== undefined
      ? !!options.includeNotes
      : !!e.includeNotes?.checked;
  const audit = atlasDisplayDocument?.() || state.audit;
  const auditFields = audit.fields || [];
  const auditSources = audit.sources || [];
  const catalogSources =
    typeof sourceCatalogEntries === "function" ? sourceCatalogEntries() : [];
  const records = new Map();
  const sourceOrder = new Map();
  auditSources.forEach((source, index) => {
    const identity = requirementsSourceIdentity(source);
    [identity.sourceKey, identity.sourceFile, identity.alias, source.name]
      .filter(
        (value) =>
          value &&
          (typeof atlasDisplayNameCollision !== "function" ||
            !atlasDisplayNameCollision(value)),
      )
      .forEach((value) =>
        sourceOrder.set(requirementsFieldIdentityPart(value), index),
      );
  });
  const candidates = (identity) =>
    [identity.sourceKey, identity.alias, identity.sourceFile]
      .filter(
        (value) =>
          value &&
          (value !== identity.sourceFile ||
            typeof atlasDisplayNameCollision !== "function" ||
            !atlasDisplayNameCollision(value)),
      )
      .map(requirementsFieldIdentityPart)
      .filter(Boolean);
  const sameSource = (record, identity) => {
    if (identity?.ambiguous) return false;
    const other = requirementsSourceIdentity({
      sourceKey: record?.sourceKey,
      sourceFile: record?.sourceFile,
      sourceAlias: record?.sourceAlias,
      alias: record?.alias,
      name: record?.name,
    });
    if (other?.ambiguous) return false;
    const values = new Set(candidates(other));
    return candidates(identity).some((value) => values.has(value));
  };
  const sameField = (field, name) => {
    const expected = requirementsFieldIdentityPart(name);
    return [
      field?.rawFieldName,
      field?.fieldName,
      field?.name,
      field?.label,
      field?.vanityLabel,
    ].some((value) => requirementsFieldIdentityPart(value) === expected);
  };
  const valueFrom = (items, keys) => {
    for (const item of items)
      for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && String(value).trim())
          return String(value).trim();
      }
    return "";
  };
  const displayFor = (field) =>
    /^(yes|true|1)$/i.test(
      valueFrom([field], ["displayed", "display", "isDisplayed"]),
    )
      ? "Yes"
      : "No";
  const createdColumnStep = (fieldTitle) => {
    const wanted = requirementsFieldIdentityPart(fieldTitle);
    if (!wanted) return null;
    const matches = (audit.steps || []).filter(
      (step) =>
        step?.step_type === "create_column" &&
        requirementsFieldIdentityPart(
          step.params?.column_name || step.field,
        ) === wanted,
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const catalogHasField = (identity, fieldName) =>
    catalogSources.some(
      (source) =>
        sameSource(source, identity) &&
        (source.fields || []).some((field) => sameField(field, fieldName)),
    );
  const definitionFor = (items, fieldTitle, includeCalculation) => {
    if (!includeNotes) return "";
    const parts = [];
    const business = valueFrom(items, ["businessDescription"]);
    if (business) parts.push(business);
    if (includeCalculation) {
      const step = createdColumnStep(fieldTitle);
      let sentence = "";
      if (step && typeof analystLogic === "function") {
        try {
          sentence = String(analystLogic(step) || "").trim();
        } catch (_error) {
          sentence = "";
        }
      }
      if (sentence && !parts.includes(sentence)) parts.push(sentence);
      const stepNotes = String(step?.notes || "").trim();
      if (stepNotes && !parts.includes(stepNotes)) parts.push(stepNotes);
    }
    return parts.join("\n");
  };
  requirementsLogicFieldReferences().forEach((reference) => {
    if (!reference.fieldName) return;
    const identity = requirementsSourceIdentity(reference.sourceFile);
    const sourceId =
      identity.sourceKey ||
      identity.alias ||
      identity.sourceFile ||
      reference.sourceFile ||
      "";
    const key = `source:${requirementsFieldIdentityPart(sourceId)}:${requirementsFieldIdentityPart(reference.fieldName)}`;
    const auditField =
      auditFields.find(
        (field) =>
          !requirementsIsCustomField(field) &&
          sameSource(field, identity) &&
          sameField(field, reference.fieldName),
      ) || null;
    const catalogSource =
      catalogSources.find((source) => sameSource(source, identity)) || null;
    const catalogField =
      (catalogSource?.fields || []).find((field) =>
        sameField(field, reference.fieldName),
      ) || null;
    if (!records.has(key)) {
      const fieldTitle =
        valueFrom(
          [auditField, catalogField],
          ["rawFieldName", "fieldName", "name", "label"],
        ) || reference.fieldName;
      records.set(key, {
        key,
        custom: false,
        sourceOrder: Math.min(
          ...candidates(identity).map(
            (value) => sourceOrder.get(value) ?? Number.MAX_SAFE_INTEGER,
          ),
        ),
        firstOrder: reference.order,
        uniqueId: sourceId,
        fieldTitle,
        vanityLabel:
          valueFrom(
            [auditField, catalogField],
            [
              "auditSpecificVanityLabel",
              "vanityLabel",
              "globalVanityLabel",
              "label",
              "name",
            ],
          ) || fieldTitle,
        displayFormat: valueFrom(
          [auditField, catalogField],
          ["displayFormat", "formatting", "format", "fieldFormat"],
        ),
        dataCategory: valueFrom(
          [auditField, catalogField],
          ["dataCategory", "category"],
        ),
        display: displayFor(auditField),
        notes: definitionFor(
          [auditField, catalogField],
          fieldTitle,
          !catalogHasField(identity, fieldTitle) &&
            Boolean(createdColumnStep(fieldTitle)),
        ),
      });
    }
  });
  const outputColumns = new Map();
  hierarchicalStepEntries({ includeDisabled: false }).forEach(
    (entry, order) => {
      const step = entry.step;
      const params = step.params || {};
      [
        params.output_column,
        params.destination_column,
        params.then_output_column,
        params.then_target_column,
        params.created_field,
        params.column_name,
      ]
        .filter(Boolean)
        .forEach((name) => {
          const normalized = requirementsFieldIdentityPart(name);
          const item = outputColumns.get(normalized) || { name, order };
          outputColumns.set(normalized, item);
        });
    },
  );
  const addCustom = (field, order) => {
    const fieldTitle = valueFrom(
      [field],
      ["rawFieldName", "fieldName", "name", "label"],
    );
    if (!fieldTitle) return;
    const key = `custom:${requirementsFieldIdentityPart(field.id || fieldTitle)}`;
    records.set(key, {
      key,
      custom: true,
      sourceOrder: -1,
      firstOrder: order,
      uniqueId: "",
      fieldTitle,
      vanityLabel:
        valueFrom(
          [field],
          [
            "auditSpecificVanityLabel",
            "vanityLabel",
            "globalVanityLabel",
            "label",
            "name",
          ],
        ) || fieldTitle,
      displayFormat: valueFrom(
        [field],
        ["displayFormat", "formatting", "format", "fieldFormat"],
      ),
      dataCategory: valueFrom([field], ["dataCategory", "category"]),
      display: displayFor(field),
      notes: definitionFor([field], fieldTitle, true),
    });
  };
  auditFields.filter(requirementsIsCustomField).forEach(addCustom);
  outputColumns.forEach((item, normalized) => {
    const exists = [...records.values()].some(
      (row) =>
        row.custom &&
        requirementsFieldIdentityPart(row.fieldTitle) === normalized,
    );
    if (!exists) addCustom({ name: item.name, type: "Custom" }, item.order);
  });
  return [...records.values()]
    .sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? -1 : 1;
      if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
      if (a.firstOrder !== b.firstOrder) return a.firstOrder - b.firstOrder;
      return a.fieldTitle.localeCompare(b.fieldTitle, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    })
    .map((row, index) => ({
      rowNumber: index + 1,
      uniqueId: row.uniqueId || "",
      fieldTitle: row.fieldTitle || "",
      vanityLabel: row.vanityLabel || "",
      displayFormat: row.displayFormat || "",
      dataCategory: row.dataCategory || "",
      display: row.display || "No",
      notes: includeNotes ? row.notes || "" : "",
    }));
}

/** Renders the canonical Requirements Preview Fields table. */
function renderRequirementsFieldsPreview() {
  const target = $("requirementsFieldsPreview");
  if (!target) return;
  const rows = requirementsFieldRows();
  const pill = (value, row, kind) => {
    const color = row.sourceColor || "#7da2d8";
    const classes = [
      "requirements-field-pill",
      `${kind}-pill`,
      row.calculated ? "calculated-field-pill" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const badge =
      row.calculated && kind !== "source"
        ? '<span class="requirements-field-pill-badge">Calculated</span>'
        : "";
    return `<span class="${classes}" style="--requirements-field-color:${esc(color)};--source-color:${esc(color)};--source-pill-color:${esc(color)}">${esc(value)}${badge}</span>`;
  };
  target.innerHTML = `<div class="logic-table-wrap requirements-fields-table-wrap" tabindex="0" aria-label="Fields table"><table class="logic-preview-table requirements-fields-table"><thead><tr><th scope="col" aria-label="Row number"></th><th scope="col">Unique ID</th><th scope="col">Field Title</th><th scope="col">Vanity Label</th><th scope="col">Display Format</th><th scope="col">Data Category</th><th scope="col">Display</th><th scope="col">Notes</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr${row.key ? ` data-display-field-row="${esc(row.key)}"` : ""}><td>${row.rowNumber}</td><td>${pill(row.uniqueId || "Calculated Field", row, "source")}</td><td>${pill(row.fieldTitle, row, "field")}</td><td>${esc(row.vanityLabel)}</td><td>${esc(row.displayFormat)}</td><td>${esc(row.dataCategory)}</td><td>${esc(row.display)}</td><td>${esc(row.notes).replace(/\n/g, "<br>")}</td></tr>`).join("") : `<tr><td colspan="8" class="hint">No referenced or custom fields are available for this audit.</td></tr>`}</tbody></table></div>`;
}

/**
 * Returns true when the Requirements Preview should render complete statements.
 */
function isCompleteStatementsPreviewMode() {
  return (
    !!e.completeStatements?.checked || state.previewStatementMode === "complete"
  );
}

/**
 * Resolves a step type without mutating the stored step.
 * @param {any} step - Logic step object being read for display.
 */
function completeStatementStepType(step) {
  if (!step) return "";
  if (step.step_type) return step.step_type;
  if (step.type === "if" || step.type === "compare") return "if_then";
  if (step.type === "source") return "reference_source";
  if (step.type === "create") return "create_column";
  return step.type || "";
}

/**
 * Returns whether an IF step has its own action instead of acting only as a parent gate.
 * @param {any} step - Logic step object being read for display.
 */
function completeStatementHasIndependentAction(step) {
  const params = step?.params || {};
  const actionType = params.then_action_type || "freeform";
  if (actionType === "display_text")
    return !!(params.then_text || params.then_action);
  if (actionType === "set_column_value")
    return !!(
      params.then_target_column ||
      params.then_value_field ||
      params.then_action
    );
  if (actionType === "do_not_display") return true;
  return !!(params.then_action || step?.action);
}

/**
 * Removes the leading IF-style keyword from a condition group.
 * @param {string} text - Condition group text.
 */
function completeStatementStripIf(text) {
  return String(text || "")
    .trim()
    .replace(/^(IF|ELSE IF)\s+/i, "")
    .trim();
}

/**
 * Wraps OR condition groups before they are AND-ed with inherited context.
 * @param {string} text - Condition fragment.
 */
function completeStatementContextFragment(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (/\bOR\b/i.test(value) && !/^\(.+\)$/.test(value)) return `(${value})`;
  return value;
}

/**
 * Gets only the condition portion of an IF step for inherited preview context.
 * @param {any} step - Logic step object being read for display.
 * @param {boolean} grouped - Whether the condition will be combined with another condition.
 */
function completeStatementConditionContext(step, grouped = true) {
  if (completeStatementStepType(step) !== "if_then") return "";
  const conditionText =
    typeof conditionGroupPlain === "function" ? conditionGroupPlain(step) : "";
  const plain = completeStatementStripIf(conditionText);
  return grouped ? completeStatementContextFragment(plain) : plain;
}

/**
 * Combines parent context notes with the child note without overwriting either value.
 * @param {string[]} contextNotes - Notes from hidden parent gate rows.
 * @param {string} ownNote - Note for the displayed row.
 */
function completeStatementNotes(contextNotes = [], ownNote = "") {
  return [
    ...contextNotes
      .filter(Boolean)
      .map((note) => `Parent context note: ${note}`),
    ownNote,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Applies inherited IF context to an IF step's analyst statement while preserving the THEN/action text.
 * @param {any} step - Logic step object being read for display.
 * @param {string[]} inheritedContext - Parent IF condition fragments.
 */
function completeStatementAnalystLogic(step, inheritedContext = []) {
  const base = analystLogic(step);
  if (!inheritedContext.length || completeStatementStepType(step) !== "if_then")
    return base;
  const childCondition = completeStatementConditionContext(step, true);
  if (!childCondition) return base;
  const combinedCondition = `IF ${[...inheritedContext, childCondition].filter(Boolean).join(" AND ")}`;
  const currentCondition =
    typeof conditionGroupPlain === "function"
      ? typeof ensureIfThenPrefix === "function"
        ? ensureIfThenPrefix(conditionGroupPlain(step))
        : conditionGroupPlain(step)
      : "";
  if (currentCondition && base.startsWith(currentCondition)) {
    return `${combinedCondition}${base.slice(currentCondition.length)}`.trim();
  }
  const thenIndex = base.search(/\s+THEN\s+/i);
  if (/^IF\b/i.test(base) && thenIndex > 0) {
    return `${combinedCondition}${base.slice(thenIndex)}`.trim();
  }
  return base;
}

/**
 * Builds display-only flattened rows for the Requirements Preview complete statement mode.
 */
function completeStatementPreviewRows() {
  syncAutoReferenceSteps?.();
  const entries = hierarchicalStepEntries({ includeDisabled: false });
  const hasDisplayedChild = new Set(
    entries.map((entry) => entry.step.parentId).filter(Boolean),
  );
  const contextByStepId = new Map();
  const hiddenNotesByStepId = new Map();
  const rows = [];

  entries.forEach((entry) => {
    const step = entry.step;
    const parentContext = contextByStepId.get(step.parentId) || [];
    const parentHiddenNotes = hiddenNotesByStepId.get(step.parentId) || [];
    const stepType = completeStatementStepType(step);
    const isConditional = stepType === "if_then";
    const hasChildren = hasDisplayedChild.has(step.id);
    const isGateOnly =
      isConditional &&
      hasChildren &&
      !completeStatementHasIndependentAction(step);
    const ownCondition = isConditional
      ? completeStatementConditionContext(step, true)
      : "";
    const nextContext = ownCondition
      ? [...parentContext, ownCondition]
      : parentContext;
    const ownNote = noteText(step, rows.length);
    const nextHiddenNotes =
      isGateOnly && ownNote
        ? [...parentHiddenNotes, ownNote]
        : parentHiddenNotes;

    contextByStepId.set(step.id, nextContext);
    hiddenNotesByStepId.set(step.id, nextHiddenNotes);

    if (isGateOnly) return;

    rows.push({
      step: `${rows.length + 1}`,
      stepId: step.id,
      branch: "Root",
      analyst: isConditional
        ? completeStatementAnalystLogic(step, parentContext)
        : analystLogic(step),
      developer: developerLogic(step),
      notes: completeStatementNotes(parentHiddenNotes, ownNote),
      level: 0,
      source: step.source || step.params?.source_file || "",
    });
  });

  return rows;
}

// -----------------------------------------------------------------------------
// Lightweight render scheduling and performance marks
// -----------------------------------------------------------------------------
let atlasPendingRenderFlags = null;
let atlasRenderFrameId = 0;
let atlasPerfSequence = 0;
let atlasPreviewDirty = false;

// Page-scoped rendering state. Pages stay dirty until they are first displayed.
const atlasPageRenderState = {
  dirty: new Set([
    "my-audits",
    "overview",
    "fields",
    "steps",
    "display-fields",
    "preview",
    "review",
    "save",
  ]),
  initialized: new Set(),
};

function atlasActivePage() {
  return document.querySelector(".page.active")?.dataset.page || "my-audits";
}

function atlasInvalidatePages(pages = []) {
  pages.forEach((page) =>
    atlasPageRenderState.dirty.add(pageForSection?.(page) || page),
  );
}

function atlasMarkAllPagesDirty() {
  atlasInvalidatePages([
    "my-audits",
    "overview",
    "fields",
    "steps",
    "preview",
    "review",
    "save",
  ]);
}

function atlasRenderPage(page, options = {}) {
  const target = pageForSection?.(page) || page || "my-audits";
  if (
    !options.force &&
    atlasPageRenderState.initialized.has(target) &&
    !atlasPageRenderState.dirty.has(target)
  )
    return;
  atlasMeasure(`atlas.page.${target}`, () => {
    if (target === "my-audits") {
      renderMyAudits?.();
      renderAuditLibrarySelect?.();
      renderRepoLibraryStatus?.();
    } else if (target === "overview") {
      renderHeader?.();
      renderAssignmentEditor?.();
      updateDashboardMetrics?.();
    } else if (target === "fields") {
      renderSources?.();
      renderFields?.();
      renderSourceFieldBrowser?.();
      renderFieldPickerPanel?.();
    } else if (target === "steps") {
      normalizeHierarchyFields?.();
      renderSteps?.();
      renderSelectedStep?.();
      atlasEnsureFieldPickerOptions?.();
      applyFieldPickerAttributes?.();
    } else if (target === "preview") {
      atlasPreviewDirty = false;
      renderPreview?.();
      renderLogicTablePreviewRows?.();
    } else if (target === "review") {
      renderValidationPanel?.();
    } else if (target === "save") {
      renderFlowSelect?.();
    }
  });
  atlasPageRenderState.dirty.delete(target);
  atlasPageRenderState.initialized.add(target);
}

function atlasRenderActivePage(options = {}) {
  atlasRenderPage(atlasActivePage(), options);
}

/**
 * Returns true when the Requirements Preview page is currently visible.
 */
function atlasIsPreviewVisible() {
  return !!document.querySelector(
    '#page-preview.active, [data-page="preview"].active',
  );
}

/**
 * Renders Requirements Preview only when visible, otherwise marks it dirty.
 */
function atlasRenderPreviewWhenUseful() {
  if (atlasIsPreviewVisible()) {
    atlasPreviewDirty = false;
    renderPreview?.();
  } else {
    atlasPreviewDirty = true;
  }
}

/** Explicit invalidation contract for source mutations. */
function atlasInvalidateSourceMutation(options = {}) {
  atlasInvalidatePages(["fields", "steps", "preview", "review", "save"]);
  atlasRequestRender({
    sources: true,
    fields: true,
    preview: true,
    validation: true,
    immediate: options.immediate === true,
  });
}

/** Explicit invalidation contract for logic-step mutations. */
function atlasInvalidateStepMutation(options = {}) {
  atlasInvalidatePages(["steps", "preview", "review", "save"]);
  atlasRequestRender({
    steps: options.selectedOnly !== true,
    selectedStep: options.selectedOnly === true,
    logicTable: true,
    preview: true,
    validation: true,
    immediate: options.immediate === true,
  });
}

/**
 * Runs a function with optional Performance API marks/measures.
 * @param {string} name - Friendly operation name for the performance timeline.
 * @param {Function} fn - Function to execute.
 */
function atlasPerformanceDiagnosticsEnabled() {
  return localStorage.getItem("atlasAlignPerfDiagnostics") === "true";
}
function atlasRecordPerformanceDiagnostic(name, duration) {
  if (!atlasPerformanceDiagnosticsEnabled()) return;
  const records =
    state.atlasPerformanceDiagnostics ||
    (state.atlasPerformanceDiagnostics = []);
  records.push({ name, duration, activePage: atlasActivePage?.() || "" });
  if (records.length > 250) records.splice(0, records.length - 250);
}
function atlasMeasure(name, fn) {
  if (typeof fn !== "function") return undefined;
  const canMeasure =
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function";
  if (!canMeasure) return fn();
  const id = `${name}-${Date.now()}-${(atlasPerfSequence += 1)}`;
  const start = `${id}-start`;
  const end = `${id}-end`;
  performance.mark(start);
  const finish = () => {
    performance.mark(end);
    const entry = performance.measure(name, start, end);
    atlasRecordPerformanceDiagnostic(name, entry.duration);
    performance.clearMarks(start);
    performance.clearMarks(end);
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(finish);
    }
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

/**
 * Wraps a mutable render function once so later calls appear in browser performance tooling.
 * @param {string} name - Friendly operation name.
 * @param {Function} fn - Function to wrap.
 */
function atlasWrapWithPerf(name, fn) {
  if (typeof fn !== "function" || fn.__atlasPerfWrapped) return fn;
  const wrapped = function atlasPerformanceWrappedFunction(...args) {
    return atlasMeasure(name, () => fn.apply(this, args));
  };
  wrapped.__atlasPerfWrapped = true;
  wrapped.__atlasOriginal = fn;
  return wrapped;
}

/**
 * Flushes a batched render request using the smallest requested UI surface.
 */
function atlasFlushRequestedRender() {
  if (!atlasPendingRenderFlags) return;
  const flags = atlasPendingRenderFlags;
  atlasPendingRenderFlags = null;
  atlasRenderFrameId = 0;
  if (flags.all) {
    atlasMarkAllPagesDirty();
    atlasRenderActivePage({ force: true });
    return;
  }
  if (flags.header) renderHeader?.();
  if (flags.sources) renderSources?.();
  if (flags.fields) renderFields?.();
  if (flags.steps) {
    renderSteps?.({
      includeSelectedStep: !flags.selectedStep,
      includeLogicTable: !flags.logicTable,
    });
  } else if (flags.selectedStep) renderSelectedStep?.();
  if (flags.preview) {
    atlasInvalidatePages(["preview"]);
    atlasRenderPreviewWhenUseful();
  }
  if (flags.logicTable) {
    atlasInvalidatePages(["preview"]);
    if (atlasIsPreviewVisible()) renderLogicTablePreviewRows?.();
  }
  if (flags.validation) renderValidationPanel?.();
  if (flags.flowSelect) renderFlowSelect?.();
}

/**
 * Batches targeted render work into the next animation frame.
 * @param {Object} flags - Dirty render areas: all, steps, selectedStep, preview, logicTable, validation, etc.
 */
function atlasMergeRenderFlags(pending = null, requested = {}) {
  const merged = { ...(pending || {}) };
  Object.entries(requested || {}).forEach(([key, value]) => {
    if (key === "immediate") {
      merged.immediate = !!merged.immediate || !!value;
      return;
    }
    if (typeof value === "boolean") {
      merged[key] = !!merged[key] || value;
      return;
    }
    if (value !== undefined) merged[key] = value;
  });
  if (merged.all) merged.all = true;
  if (merged.steps) merged.selectedStep = false;
  return merged;
}

function atlasRequestRender(flags = {}) {
  atlasPendingRenderFlags = atlasMergeRenderFlags(
    atlasPendingRenderFlags,
    flags,
  );
  if (
    flags.all ||
    flags.steps ||
    flags.sources ||
    flags.fields ||
    flags.validation
  ) {
    if (typeof atlasMarkLogicIssuesDirty === "function") {
      atlasMarkLogicIssuesDirty();
    }
  }

  if (
    (flags.all || flags.steps) &&
    typeof atlasInvalidateStepRenderCache === "function"
  ) {
    atlasInvalidateStepRenderCache();
  }

  if (
    (flags.all || flags.sources || flags.fields) &&
    typeof atlasInvalidateSourceBrowserCaches === "function"
  ) {
    atlasInvalidateSourceBrowserCaches();
  }
  if (flags.all) atlasPendingRenderFlags.all = true;
  if (flags.steps) atlasPendingRenderFlags.selectedStep = false;
  if (flags.immediate) {
    atlasFlushRequestedRender();
    return;
  }
  if (atlasRenderFrameId) return;
  const schedule =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
  atlasRenderFrameId = schedule(atlasFlushRequestedRender);
}

/**
 * Requests the focused render surfaces needed after a logic-step structural change.
 */
function atlasRequestStructuralStepRender() {
  if (typeof atlasRequestRender === "function") {
    atlasRequestRender({
      steps: true,
      selectedStep: true,
      logicTable: true,
      preview: true,
      validation: true,
    });
    return;
  }
  renderAll?.();
}

// -----------------------------------------------------------------------------
// Source-field math calculation helpers
// -----------------------------------------------------------------------------
const ATLAS_SOURCE_MATH_OPERATORS = ["+", "-", "*", "/"];

/**
 * Parses Create Column source-field math operations from params or a JSON string.
 * @param {any} params - Step params object or raw JSON string.
 */
function parseSourceMathOperations(params = {}) {
  const raw = Array.isArray(params)
    ? params
    : typeof params === "string"
      ? params
      : params.source_math_json ||
        params.compareMathJson ||
        params.compare_math_json ||
        params.compareMath ||
        params.math_json;
  if (!raw) return [];
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const operandType =
          String(item?.operandType || item?.operand_type || "number").trim() ===
          "field"
            ? "field"
            : "number";
        const operator = String(item?.operator || "").trim();
        const operand = String(item?.operand ?? "").trim();
        const operandSourceFile = String(
          item?.operandSourceFile || item?.operand_source_file || "",
        ).trim();
        const operandFieldName = String(
          item?.operandFieldName || item?.operand_field_name || "",
        ).trim();
        const operandSourceAlias = String(
          item?.operandSourceAlias ||
            item?.operand_source_alias ||
            sourceAliasFor?.(operandSourceFile) ||
            operandSourceFile ||
            "",
        ).trim();
        return {
          id:
            item?.id ||
            uid?.("math") ||
            `math_${Math.random().toString(36).slice(2)}`,
          operator,
          operandType,
          operand,
          operandSourceFile,
          operandSourceAlias,
          operandFieldName,
        };
      })
      .filter(
        (item) =>
          ATLAS_SOURCE_MATH_OPERATORS.includes(item.operator) &&
          (item.operandType === "field"
            ? item.operandFieldName
            : item.operand) &&
          !(
            item.operator === "/" &&
            item.operandType !== "field" &&
            Number(item.operand) === 0
          ),
      );
  } catch (_err) {
    return [];
  }
}

function atlasIsZeroMathOperand(operation = {}) {
  if ((operation.operandType || "number") === "field") return false;
  const value = String(operation.operand ?? "").trim();
  return value !== "" && Number(value) === 0;
}

/**
 * Converts a decimal-place value into a safe non-negative integer string.
 * @param {any} value - Raw decimal-place value.
 * @param {string} fallback - Fallback when value is blank or invalid.
 */
function atlasDecimalPlacesValue(value, fallback = "0") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const numeric = Number.parseInt(raw, 10);
  return Number.isFinite(numeric) && numeric >= 0 ? String(numeric) : fallback;
}

// -----------------------------------------------------------------------------
// Base render pipeline
// -----------------------------------------------------------------------------
/**
 * Central render coordinator for the current audit UI.
 */
function renderAll() {
  // Compatibility entry point for legacy callers. Hidden pages are no longer rendered.
  syncAutoReferenceSteps?.();
  atlasMarkAllPagesDirty();
  atlasRenderActivePage({ force: true });
}

/**
 * Renders audit name and purpose into header controls.
 */
function renderHeader() {
  const audit = atlasDisplayDocument?.() || state.audit;
  e.auditName.value = audit.name || "";
  e.auditPurpose.value = audit.purpose || "";
  if (e.auditStatus) {
    e.auditStatus.value = audit.status || "Draft";
    atlasSyncChoiceSelection?.(e.auditStatus);
  }
}

/**
 * Builds source color palette controls.
 * @param {any} source - Source file record.
 */
function renderColorPalette(source) {
  const current = source.color || SOURCE_COLOR_PALETTE[0];
  return `<div class="color-panel-inline" data-source-id="${esc(source.id)}">
    <div class="color-swatch-row">
      ${SOURCE_COLOR_PALETTE.map((color) => `<button type="button" class="color-swatch ${current === color ? "active" : ""}" title="${esc(color)}" aria-label="Select ${esc(color)}" data-source-palette-color="${esc(color)}" style="background:${esc(color)}"></button>`).join("")}
      <label class="custom-color-label">Custom <input type="color" data-source-custom-color value="${esc(current)}"></label>
    </div>
  </div>`;
}

/**
 * Renders selected audit source files.
 */
function renderSources() {
  const audit = atlasDisplayDocument?.() || state.audit;
  const sources = audit.sources || [];
  if (!sources.length) {
    e.sourcesList.innerHTML =
      '<p class="hint">No source files selected yet. Search the Source Library above and choose Use Source in Audit.</p>';
    return;
  }
  e.sourcesList.innerHTML = sources
    .map((source) => {
      const fieldCount = fieldsForSource(source.name).length;
      const color = source.color || SOURCE_COLOR_PALETTE[0];
      return `<div class="card selected-source-card" data-id="${esc(source.id)}" style="--source-color:${esc(color)}">
      <div class="selected-source-header"><strong>${esc(source.name)}</strong><span class="badge">${esc(source.alias || sourceAliasFor?.(source.name) || source.name)}</span><span class="badge">${fieldCount} fields</span></div>
      ${renderColorPalette(source)}
      <button type="button" class="danger small" data-remove-selected-source="${esc(source.name)}">Remove Source From Audit</button>
    </div>`;
    })
    .join("");
}

/**
 * Renders selected field summaries.
 */
function renderFields() {
  const audit = atlasDisplayDocument?.() || state.audit;
  const sources = audit.sources || [];
  if (!sources.length) {
    e.fieldsList.innerHTML =
      '<p class="hint">Selected source fields will appear here after you add source files to the audit.</p>';
    return;
  }
  e.fieldsList.innerHTML = sources
    .map((source) => {
      const fields = fieldsForSource(source.name);
      return `<details class="selected-source-fields" open>
      <summary>${esc(source.name)} <span class="badge">${fields.length} fields</span></summary>
      <div class="selected-field-list">${fields
        .slice(0, 120)
        .map((field) => {
          const raw = field.fieldName || field.name || field.label || "";
          const label = field.vanityLabel || field.label || raw;
          return `<div class="selected-field-row"><strong>${esc(label)}</strong><span>${esc(raw)}</span></div>`;
        })
        .join("")}</div>
      ${fields.length > 120 ? `<p class="hint">Showing 120 of ${fields.length} fields. Use source search to find a specific field.</p>` : ""}
    </details>`;
    })
    .join("");
}

// -----------------------------------------------------------------------------
// Base logic text rendering
// -----------------------------------------------------------------------------
/**
 * Finds a source color for quoted logic text.
 * @param {any} text - Input used by sourceColorForText.
 */
function sourceColorForText(text) {
  const audit = atlasDisplayDocument?.() || state.audit;
  const source = (audit.sources || []).find((item) => {
    const alias = item.alias || sourceAliasFor?.(item.name) || "";
    return text === item.name || text === alias;
  });
  return source?.color || "";
}

/**
 * Renders one quoted logic token. Visual modules can replace this token renderer
 * without redefining the full renderLogicWithPills pipeline.
 * @param {string} value - Quoted token text without surrounding quotes.
 */
function renderDefaultLogicPillToken(value) {
  const color = sourceColorForText(value);
  const style = color ? ` style="--pill-bg:${esc(color)}"` : "";
  return `<span class="logic-pill"${style}>${esc(value)}</span>`;
}

let renderLogicPillToken = renderDefaultLogicPillToken;

/**
 * Renders analyst logic with visually styled field/source pills.
 * @param {any} text - Input used by renderLogicWithPills.
 */
function renderLogicWithPills(text) {
  const parts = String(text || "").split(/("[^"]+")/g);
  return parts
    .map((part) => {
      if (!part.startsWith('"') || !part.endsWith('"')) return esc(part);
      const value = part.slice(1, -1);
      return renderLogicPillToken(value);
    })
    .join("");
}

/**
 * Default selected-step empty-state markup.
 */
function renderNoSelectedStepContent() {
  return '<p class="hint">Select or create a step to edit details.</p>';
}

/**
 * Default selected-step detail markup. Visual modules can replace this content
 * renderer without redefining the full renderSelectedStep orchestration.
 * @param {any} step - Logic step object being read or modified.
 * @param {string} number - Display number from the hierarchy helper.
 */
function renderDefaultSelectedStepContent(step, number) {
  return `<strong>${esc(number)}</strong><p>${renderLogicWithPills(analystLogic(step))}</p><p class="hint">${esc(
    noteText(
      step,
      ((atlasDisplayDocument?.() || state.audit).steps || []).indexOf(step),
    ),
  )}</p>`;
}

let renderSelectedStepContent = renderDefaultSelectedStepContent;
let afterRenderSelectedStep = null;

/**
 * Renders the selected step editor/details pane.
 */
function renderSelectedStep() {
  const target = e.selectedStepDetails || $("selectedStepDetails");
  if (!target) return;
  const step = ((atlasDisplayDocument?.() || state.audit).steps || []).find(
    (item) => item.id === state.selectedStepId,
  );
  if (!step) {
    target.innerHTML = renderNoSelectedStepContent();
    setText?.("selectedRuleBadge", "No rule selected");
    return;
  }
  const number = stepNumberFor(step.id) || "?";
  setText?.("selectedRuleBadge", `Step ${number}`);
  target.innerHTML = renderSelectedStepContent(step, number);
  afterRenderSelectedStep?.(step, number, target);
}

/**
 * Renders the Requirements Preview table.
 */
function renderPreview() {
  renderRequirementsFieldsPreview();
  const rows = isCompleteStatementsPreviewMode()
    ? completeStatementPreviewRows()
    : previewRows();
  e.logicPreview.innerHTML = `
    <div class="logic-table-wrap">
      <table class="logic-preview-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>Analyst Logic</th>
            <th>Developer Logic</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr class="logic-row-depth-${row.level}"${row.stepId ? ` data-preview-step-id="${esc(row.stepId)}"` : ""}>
              <td>${esc(row.step)}</td>
              <td>${renderLogicWithPills(row.analyst)}</td>
              <td>${esc(row.developer)}</td>
              <td>${e.includeNotes?.checked ? renderLogicWithPills(row.notes) : ""}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

/**
 * Refreshes saved flow choices.
 */
function renderFlowSelect() {
  refreshSaved().catch(() => {});
}

// -----------------------------------------------------------------------------
// Join developer logic overrides
// -----------------------------------------------------------------------------
/* JOIN Developer Logic support */
function joinTypeDisplayName(joinType) {
  const normalized = String(joinType || "INNER JOIN").toUpperCase();
  if (normalized === "LEFT JOIN") return "LEFT JOIN";
  if (normalized === "RIGHT JOIN") return "RIGHT JOIN";
  if (normalized === "FULL OUTER JOIN") return "FULL OUTER JOIN";
  return "INNER JOIN";
}

/**
 * Generates developer-facing logic text for join steps.
 * @param {any} step - Logic step object being read or modified.
 */
const SOURCE_MATH_OPERATORS = ["+", "-", "*", "/"];

function parseDeveloperSourceMathOperations(params = {}) {
  return typeof parseSourceMathOperations === "function"
    ? parseSourceMathOperations(params)
    : [];
}

function excelStructuredReference(fieldName = "") {
  const safe = String(fieldName || "").replace(/]/g, "]]");
  return `[@[${safe}]]`;
}

function sqlBracketIdentifier(fieldName = "") {
  const safe = String(fieldName || "").replace(/]/g, "]]");
  return `[${safe}]`;
}

function sqlMathOperand(operation) {
  const operand = String(operation.operand || "").trim();
  if (operation.operator === "/" && /^-?\d+$/.test(operand))
    return `${operand}.0`;
  return operand;
}

function unwrapSingleExpression(expression = "") {
  const value = String(expression || "").trim();
  if (!value.startsWith("(") || !value.endsWith(")")) return value;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return value;
  }
  return value.slice(1, -1);
}

function buildSequentialMathExpression(
  baseExpression,
  operations,
  { sql = false } = {},
) {
  return operations.reduce((expression, operation) => {
    const operand =
      operation.operandExpression ||
      (sql ? sqlMathOperand(operation) : operation.operand);
    return `(${expression} ${operation.operator} ${operand})`;
  }, baseExpression);
}

function conditionCompareMathOperations(condition = {}) {
  return parseSourceMathOperations(
    condition.compareMathJson ||
      condition.compare_math_json ||
      condition.compareMath ||
      [],
  );
}

function mathOperandDeveloperExpression(operation = {}, { sql = false } = {}) {
  if ((operation.operandType || "number") === "field") {
    return sql
      ? sqlBracketIdentifier(operation.operandFieldName || "[field]")
      : excelStructuredReference(operation.operandFieldName || "[field]");
  }
  return sql
    ? sqlMathOperand(operation)
    : String(operation.operand || "").trim();
}

function conditionFieldDeveloperExpression(
  fieldName = "",
  { sql = false } = {},
) {
  return sql
    ? sqlBracketIdentifier(fieldName || "[field]")
    : excelStructuredReference(fieldName || "[field]");
}

function buildConditionCompareMathExpression(
  baseExpression,
  operations,
  options = {},
) {
  const mapped = (operations || []).map((operation) => ({
    ...operation,
    operandExpression: mathOperandDeveloperExpression(operation, options),
  }));
  return buildSequentialMathExpression(baseExpression, mapped, options);
}

function developerOperatorSymbol(operator = "") {
  const normalized = String(operator || "")
    .trim()
    .toLowerCase();
  const map = {
    "is equal to": "=",
    equals: "=",
    "=": "=",
    "is not equal to": "<>",
    "not equal to": "<>",
    "<>": "<>",
    "is greater than": ">",
    "greater than": ">",
    ">": ">",
    "is greater than or equal to": ">=",
    "greater than or equal to": ">=",
    ">=": ">=",
    "is less than": "<",
    "less than": "<",
    "<": "<",
    "is less than or equal to": "<=",
    "less than or equal to": "<=",
    "<=": "<=",
  };
  return map[normalized] || operator || "=";
}

function developerConditionRightExpression(condition = {}, options = {}) {
  if (condition.valueMode === "blank") return "NULL";
  if (condition.valueMode === "field") {
    const base = conditionFieldDeveloperExpression(
      condition.compareFieldName || "[compare field]",
      options,
    );
    return buildConditionCompareMathExpression(
      base,
      conditionCompareMathOperations(condition),
      options,
    );
  }
  if (condition.valueMode === "expression")
    return String(condition.expression || "").trim() || "[expression]";
  const values = String(condition.compareValue || condition.value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 1) return `"${values[0]}"`;
  if (values.length > 1)
    return `(${values.map((value) => `"${value}"`).join(", ")})`;
  return '""';
}

function developerConditionExpression(condition = {}, options = {}) {
  const left = conditionFieldDeveloperExpression(
    condition.fieldName || condition.field || "[field]",
    options,
  );
  const operator =
    condition.valueMode === "blank"
      ? String(condition.operator || "")
          .toLowerCase()
          .includes("not")
        ? "IS NOT"
        : "IS"
      : developerOperatorSymbol(condition.operator || "is equal to");
  return `${left} ${operator} ${developerConditionRightExpression(condition, options)}`;
}

function missingValueText(key, fallback) {
  if (typeof phrasePlaceholder === "function")
    return phrasePlaceholder(key, fallback);
  return fallback;
}

function developerPhrase(path, values = {}) {
  if (typeof renderCatalogPhrase !== "function")
    return `[Missing phrase path: ${path}]`;
  return renderCatalogPhrase(path, values);
}

function developerFormulaBlock(excelFormula, sqlFormula) {
  return `${developerPhrase("developer_logic.labels.excel")}
=${excelFormula}

${developerPhrase("developer_logic.labels.sql_server")}
${sqlFormula}`;
}

function ifThenDeveloperLogic(step) {
  if (
    step?.step_type !== "if_then" ||
    typeof parseStepConditions !== "function"
  )
    return "";
  const conditions = parseStepConditions(step);
  if (!conditions.length) return "";
  const conditionJoin = (condition, index, options) =>
    `${index === 0 ? "IF" : condition.connector || "AND"} ${developerConditionExpression(condition, options)}`;
  const excelLogic = conditions
    .map((condition, index) => conditionJoin(condition, index, { sql: false }))
    .join(" ");
  const sqlLogic = conditions
    .map((condition, index) => conditionJoin(condition, index, { sql: true }))
    .join(" ");
  return developerFormulaBlock(excelLogic, sqlLogic);
}

function sourceFieldRoundingMode(params = {}) {
  return params.rounding_mode || params.rounding_method || "none";
}

function sourceFieldDecimalPlaces(params = {}) {
  return Number.parseInt(
    atlasDecimalPlacesValue(params.rounding_decimal_places, "0"),
    10,
  );
}

function applyExcelRounding(expression, roundingMode, decimalPlaces) {
  const base = unwrapSingleExpression(expression);
  if (roundingMode === "nearest") return `ROUND(${base}, ${decimalPlaces})`;
  if (roundingMode === "up") return `ROUNDUP(${base}, ${decimalPlaces})`;
  if (roundingMode === "down") return `ROUNDDOWN(${base}, ${decimalPlaces})`;
  return expression;
}

function applySqlServerRounding(expression, roundingMode, decimalPlaces) {
  const base = unwrapSingleExpression(expression);
  if (roundingMode === "nearest") return `ROUND(${base}, ${decimalPlaces})`;
  if (roundingMode === "down") {
    if (decimalPlaces === 0) return `FLOOR(${base})`;
    return `FLOOR((${base}) * POWER(10.0, ${decimalPlaces})) / POWER(10.0, ${decimalPlaces})`;
  }
  if (roundingMode === "up") {
    if (decimalPlaces === 0) return `CEILING(${base})`;
    return `CEILING((${base}) * POWER(10.0, ${decimalPlaces})) / POWER(10.0, ${decimalPlaces})`;
  }
  return expression;
}

function createColumnSourceFieldDeveloperLogic(step, params = {}) {
  if (
    step?.step_type !== "create_column" ||
    params.value_mode !== "Source field value"
  )
    return "";
  const operations = parseDeveloperSourceMathOperations(params);
  const roundingMode = sourceFieldRoundingMode(params);
  if (!operations.length && roundingMode === "none") return "";
  const sourceField = params.field_name || step.field || "[source field]";
  const decimals = sourceFieldDecimalPlaces(params);
  const excelExpression = buildSequentialMathExpression(
    excelStructuredReference(sourceField),
    operations,
  );
  const sqlExpression = buildSequentialMathExpression(
    sqlBracketIdentifier(sourceField),
    operations,
    { sql: true },
  );
  const excelFormula = applyExcelRounding(
    excelExpression,
    roundingMode,
    decimals,
  );
  const sqlFormula = applySqlServerRounding(
    sqlExpression,
    roundingMode,
    decimals,
  );
  return developerFormulaBlock(excelFormula, sqlFormula);
}

function developerLogic(step) {
  normalizeCatalogStep?.(step);
  const params = step?.params || {};
  if (params.inverse_else === "Yes" && params.inverse_of_step_id) {
    const originalStepNumber =
      stepNumberFor?.(params.inverse_of_step_id) || "?";
    return developerPhrase("developer_logic.else_step", {
      step_number: originalStepNumber,
    });
  }
  const createColumnLogic = createColumnSourceFieldDeveloperLogic(step, params);
  if (createColumnLogic) return createColumnLogic;
  const ifThenLogic = ifThenDeveloperLogic(step);
  if (ifThenLogic) return ifThenLogic;
  if (step?.step_type !== "join") return "";
  const joinType = joinTypeDisplayName(params.join_type);
  const leftSource =
    params.left_source || missingValueText("left_source", "[left source]");
  const rightSource =
    params.right_source || missingValueText("right_source", "[right source]");
  const leftAlias =
    params.left_alias || sourceAliasFor?.(leftSource) || leftSource;
  const rightAlias =
    params.right_alias || sourceAliasFor?.(rightSource) || rightSource;
  const leftField =
    params.left_field || missingValueText("left_key", "[left key]");
  const rightField =
    params.right_field || missingValueText("right_key", "[right key]");
  return developerPhrase("developer_logic.join", {
    join_type: joinType,
    kept_rows: joinKeptRowsDescription(joinType),
    left_alias: leftAlias,
    left_field: leftField,
    right_alias: rightAlias,
    right_field: rightField,
  });
}

/**
 * Explains which rows are retained for a join type.
 * @param {any} joinType - Input used by joinKeptRowsDescription.
 */
function joinKeptRowsDescription(joinType) {
  const normalized = joinTypeDisplayName(joinType);
  if (normalized === "LEFT JOIN")
    return developerPhrase("developer_logic.kept_rows.left");
  if (normalized === "RIGHT JOIN")
    return developerPhrase("developer_logic.kept_rows.right");
  if (normalized === "FULL OUTER JOIN")
    return developerPhrase("developer_logic.kept_rows.full");
  return developerPhrase("developer_logic.kept_rows.inner");
}

// ATLAS-MATH-OPERATIONS-UPDATE:BEGIN
// Canonical math model and shared helpers. Kept in the existing rendering module
// so later classic-script overrides can reuse one parser and serializer.
function atlasRawMathValue(value = {}) {
  if (Array.isArray(value) || typeof value === "string") return value;
  return (
    value.source_math_json ||
    value.then_math_json ||
    value.compareMathJson ||
    value.compare_math_json ||
    value.compareMath ||
    value.math_json ||
    []
  );
}

function atlasParseRawMathOperations(value = {}) {
  const raw = atlasRawMathValue(value);
  if (Array.isArray(raw)) return raw;
  if (!String(raw || "").trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed))
    throw new Error("Math operations must be a JSON array.");
  return parsed;
}

function atlasNormalizeMathOperation(
  item = {},
  { preserveInvalid = true } = {},
) {
  const rawOperator = String(item.operator || "").trim();
  const operator = rawOperator === "_" ? "*" : rawOperator;
  const operandType =
    String(item.operandType || item.operand_type || "number").trim() === "field"
      ? "field"
      : "number";
  const operandSourceFile = String(
    item.operandSourceFile || item.operand_source_file || "",
  ).trim();
  const normalized = {
    id: item.id || uid("math"),
    operator,
    operandType,
    operand: String(item.operand ?? "").trim(),
    operandSourceFile,
    operandSourceAlias: String(
      item.operandSourceAlias ||
        item.operand_source_alias ||
        sourceAliasFor?.(operandSourceFile) ||
        operandSourceFile ||
        "",
    ).trim(),
    operandFieldName: String(
      item.operandFieldName || item.operand_field_name || "",
    ).trim(),
  };
  if (preserveInvalid) return normalized;
  if (!ATLAS_SOURCE_MATH_OPERATORS.includes(normalized.operator)) return null;
  if (
    operandType === "field" ? !normalized.operandFieldName : !normalized.operand
  )
    return null;
  if (
    normalized.operator === "/" &&
    operandType === "number" &&
    Number(normalized.operand) === 0
  )
    return null;
  return normalized;
}

function atlasSerializeMathOperations(operations = []) {
  return JSON.stringify(
    (operations || []).map((item) => atlasNormalizeMathOperation(item)),
  );
}

parseSourceMathOperations = function parseSourceMathOperationsCanonical(
  value = {},
) {
  try {
    return atlasParseRawMathOperations(value)
      .map((item) =>
        atlasNormalizeMathOperation(item, { preserveInvalid: false }),
      )
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
};

function atlasMathOperationsFromContainer(
  container,
  selector = "[data-math-row]",
) {
  if (!container) return [];
  return [...container.querySelectorAll(selector)].map((row) =>
    atlasNormalizeMathOperation({
      id: row.dataset.mathId || uid("math"),
      operator: row.querySelector("[data-math-operator]")?.value || "*",
      operandType:
        row.querySelector("[data-math-operand-type]")?.value || "number",
      operand: row.querySelector("[data-math-operand]")?.value || "",
      operandSourceFile: row.querySelector("[data-math-source]")?.value || "",
      operandFieldName: row.querySelector("[data-math-field]")?.value || "",
    }),
  );
}

function atlasFindFieldRecord(sourceFile = "", fieldName = "") {
  const match = (
    typeof fieldsForSource === "function" ? fieldsForSource(sourceFile) : []
  ).find((field) =>
    [
      field.fieldName,
      field.rawFieldName,
      field.name,
      field.vanityLabel,
      field.label,
    ]
      .filter(Boolean)
      .map(String)
      .includes(String(fieldName)),
  );
  return match || null;
}

function atlasLooksLikeIdentifierField(field = {}) {
  const text = [
    field.fieldName,
    field.rawFieldName,
    field.name,
    field.vanityLabel,
    field.businessDescription,
    field.dataCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(^|\b)(id|identifier|pernr|personnel number|employee number|position number|code|key)(\b|$)/.test(
    text,
  );
}

function atlasIsNumericField(field = {}) {
  if (!field || atlasLooksLikeIdentifierField(field)) return false;
  const typeText = [
    field.fieldType,
    field.type,
    field.dataType,
    field.data_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const formatText = [field.fieldFormat, field.format, field.displayFormat]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const categoryText = [field.dataCategory, field.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const numericToken =
    /(^|\b)(number|numeric|decimal|integer|float|double|currency|amount|salary|rate)(\b|$)/;
  const explicitCalculatedNumeric =
    !!(field.calculated || field.created || field.custom) &&
    numericToken.test(`${typeText} ${formatText} ${categoryText}`);
  return (
    explicitCalculatedNumeric ||
    numericToken.test(typeText) ||
    numericToken.test(formatText)
  );
}

function atlasMathOperandField(operation = {}) {
  if ((operation.operandType || "number") !== "field") return null;
  return atlasFindFieldRecord(
    operation.operandSourceFile,
    operation.operandFieldName,
  );
}

function atlasValidateMathOperations(value = {}, options = {}) {
  const issues = [];
  let operations;
  try {
    operations = atlasParseRawMathOperations(value);
  } catch (error) {
    return [{ level: "error", code: "malformed_json", message: error.message }];
  }
  operations.forEach((raw, index) => {
    const operation = atlasNormalizeMathOperation(raw);
    const position = index + 1;
    if (!ATLAS_SOURCE_MATH_OPERATORS.includes(operation.operator))
      issues.push({
        level: "error",
        code: "operator",
        message: `Operation ${position} has an unsupported operator.`,
      });
    if (operation.operandType === "number") {
      if (!operation.operand)
        issues.push({
          level: "error",
          code: "operand",
          message: `Operation ${position} is missing a numeric operand.`,
        });
      else if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(operation.operand))
        issues.push({
          level: "error",
          code: "number",
          message: `Operation ${position} has an invalid numeric value.`,
        });
      if (
        operation.operator === "/" &&
        operation.operand &&
        Number(operation.operand) === 0
      )
        issues.push({
          level: "error",
          code: "divide_zero",
          message: `Operation ${position} cannot divide by zero.`,
        });
    } else {
      if (!operation.operandSourceFile)
        issues.push({
          level: "error",
          code: "source",
          message: `Operation ${position} is missing an operand source.`,
        });
      if (!operation.operandFieldName)
        issues.push({
          level: "error",
          code: "field",
          message: `Operation ${position} is missing an operand field.`,
        });
      const field = atlasMathOperandField(operation);
      if (operation.operandFieldName && !field)
        issues.push({
          level: "error",
          code: "unresolved_field",
          message: `Operation ${position} uses an operand field that cannot be resolved.`,
        });
      else if (field && atlasLooksLikeIdentifierField(field))
        issues.push({
          level: "warn",
          code: "math_operand_identifier",
          message: `Operation ${position} uses identifier field "${operation.operandFieldName}" from "${operation.operandSourceAlias || operation.operandSourceFile}". Identifier values may be stored as numbers but generally should not be used in arithmetic.`,
        });
      else if (field && !atlasIsNumericField(field)) {
        const typeOrFormat = [
          field.fieldType,
          field.type,
          field.dataType,
          field.data_type,
          field.fieldFormat,
          field.format,
          field.displayFormat,
        ]
          .filter(Boolean)
          .join(" / ");
        issues.push({
          level: "warn",
          code: typeOrFormat
            ? "math_operand_non_numeric_metadata"
            : "math_operand_numeric_metadata_missing",
          message: typeOrFormat
            ? `Operation ${position} uses "${operation.operandFieldName}" from "${operation.operandSourceAlias || operation.operandSourceFile}", which is identified as "${typeOrFormat}". Verify that its values can be converted to numbers before applying this operation.`
            : `Operation ${position} uses "${operation.operandFieldName}" from "${operation.operandSourceAlias || operation.operandSourceFile}", but its field metadata does not confirm that it contains numeric values. Verify the field before implementation.`,
        });
      }
      if (operation.operator === "/" && operation.operandFieldName)
        issues.push({
          level: "warn",
          code: "field_divisor",
          message: `Operation ${position} uses a field divisor. Generated logic returns blank/NULL when the divisor is zero.`,
        });
    }
  });
  if (options.baseSourceFile && options.baseFieldName) {
    const field = atlasFindFieldRecord(
      options.baseSourceFile,
      options.baseFieldName,
    );
    if (!field || !atlasIsNumericField(field))
      issues.push({
        level: "error",
        code: "base_nonnumeric",
        message:
          "The calculation base field must be explicitly cataloged as numeric and not an identifier.",
      });
  }
  return issues;
}

function atlasBuildMathDeveloperExpression(
  baseExpression,
  operations = [],
  { sql = false } = {},
) {
  let expression = baseExpression;
  let hasDivision = false;
  operations.forEach((operation) => {
    let operand = mathOperandDeveloperExpression(operation, { sql });
    if (operation.operator === "/") {
      hasDivision = true;
      if (sql && operation.operandType === "field")
        operand = `NULLIF(${operand}, 0)`;
    }
    expression = `(${expression} ${operation.operator} ${operand})`;
  });
  if (!sql && hasDivision)
    return `IFERROR(${unwrapSingleExpression(expression)}, "")`;
  return expression;
}

createColumnSourceFieldDeveloperLogic =
  function createColumnSourceFieldDeveloperLogicMath(step, params = {}) {
    if (
      step?.step_type !== "create_column" ||
      params.value_mode !== "Source field value"
    )
      return "";
    const operations = parseSourceMathOperations(params.source_math_json || []);
    const roundingMode = sourceFieldRoundingMode(params);
    if (!operations.length && roundingMode === "none") return "";
    const sourceField = params.field_name || step.field || "[source field]";
    const decimals = sourceFieldDecimalPlaces(params);
    const excelExpression = atlasBuildMathDeveloperExpression(
      excelStructuredReference(sourceField),
      operations,
    );
    const sqlExpression = atlasBuildMathDeveloperExpression(
      sqlBracketIdentifier(sourceField),
      operations,
      { sql: true },
    );
    const excelFormula = applyExcelRounding(
      excelExpression,
      roundingMode,
      decimals,
    );
    const sqlFormula = applySqlServerRounding(
      sqlExpression,
      roundingMode,
      decimals,
    );
    return developerFormulaBlock(excelFormula, sqlFormula);
  };

function thenCalculationDeveloperLogic(step, params = {}) {
  if (
    step?.step_type !== "if_then" ||
    params.then_action_type !== "set_column_calculation"
  )
    return "";
  const operations = parseSourceMathOperations(params.then_math_json || []);
  const sourceField = params.then_value_field || "[source field]";
  const target = params.then_target_column || "[target column]";
  const decimals = Number.parseInt(
    atlasDecimalPlacesValue(params.then_rounding_decimal_places, "0"),
    10,
  );
  const rounding = params.then_rounding_mode || "none";
  const excelExpr = applyExcelRounding(
    atlasBuildMathDeveloperExpression(
      excelStructuredReference(sourceField),
      operations,
    ),
    rounding,
    decimals,
  );
  const sqlExpr = applySqlServerRounding(
    atlasBuildMathDeveloperExpression(
      sqlBracketIdentifier(sourceField),
      operations,
      { sql: true },
    ),
    rounding,
    decimals,
  );
  return developerFormulaBlock(
    `${excelStructuredReference(target)} = ${excelExpr}`,
    `${sqlBracketIdentifier(target)} = ${sqlExpr}`,
  );
}

const atlasDeveloperLogicBeforeMathUpdate = developerLogic;
developerLogic = function developerLogicWithThenMath(step) {
  normalizeCatalogStep?.(step);
  return (
    thenCalculationDeveloperLogic(step, step?.params || {}) ||
    atlasDeveloperLogicBeforeMathUpdate(step)
  );
};
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
function atlasStringTransformDeveloperExpression(config, { sql = false } = {}) {
  const field = sql
    ? sqlBracketIdentifier(config.sourceField || "[source field]")
    : excelStructuredReference(config.sourceField || "[source field]");
  if (config.operation === "character_count")
    return sql ? `LEN(${field})` : `LEN(${field})`;
  const count =
    atlasPositiveWholeNumber(config.count) ||
    missingValueText("positive_whole_number", "[positive whole number]");
  const fn = config.operation === "last_characters" ? "RIGHT" : "LEFT";
  return `${fn}(${field}, ${count})`;
}
function atlasStringTransformDeveloperLogic(step) {
  const p = step?.params || {};
  let config = null;
  if (
    step?.step_type === "create_column" &&
    p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE
  )
    config = atlasStringTransformConfig(p);
  if (
    step?.step_type === "if_then" &&
    p.then_action_type === "set_column_string_transform"
  )
    config = atlasStringTransformConfig(p, "then_");
  if (!config) return "";
  const target = config.destinationColumn || "[destination column]";
  const excel = atlasStringTransformDeveloperExpression(config);
  const sql = atlasStringTransformDeveloperExpression(config, { sql: true });
  return developerFormulaBlock(
    excel,
    `${sqlBracketIdentifier(target)} = ${sql}`,
  );
}
const atlasDeveloperLogicBeforeStringTransform = developerLogic;
developerLogic = function developerLogicWithStringTransform(step) {
  normalizeCatalogStep?.(step);
  return (
    atlasStringTransformDeveloperLogic(step) ||
    atlasDeveloperLogicBeforeStringTransform(step)
  );
};
const atlasCompleteStatementHasIndependentActionBeforeStringTransform =
  completeStatementHasIndependentAction;
completeStatementHasIndependentAction =
  function completeStatementHasIndependentStringAction(step) {
    if (step?.params?.then_action_type === "set_column_string_transform")
      return !!(
        step.params.then_target_column && step.params.then_string_source_field
      );
    return atlasCompleteStatementHasIndependentActionBeforeStringTransform(
      step,
    );
  };
// ATLAS-STRING-TRANSFORM-UPDATE:END
