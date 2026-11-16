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

/** Columns a Create Column step adds; a split can add several. */
function requirementsCreatedColumnNames(step) {
  if (typeof atlasCreatedColumnNames === "function")
    return atlasCreatedColumnNames(step);
  const name = String(step?.params?.column_name || step?.field || "").trim();
  return step?.step_type === "create_column" && name ? [name] : [];
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
  // The same fields and catalog sources are compared against every reference,
  // so each record's identity is resolved once per call. Nothing changes the
  // audit or catalog while the rows are built.
  const recordCandidates = new Map();
  const sameSource = (record, identity) => {
    if (identity?.ambiguous) return false;
    if (!recordCandidates.has(record)) {
      const other = requirementsSourceIdentity({
        sourceKey: record?.sourceKey,
        sourceFile: record?.sourceFile,
        sourceAlias: record?.sourceAlias,
        alias: record?.alias,
        name: record?.name,
      });
      recordCandidates.set(
        record,
        other?.ambiguous ? null : new Set(candidates(other)),
      );
    }
    const values = recordCandidates.get(record);
    if (!values) return false;
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
        requirementsCreatedColumnNames(step).some(
          (name) => requirementsFieldIdentityPart(name) === wanted,
        ),
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
  const referenceIdentities = new Map();
  requirementsLogicFieldReferences().forEach((reference) => {
    if (!reference.fieldName) return;
    if (!referenceIdentities.has(reference.sourceFile))
      referenceIdentities.set(
        reference.sourceFile,
        requirementsSourceIdentity(reference.sourceFile),
      );
    const identity = referenceIdentities.get(reference.sourceFile);
    const sourceId =
      identity.sourceKey ||
      identity.alias ||
      identity.sourceFile ||
      reference.sourceFile ||
      "";
    const key = `source:${requirementsFieldIdentityPart(sourceId)}:${requirementsFieldIdentityPart(reference.fieldName)}`;
    // Later references to a field already listed add nothing.
    if (records.has(key)) return;
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
      notes: includeNotes
        ? definitionFor(
            [auditField, catalogField],
            fieldTitle,
            !catalogHasField(identity, fieldTitle) &&
              Boolean(createdColumnStep(fieldTitle)),
          )
        : "",
    });
  });
  const outputColumns = new Map();
  hierarchicalStepEntries({ includeDisabled: false }).forEach(
    (entry, order) => {
      const step = entry.step;
      const params = step.params || {};
      const usesTargetColumn = ![
        "display_text",
        "display",
        "do_not_display",
      ].includes(params.then_action_type);
      [
        params.output_column,
        params.destination_column,
        params.then_output_column,
        usesTargetColumn ? params.then_target_column : "",
        params.created_field,
        ...(step.step_type === "create_column"
          ? requirementsCreatedColumnNames(step)
          : [params.column_name]),
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

/** Shows or hides the Notes columns without dropping note text from the rows. */
function syncPreviewNotesLayout() {
  document
    .getElementById("page-preview")
    ?.classList.toggle("is-notes-off", !e.includeNotes?.checked);
}

/** Renders the canonical Requirements Preview Fields table. */
function renderRequirementsFieldsPreview() {
  const target = $("requirementsFieldsPreview");
  if (!target) return;
  syncPreviewNotesLayout();
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
  if (!rows.length) {
    target.innerHTML = atlasPreviewEmptyState({
      title: "No display fields yet",
      body: "Fields appear here once a logic step uses them or you add them on Display Fields.",
      action: "Open Display Fields",
      section: "display-fields",
    });
    return;
  }
  target.innerHTML = `<div class="logic-table-wrap requirements-fields-table-wrap" tabindex="0" aria-label="Display Fields table"><table class="logic-preview-table requirements-fields-table"><thead><tr><th scope="col" class="preview-number-col">#</th><th scope="col">Unique ID</th><th scope="col">Field Title</th><th scope="col">Vanity Label</th><th scope="col">Display Format</th><th scope="col">Data Category</th><th class="preview-notes-col" scope="col">Notes</th></tr></thead><tbody>${rows.map((row) => `<tr${row.key ? ` data-display-field-row="${esc(row.key)}"` : ""}><td class="preview-number-col">${row.rowNumber}</td><td>${pill(row.uniqueId || "Calculated Field", row, "source")}</td><td>${pill(row.fieldTitle, row, "field")}</td><td>${esc(row.vanityLabel)}</td><td>${esc(row.displayFormat)}</td><td>${esc(row.dataCategory)}</td><td class="preview-notes-col">${esc(row.notes).replace(/\n/g, "<br>")}</td></tr>`).join("")}</tbody></table></div>`;
}

/**
 * Empty-state markup for a Requirements Preview table: what will appear, why
 * it is empty, and one way to fill it.
 */
function atlasPreviewEmptyState({ title, body, action, section }) {
  return `<div class="preview-empty-state" role="status"><strong>${esc(title)}</strong><p>${esc(body)}</p><button class="btn secondary small" type="button" data-preview-empty-section="${esc(section)}">${esc(action)}</button></div>`;
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
  // Display is the default "keep matching rows" action, so a parent IF that
  // only displays still acts as a gate for its children.
  if (actionType === "display") return false;
  return !!(params.then_action || step?.action);
}

/**
 * Turns one step's top-level condition list into nodes that can be AND-ed with
 * other conditions without changing its meaning. AND binds tighter than OR (as
 * in the Developer Logic), so "a AND b OR c" becomes one group: ANY OF (ALL OF
 * a, b), c.
 * @param {Array<any>} nodes - Condition nodes from parseStepConditions.
 */
function completeStatementConditionBlock(nodes) {
  const list = atlasCollapseSingleConditionGroups(
    atlasNormalizeConditionTree(nodes),
  );
  if (!list.length) return [];
  const chunks = [[]];
  list.forEach((node, index) => {
    if (index > 0 && atlasConditionConnectorOf(node.connector) === "OR")
      chunks.push([]);
    chunks[chunks.length - 1].push(node);
  });
  if (chunks.length === 1) return chunks[0];
  return [
    {
      id: uid("cond"),
      conditionType: "group",
      connector: "AND",
      groupConnector: "OR",
      items: chunks.map((chunk) =>
        chunk.length === 1
          ? chunk[0]
          : {
              id: uid("cond"),
              conditionType: "group",
              connector: "OR",
              groupConnector: "AND",
              items: chunk,
            },
      ),
    },
  ];
}

/**
 * AND-joins condition blocks into one normalized condition tree. Single
 * conditions come before bullet groups so the analyst text reads
 * "IF x AND: • a OR • b" rather than leaving an AND hanging off the last bullet.
 * @param {Array<Array<any>>} blocks - Blocks from completeStatementConditionBlock.
 */
function completeStatementJoinConditions(blocks) {
  const nodes = blocks.flat().map((node) => ({ ...node, connector: "AND" }));
  return atlasNormalizeConditionTree([
    ...nodes.filter((node) => !atlasIsConditionGroup(node)),
    ...nodes.filter((node) => atlasIsConditionGroup(node)),
  ]);
}

/**
 * The opposite of an IF step's conditions, written with opposite operators
 * ("is less than or equal to", "does not contain") rather than NOT.
 * @param {any} step - IF step to invert.
 */
function completeStatementInvertedBlock(step) {
  if (!step || completeStatementStepType(step) !== "if_then") return [];
  return completeStatementConditionBlock(invertedConditionsForStep(step));
}

/** Lowercases a phrase's first letter unless it starts an acronym. */
function completeStatementLowerFirst(text) {
  const value = String(text || "").trim();
  if (/^[A-Z][A-Z]/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Writes a step as one complete statement under the given conditions.
 * @param {any} step - Logic step object being read for display.
 * @param {Array<any>} conditions - Every condition the step runs under.
 */
function completeStatementLogic(step, conditions) {
  const stepType = completeStatementStepType(step);
  if (!conditions.length)
    return { analyst: analystLogic(step), developer: developerLogic(step) };
  if (stepType === "if_then" || stepType === "else") {
    // A display-only copy: the step's own action under the combined conditions.
    const params = {
      ...(step.params || {}),
      conditions_json: JSON.stringify(conditions),
    };
    delete params.inverse_else;
    delete params.inverse_of_step_id;
    // An attached ELSE has its own row here, so keep it out of the IF formula.
    params.include_else_branch = "No";
    const copy = { ...step, step_type: "if_then", type: "if", params };
    return { analyst: analystLogic(copy), developer: developerLogic(copy) };
  }
  const conditionText = ensureIfThenPrefix(
    conditionTreePlain(conditions, (condition) =>
      conditionToPlain(condition, false),
    ),
  );
  const action = completeStatementLowerFirst(
    String(analystLogic(step) || "").replace(/\.\s*$/, ""),
  );
  const analyst = renderCatalogPhrase(
    "analyst_logic.if_then.condition_group_with_action",
    { condition_group: conditionText, then_action: action },
  );
  return {
    analyst,
    developer: completeStatementDeveloperLogic(step, conditions),
  };
}

/**
 * Developer Logic for a non-IF step that runs under inherited conditions.
 * Single-column assignments are wrapped in the condition (IF / CASE WHEN /
 * df.loc[mask]); anything else lists the row condition before the step's own
 * formulas.
 * @param {any} step - Logic step object being read for display.
 * @param {Array<any>} conditions - Every condition the step runs under.
 */
function completeStatementDeveloperLogic(step, conditions) {
  normalizeCatalogStep?.(step);
  const scope = atlasDevEachDialect((dialect) =>
    atlasDevConditionTree(conditions, dialect),
  );
  let own = null;
  try {
    own = atlasDeveloperFormulas(step);
  } catch (error) {
    console.warn("Developer Logic could not be generated for a step.", error);
  }
  const excel = /^=([^\n]+)$/.exec(own?.excel || "");
  const sql = /^([^\n]+) AS (\[[^\]\n]+\])$/.exec(own?.sql || "");
  const python = /^df\[([^\]\n]+)\] = ([^\n]+)$/.exec(own?.python || "");
  if (excel && sql && python)
    return atlasDeveloperFormulaText({
      lead: own.lead,
      excel: `=IF(${scope.excel}, ${excel[1]}, "")`,
      sql: `CASE WHEN ${scope.sql} THEN ${sql[1]} END AS ${sql[2]}`,
      python: `mask = ${scope.python}\ndf.loc[mask, ${python[1]}] = ${python[2]}`,
      notes: own.notes,
    });
  const rows = atlasDeveloperFormulaText({
    lead: renderCatalogPhrase(
      "developer_logic.notes.complete_statement_scope",
      {},
    ),
    ...atlasDevFilterFormulas(scope, true),
  });
  const ownText = atlasDeveloperFormulaText(own);
  return ownText ? `${rows}\n\n${ownText}` : rows;
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
 * Builds display-only flattened rows for the Requirements Preview complete
 * statement mode. Every step inherits the conditions of the steps above it, so
 * each row reads on its own. ELSE branches inherit the opposite of the IF they
 * follow. Parent IFs that only gate their children are folded into them.
 */
function completeStatementPreviewRows() {
  syncAutoReferenceSteps?.();
  const entries = hierarchicalStepEntries({ includeDisabled: false });
  const stepsById = new Map(
    entries.map((entry) => [entry.step.id, entry.step]),
  );
  const hasDisplayedChild = new Set(
    entries.map((entry) => entry.step.parentId).filter(Boolean),
  );
  // Blocks a step's THEN children run under, and the blocks above the step.
  const thenBlocksById = new Map();
  const outerBlocksById = new Map();
  const hiddenNotesById = new Map();
  const lastIfBySibling = new Map();
  const elseIfsBySibling = new Map();
  const rows = [];

  entries.forEach((entry) => {
    const step = entry.step;
    const parentId = step.parentId || null;
    const parent = parentId ? stepsById.get(parentId) : null;
    const stepType = completeStatementStepType(step);
    const branch = parent ? step.branchType || "then" : "root";

    let outer;
    if (parent && (branch === "else" || branch === "else-if")) {
      // An ELSE branch runs when its parent IF and earlier ELSE IFs were not met.
      outer = [
        ...(outerBlocksById.get(parentId) || []),
        completeStatementInvertedBlock(parent),
        ...(elseIfsBySibling.get(parentId) || []).map(
          completeStatementInvertedBlock,
        ),
      ];
    } else {
      outer = parent ? thenBlocksById.get(parentId) || [] : [];
    }

    let own = [];
    if (stepType === "if_then")
      own = completeStatementConditionBlock(parseStepConditions(step));
    else if (stepType === "else")
      own = completeStatementInvertedBlock(
        stepsById.get(step.params?.parent_if_step_id) ||
          lastIfBySibling.get(parentId),
      );
    const blocks = own.length ? [...outer, own] : outer;

    if (stepType === "if_then" && branch !== "else-if")
      lastIfBySibling.set(parentId, step);
    if (parent && branch === "else-if" && stepType === "if_then")
      elseIfsBySibling.set(parentId, [
        ...(elseIfsBySibling.get(parentId) || []),
        step,
      ]);

    const isGateOnly =
      (stepType === "if_then" || stepType === "else") &&
      hasDisplayedChild.has(step.id) &&
      !completeStatementHasIndependentAction(step);
    const parentHiddenNotes = hiddenNotesById.get(parentId) || [];
    // A legacy ELSE's default note describes ELSE itself, which this view removes.
    const ownNote =
      stepType === "else" ? step.notes || "" : noteText(step, rows.length);
    outerBlocksById.set(step.id, outer);
    thenBlocksById.set(step.id, blocks);
    hiddenNotesById.set(
      step.id,
      isGateOnly && ownNote
        ? [...parentHiddenNotes, ownNote]
        : parentHiddenNotes,
    );
    if (isGateOnly) return;

    const logic = completeStatementLogic(
      step,
      completeStatementJoinConditions(blocks),
    );
    rows.push({
      step: `${entry.number}`,
      stepId: step.id,
      branch: "Root",
      analyst: logic.analyst,
      developer: logic.developer,
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
    "export",
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
    "export",
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
      // renderSelectedStep below draws the editor; renderSteps would draw it too.
      renderSteps?.({ includeSelectedStep: false });
      renderSelectedStep?.();
      // The field suggestion lists are built when a field input is first
      // focused (10-field-picker.js); building them here rebuilt them from
      // the whole library on every visit.
      applyFieldPickerAttributes?.();
    } else if (target === "preview") {
      atlasPreviewDirty = false;
      renderPreview?.();
      renderLogicTablePreviewRows?.();
    } else if (target === "review") {
      renderValidationPanel?.();
    } else if (target === "export") {
      atlasRenderExportDashboard?.();
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
  atlasInvalidatePages(["fields", "steps", "preview", "review", "export"]);
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
  atlasInvalidatePages(["steps", "preview", "review", "export"]);
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
  atlasRenderAuditIdentity?.(audit);
  e.auditName.value = audit.name || "";
  e.auditPurpose.value = audit.purpose || "";
  if (e.auditStatus) {
    e.auditStatus.value = audit.status || "Draft";
    atlasSyncChoiceSelection?.(e.auditStatus);
  }
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

// Connectors that start a new line when the Rules "Split AND/OR" view is on.
const ATLAS_LOGIC_LINE_BREAK_CONNECTORS = ["AND", "OR"];
const ATLAS_LOGIC_LINE_BREAK_MARKER = "\u2028";

/**
 * Renders step-card logic. When the split view is on, each AND/OR connector
 * outside quoted names starts a new line. Display only: the text is not stored.
 * @param {any} text - Analyst logic text for one step.
 */
function renderStepCardLogic(text) {
  if (!state.splitLogicConnectors) return renderLogicWithPills(text);
  const connector = new RegExp(
    `[ \\t]+\\b(${ATLAS_LOGIC_LINE_BREAK_CONNECTORS.join("|")})\\b[ \\t]+`,
    "g",
  );
  const marked = String(text || "")
    .split(/("[^"]+")/g)
    .map((part) =>
      part.startsWith('"') && part.endsWith('"')
        ? part
        : part.replace(connector, `${ATLAS_LOGIC_LINE_BREAK_MARKER}$1 `),
    )
    .join("");
  return renderLogicWithPills(marked)
    .split(ATLAS_LOGIC_LINE_BREAK_MARKER)
    .join('<br class="logic-connector-break">');
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
 * Renders the Requirements Preview table.
 */
function renderPreview() {
  syncPreviewNotesLayout();
  renderRequirementsFieldsPreview();
  const complete = isCompleteStatementsPreviewMode();
  const rows = complete ? completeStatementPreviewRows() : previewRows();
  if (!rows.length) {
    e.logicPreview.innerHTML = atlasPreviewEmptyState({
      title: "No audit logic yet",
      body: "Steps appear here as you add them in the Logic Builder.",
      action: "Open Logic Builder",
      section: "steps",
    });
    return;
  }
  e.logicPreview.innerHTML = `
    <div class="logic-table-wrap" tabindex="0" aria-label="Audit Logic table${complete ? ", complete statements" : ""}">
      <table class="logic-preview-table">
        <thead>
          <tr>
            <th scope="col" class="preview-number-col">Step</th>
            <th scope="col">Analyst Logic</th>
            <th scope="col">Developer Logic</th>
            <th scope="col" class="preview-notes-col">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr class="logic-row-depth-${row.level}" style="--preview-depth:${Number(row.level) || 0}"${row.stepId ? ` data-preview-step-id="${esc(row.stepId)}"` : ""}>
              <td class="preview-number-col">${esc(row.step)}</td>
              <td class="preview-analyst-col">${renderLogicWithPills(row.analyst)}</td>
              <td class="preview-developer-col developer-logic-cell">${esc(row.developer)}</td>
              <td class="preview-notes-col">${e.includeNotes?.checked ? renderLogicWithPills(row.notes) : ""}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

const ATLAS_PREVIEW_VIEWS = ["fields", "logic", "both"];
const ATLAS_PREVIEW_VIEW_KEY = "atlasAlignPreviewView";

/** Returns the stored Requirements Preview view, or "both". */
function atlasStoredPreviewView() {
  try {
    const stored = localStorage.getItem(ATLAS_PREVIEW_VIEW_KEY);
    return ATLAS_PREVIEW_VIEWS.includes(stored) ? stored : "both";
  } catch {
    return "both";
  }
}

/**
 * Shows Display Fields, Audit Logic, or both stacked. Both panels stay
 * mounted, so switching never re-renders the tables.
 * @param {string} view - "fields", "logic", or "both".
 * @param {{ remember?: boolean }} options - Whether to store the choice.
 */
function atlasActivatePreviewPane(view, { remember = true } = {}) {
  const page = document.getElementById("page-preview");
  if (!page) return;
  const next = ATLAS_PREVIEW_VIEWS.includes(view) ? view : "both";
  page.dataset.previewView = next;
  page.querySelectorAll("[data-preview-pane-tab]").forEach((tab) => {
    const selected = tab.dataset.previewPaneTab === next;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });
  page.querySelectorAll("[data-preview-pane]").forEach((panel) => {
    const active = next === "both" || panel.dataset.previewPane === next;
    panel.classList.toggle("is-preview-pane-active", active);
    panel.hidden = !active;
    panel.setAttribute(
      "aria-labelledby",
      next === "both"
        ? panel.querySelector(".preview-pane-heading")?.id || ""
        : next === "fields"
          ? "previewPaneFieldsTab"
          : "previewPaneLogicTab",
    );
  });
  if (!remember) return;
  try {
    localStorage.setItem(ATLAS_PREVIEW_VIEW_KEY, next);
  } catch {
    /* The view still switches; it just is not remembered. */
  }
}

function atlasBindPreviewPaneSwitch() {
  const page = document.getElementById?.("page-preview");
  const tablist = page?.querySelector("[data-preview-pane-switch]");
  if (!tablist || tablist.dataset.bound === "true") return;
  tablist.dataset.bound = "true";
  atlasActivatePreviewPane(atlasStoredPreviewView(), { remember: false });
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-preview-pane-tab]");
    if (!tab || !tablist.contains(tab)) return;
    atlasActivatePreviewPane(tab.dataset.previewPaneTab);
  });
  tablist.addEventListener("keydown", (event) => {
    const tabs = [...tablist.querySelectorAll("[role='tab']")];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let nextIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    atlasActivatePreviewPane(tabs[nextIndex].dataset.previewPaneTab);
    tabs[nextIndex].focus();
  });
  page.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-empty-section]");
    if (!button) return;
    const section = button.dataset.previewEmptySection;
    if (typeof atlasNavigateToSection === "function")
      atlasNavigateToSection(section).catch?.(() => showSection?.(section));
    else showSection?.(section);
  });
}

atlasBindPreviewPaneSwitch();

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

/**
 * Normalizes one Remove Duplicates column entry.
 * @param {any} item - Raw entry with sourceFile, sourceAlias, and fieldName.
 */
function atlasNormalizeDuplicateField(item = {}) {
  const fieldName = String(item?.fieldName || "").trim();
  if (!fieldName) return null;
  const sourceFile = String(item?.sourceFile || "").trim();
  return {
    sourceFile,
    sourceAlias: String(
      item?.sourceAlias ||
        (typeof sourceAliasFor === "function"
          ? sourceAliasFor(sourceFile)
          : "") ||
        "",
    ).trim(),
    fieldName,
  };
}

/**
 * Reads the Remove Duplicates column list from step params.
 * Falls back to the legacy single-column params so older audits keep working.
 * @param {any} params - Step params.
 */
function atlasDuplicateFieldsFromParams(params = {}) {
  let raw = params?.duplicate_fields_json;
  if (typeof raw === "string") {
    try {
      raw = raw.trim() ? JSON.parse(raw) : null;
    } catch (_error) {
      raw = null;
    }
  }
  if (Array.isArray(raw)) {
    const seen = new Set();
    return raw
      .map((item) => atlasNormalizeDuplicateField(item))
      .filter((item) => {
        if (!item) return false;
        const key = atlasDuplicateFieldKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  const legacy = atlasNormalizeDuplicateField({
    sourceFile: params?.source_file,
    sourceAlias: params?.source_alias,
    fieldName: params?.field_name,
  });
  return legacy ? [legacy] : [];
}

/** Stable identity for a Remove Duplicates column entry. */
function atlasDuplicateFieldKey(item = {}) {
  return `${item.sourceFile || ""}::${item.fieldName || ""}`;
}

function atlasSerializeDuplicateFields(fields = []) {
  return JSON.stringify(
    (fields || [])
      .map((item) => atlasNormalizeDuplicateField(item))
      .filter(Boolean),
  );
}

// ATLAS-JOIN-KEYS:BEGIN
/**
 * Normalizes one join key pair. Pairs with no fields are kept so a freshly
 * added row survives until the analyst picks its fields.
 * @param {any} item - Raw pair with id, left_field, and right_field.
 */
function atlasNormalizeJoinKeyPair(item = {}) {
  return {
    id:
      String(item?.id || "").trim() ||
      (typeof uid === "function"
        ? uid("joinkey")
        : `joinkey-${Math.random().toString(36).slice(2, 10)}`),
    left_field: String(item?.left_field || "").trim(),
    right_field: String(item?.right_field || "").trim(),
  };
}

/**
 * Reads every join key pair from step params. The first pair always comes
 * from the left_field/right_field mirror params so repairs and source
 * replacement that rewrite those params stay authoritative. Audits saved
 * before multi-key joins have no join_keys_json and fall back to the mirror.
 * @param {any} params - Join step params.
 */
function atlasJoinKeyPairsFromParams(params = {}) {
  let raw = params?.join_keys_json;
  if (typeof raw === "string") {
    try {
      raw = raw.trim() ? JSON.parse(raw) : null;
    } catch (_error) {
      raw = null;
    }
  }
  const pairs = Array.isArray(raw)
    ? raw
        .filter((item) => item && typeof item === "object")
        .map((item) => atlasNormalizeJoinKeyPair(item))
    : [];
  const first = {
    left_field: String(params?.left_field || "").trim(),
    right_field: String(params?.right_field || "").trim(),
  };
  if (!pairs.length)
    return first.left_field || first.right_field
      ? [atlasNormalizeJoinKeyPair({ id: "joinkey-1", ...first })]
      : [];
  pairs[0] = { ...pairs[0], ...first };
  return pairs;
}

/**
 * Join key pairs with at least one field chosen, for logic text and checks.
 * @param {any} params - Join step params.
 */
function atlasJoinKeyPairsInUse(params = {}) {
  return atlasJoinKeyPairsFromParams(params).filter(
    (pair, index) => index === 0 || pair.left_field || pair.right_field,
  );
}

function atlasSerializeJoinKeyPairs(pairs = []) {
  return JSON.stringify(
    (pairs || []).map((pair) => atlasNormalizeJoinKeyPair(pair)),
  );
}

/** Stores a join key pair list and mirrors its first pair to left_field/right_field. */
function atlasApplyJoinKeyPairs(params = {}, pairs = []) {
  const normalized = (pairs || []).map((pair) =>
    atlasNormalizeJoinKeyPair(pair),
  );
  params.join_keys_json = atlasSerializeJoinKeyPairs(normalized);
  params.left_field = normalized[0]?.left_field || "";
  params.right_field = normalized[0]?.right_field || "";
  return params;
}

// ATLAS-JOIN-KEYS:END

/**
 * Normalizes one Sort Records field entry. Rows without a field are kept so a
 * freshly added row survives until the analyst picks its field.
 * @param {any} item - Raw entry with id, sourceFile, sourceAlias, fieldName, and direction.
 */
function atlasNormalizeSortField(item = {}) {
  const sourceFile = String(item?.sourceFile || "").trim();
  const fieldName = String(item?.fieldName || "").trim();
  return {
    id: String(item?.id || "").trim() || uid("sort"),
    sourceFile: fieldName ? sourceFile : "",
    sourceAlias: fieldName
      ? String(
          item?.sourceAlias ||
            (typeof sourceAliasFor === "function"
              ? sourceAliasFor(sourceFile)
              : "") ||
            "",
        ).trim()
      : "",
    fieldName,
    direction: item?.direction === "Descending" ? "Descending" : "Ascending",
  };
}

/**
 * Reads the Sort Records field list from step params.
 * Falls back to the legacy single-field params so older audits keep working.
 * @param {any} params - Step params.
 */
function atlasSortFieldsFromParams(params = {}) {
  let raw = params?.sort_fields_json;
  if (typeof raw === "string") {
    try {
      raw = raw.trim() ? JSON.parse(raw) : null;
    } catch (_error) {
      raw = null;
    }
  }
  if (Array.isArray(raw))
    return raw
      .filter((item) => item && typeof item === "object")
      .map((item) => atlasNormalizeSortField(item));
  if (!String(params?.field_name || "").trim()) return [];
  return [
    atlasNormalizeSortField({
      sourceFile: params?.source_file,
      sourceAlias: params?.source_alias,
      fieldName: params?.field_name,
      direction: params?.sort_direction,
    }),
  ];
}

function atlasSerializeSortFields(fields = []) {
  return JSON.stringify(
    (fields || []).map((item) => atlasNormalizeSortField(item)),
  );
}

function atlasSortFieldsFromContainer(container) {
  if (!container) return [];
  return [...container.querySelectorAll("[data-sort-row]")].map((row) =>
    atlasNormalizeSortField({
      id: row.dataset.sortId,
      sourceFile: row.querySelector("[data-sort-source]")?.value || "",
      fieldName: row.querySelector("[data-sort-field]")?.value || "",
      direction: row.querySelector("[data-sort-direction]")?.value,
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
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
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
