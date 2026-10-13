/**
 * 09-workbook-import.js
 *
 * Workbook import parser for audit sheets, source aliases, vanity labels, and imported logic-step rows using ExcelJS workbook structures.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Workbook import state
// -----------------------------------------------------------------------------
const workbookState = {
  loaded: false,
  fileName: "",
  sheets: [],
  auditSheets: [],
  activeAuditName: "",
  vanityLabels: [],
  sourceAliases: [],
  logicSteps: [],
  warnings: [],
};

// -----------------------------------------------------------------------------
// Worksheet parsing helpers
// -----------------------------------------------------------------------------
/**
 * Normalizes an Excel header for matching.
 * @param {any} value - Value to process or assign.
 */
function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Returns worksheet row values as a zero-based array.
 * @param {any} row - ExcelJS row or preview row object.
 */
function rowValues(row) {
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    values[colNumber - 1] = cell.value;
  });
  return values;
}

/**
 * Returns trimmed worksheet header names from row 1.
 * @param {any} worksheet - ExcelJS worksheet object.
 */
function worksheetHeaders(worksheet) {
  const firstRow = worksheet.getRow(1);
  return rowValues(firstRow).map((value) => String(value || "").trim());
}

/**
 * Converts worksheet rows into objects keyed by headers.
 * @param {any} worksheet - ExcelJS worksheet object.
 */
function worksheetToObjects(worksheet) {
  const headers = worksheetHeaders(worksheet);
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = rowValues(row);
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = values[index] ?? "";
    });
    if (Object.values(record).some((value) => String(value ?? "").trim()))
      rows.push(record);
  });
  return rows;
}

/**
 * Classifies an Excel worksheet by name or headers.
 * @param {any} worksheet - ExcelJS worksheet object.
 */
function classifyWorksheet(worksheet) {
  const headers = worksheetHeaders(worksheet).map(normalizeHeader);
  /**
   * Handles the has portion of the ATLAS Align client-side workflow.
   * @param {any} name - Name, filename, or key used by the operation.
   */
  const has = (name) => headers.includes(normalizeHeader(name));
  if (worksheet.name === "Vanity Labels") return "vanity";
  if (worksheet.name === "Source Table Aliases") return "aliases";
  if (worksheet.name === "_audit_logic_steps") return "logic";
  if (has("Source File") && has("Field Name")) return "audit";
  return "other";
}

/**
 * Detects available audited sheets and workbook warnings.
 * @param {any} workbook - ExcelJS workbook object.
 */
function detectWorkbookStructure(workbook) {
  workbookState.sheets = workbook.worksheets.map((worksheet) => {
    const type = classifyWorksheet(worksheet);
    const headers = worksheetHeaders(worksheet);
    return {
      name: worksheet.name,
      type,
      headers,
      rowCount: Math.max(0, worksheet.rowCount - 1),
    };
  });
  workbookState.auditSheets = workbookState.sheets
    .filter((sheet) => sheet.type === "audit")
    .map((sheet) => sheet.name);
  workbookState.warnings = [];
  if (!workbookState.sheets.some((sheet) => sheet.type === "vanity"))
    workbookState.warnings.push(
      "Workbook does not include a recognized Vanity Labels sheet.",
    );
  if (!workbookState.sheets.some((sheet) => sheet.type === "aliases"))
    workbookState.warnings.push(
      "Workbook does not include a recognized Source Table Aliases sheet.",
    );
  if (!workbookState.sheets.some((sheet) => sheet.type === "logic"))
    workbookState.warnings.push(
      "Workbook does not include a recognized _audit_logic_steps sheet.",
    );
  if (!workbookState.auditSheets.length)
    workbookState.warnings.push(
      "Workbook has no recognized audit sheets with Source File and Field Name headers.",
    );
}

// -----------------------------------------------------------------------------
// Workbook metadata parsers
// -----------------------------------------------------------------------------
/**
 * Reads the Vanity Labels worksheet.
 * @param {any} workbook - ExcelJS workbook object.
 */
function parseVanityLabels(workbook) {
  const worksheet = workbook.getWorksheet("Vanity Labels");
  workbookState.vanityLabels = worksheet
    ? worksheetToObjects(worksheet)
        .map((row) => ({
          sourceFile: String(row["Source File"] || "").trim(),
          fieldName: String(row["Field Name"] || "").trim(),
          label: String(row["Vanity Label"] || "").trim(),
        }))
        .filter((row) => row.sourceFile && row.fieldName)
    : [];
}

/**
 * Reads the Source Table Aliases worksheet.
 * @param {any} workbook - ExcelJS workbook object.
 */
function parseSourceAliases(workbook) {
  const worksheet = workbook.getWorksheet("Source Table Aliases");
  workbookState.sourceAliases = worksheet
    ? worksheetToObjects(worksheet)
        .map((row) => ({
          sourceFile: String(row["Source File"] || "").trim(),
          alias: String(row["Alias"] || "").trim(),
        }))
        .filter((row) => row.sourceFile)
    : [];
}

/**
 * Reads imported logic-step rows from the workbook.
 * @param {any} workbook - ExcelJS workbook object.
 */
function parseLogicSteps(workbook) {
  const worksheet = workbook.getWorksheet("_audit_logic_steps");
  workbookState.logicSteps = worksheet
    ? worksheetToObjects(worksheet)
        .map((row) => ({
          auditName: String(row.audit_name || row["audit_name"] || "").trim(),
          stepId: String(row.step_id || row["step_id"] || uid("step")),
          stepNumber: String(
            row.step_number || row["step_number"] || "",
          ).trim(),
          stepType: String(
            row.step_type || row["step_type"] || "if_then",
          ).trim(),
          sourceFile: String(
            row.source_file || row["source_file"] || "",
          ).trim(),
          sourceAlias: String(
            row.source_alias || row["source_alias"] || "",
          ).trim(),
          parentId: String(row.parent_id || row["parent_id"] || "").trim(),
          analystLogic: String(
            row.analyst_logic || row["analyst_logic"] || "",
          ).trim(),
          notes: String(row.notes || row["notes"] || "").trim(),
        }))
        .filter((row) => row.auditName || row.analystLogic)
    : [];
}

/**
 * Converts an audit worksheet into field records.
 * @param {any} workbook - ExcelJS workbook object.
 * @param {any} auditName - Input used by auditSheetToFields.
 */
function auditSheetToFields(workbook, auditName) {
  const worksheet = workbook.getWorksheet(auditName);
  if (!worksheet) return [];
  return worksheetToObjects(worksheet)
    .map((row) => ({
      sourceFile: String(row["Source File"] || "").trim(),
      fieldName: String(row["Field Name"] || "").trim(),
      auditLabel: String(
        row["Audit-Specific Vanity Label"] || row["Vanity Label"] || "",
      ).trim(),
      used: String(row.Used || "").trim(),
      displayed: String(row.Displayed || "").trim(),
      order: row.Order || "",
    }))
    .filter((row) => row.sourceFile && row.fieldName);
}

/**
 * Resolves a source alias from audit, repo, or workbook metadata.
 * @param {any} sourceFile - Raw source file name.
 */
function sourceAliasFor(sourceFile) {
  const detail =
    typeof selectedSourceDetail === "function"
      ? selectedSourceDetail(sourceFile)
      : null;
  if (detail?.alias) return detail.alias;
  if (
    typeof atlasDisplayNameCollision === "function" &&
    atlasDisplayNameCollision(sourceFile)
  )
    return String(sourceFile || "");
  const fromState = (state.audit.sources || []).find((source) =>
    [source.sourceKey, source.alias, source.name].includes(sourceFile),
  )?.alias;
  if (fromState) return fromState;
  const fromRepo = (repoLibraryState?.sourceAliases || []).find(
    (item) => item.sourceFile === sourceFile && !atlasDisplayNameCollision?.(item.sourceFile),
  )?.alias;
  if (fromRepo) return fromRepo;
  const libraryMatches = (repoLibraryState?.sourceFiles || []).filter(
    (item) =>
      item.sourceKey === sourceFile ||
      item.alias === sourceFile ||
      item.sourceFile === sourceFile,
  );
  if (libraryMatches.length === 1) return libraryMatches[0].alias || sourceFile;
  return (
    workbookState.sourceAliases.find((item) => item.sourceFile === sourceFile)
      ?.alias ||
    sourceFile ||
    ""
  );
}

/**
 * Maps imported step type text to a legacy internal type.
 * @param {any} type - MIME type, step type, or classification value.
 */
function parseStepType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("reference")) return "source";
  if (normalized.includes("format") || normalized.includes("create"))
    return "create";
  if (normalized.includes("compare")) return "compare";
  if (normalized.includes("join")) return "join";
  if (normalized.includes("if")) return "if";
  return "transform";
}

/**
 * Derives a parent step number from a dotted step number.
 * @param {any} number - Input used by numberToParentNumber.
 */
function numberToParentNumber(number) {
  const parts = String(number || "")
    .split(".")
    .filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
}

/**
 * Infers branch type from imported analyst logic text.
 * @param {any} text - Input used by branchTypeFromAnalystLogic.
 * @param {any} parentId - Id of the parent step, or empty/null for top-level steps.
 */
function branchTypeFromAnalystLogic(text, parentId) {
  const normalized = String(text || "")
    .trim()
    .toUpperCase();
  if (!parentId) return "root";
  if (normalized.startsWith("ELSE IF")) return "else-if";
  if (normalized.startsWith("ELSE")) return "else";
  return "then";
}

// -----------------------------------------------------------------------------
// Imported logic conversion
// -----------------------------------------------------------------------------
/**
 * Converts imported logic rows into app step objects.
 * @param {any} auditName - Input used by logicRowsToSteps.
 */
function logicRowsToSteps(auditName) {
  const rows = workbookState.logicSteps.filter(
    (row) => row.auditName === auditName,
  );
  if (!rows.length) return [];
  const byNumber = new Map(rows.map((row) => [row.stepNumber, row]));
  const idByNumber = new Map(
    rows.map((row) => [row.stepNumber, row.stepId || uid("step")]),
  );
  return rows.map((row, index) => {
    const parentNumber = numberToParentNumber(row.stepNumber);
    const parentRow = byNumber.get(parentNumber);
    const parentId =
      row.parentId || (parentRow ? idByNumber.get(parentNumber) : null);
    return {
      id: idByNumber.get(row.stepNumber) || row.stepId || uid("step"),
      enabled: true,
      parentId: parentId || null,
      branchType: branchTypeFromAnalystLogic(row.analystLogic, parentId),
      sortOrder: index + 1,
      title: row.analystLogic
        ? row.analystLogic.slice(0, 70)
        : `Imported Step ${index + 1}`,
      type: parseStepType(row.stepType),
      source: row.sourceFile || "",
      field: "",
      action: row.analystLogic || "",
      notes:
        row.notes ||
        "Imported from workbook logic steps. Review and refine if needed.",
      conditions: [],
    };
  });
}

// -----------------------------------------------------------------------------
// Workbook audit loading
// -----------------------------------------------------------------------------
/**
 * Loads an audit sheet from a workbook into app state.
 * @param {any} auditName - Input used by loadAuditFromWorkbook.
 */
function loadAuditFromWorkbook(auditName) {
  if (!workbookState.loadedWorkbook) return;
  const auditFields = auditSheetToFields(
    workbookState.loadedWorkbook,
    auditName,
  );
  const sourceNames = [
    ...new Set(auditFields.map((item) => item.sourceFile).filter(Boolean)),
  ];
  const importedSteps = logicRowsToSteps(auditName);
  state.audit.name = auditName;
  state.audit.purpose = `Imported from workbook ${workbookState.fileName}.`;
  state.audit.sources = sourceNames.map((sourceFile) => ({
    id: uid("source"),
    name: sourceFile,
    description: sourceAliasFor(sourceFile)
      ? `Alias: ${sourceAliasFor(sourceFile)}`
      : "",
  }));
  state.audit.fields = auditFields.map((field) => ({
    id: uid("field"),
    name: field.auditLabel || field.fieldName,
    type: field.sourceFile === "Calculated Field" ? "Custom" : "Source",
    sourceFile: field.sourceFile,
    rawFieldName: field.fieldName,
    description: [field.sourceFile, field.fieldName]
      .filter(Boolean)
      .join(" / "),
  }));
  if (importedSteps.length) {
    state.audit.steps = importedSteps;
  } else {
    state.audit.steps = [
      ...state.audit.sources.map((source, index) => ({
        id: uid("step"),
        enabled: true,
        parentId: null,
        branchType: "root",
        sortOrder: index + 1,
        title: `Reference ${source.name}`,
        type: "source",
        source: source.name,
        field: "",
        action: `Reference source file ${source.name}${source.description ? ` (${source.description})` : ""}.`,
        conditions: [],
        notes:
          "Generated from workbook audit sheet. Review source context before final export.",
      })),
    ];
  }
  state.selectedStepId = state.audit.steps[0]?.id || null;
  state.audit.id = state.audit.id || uid("audit");
  state.activeAuditValue = `workbook:${auditName}`;
  markAuditSelected();
  workbookState.activeAuditName = auditName;
  renderAll();
  renderWorkbookStatus();
  showSection("overview");
  scheduleAutosave();
  status(`Loaded workbook audit: ${auditName}`, "ok");
  updateActiveAuditBaseline();
  renderActiveAuditSelect?.();
}

/**
 * Renders workbook import status and warnings.
 */
function renderWorkbookStatus() {
  const target = $("workbookStatus");
  if (!target) return;
  if (!workbookState.loaded) {
    target.innerHTML =
      '<p class="hint">No workbook loaded. Upload an ATLAS/SWAT audit documentation workbook to detect audit sheets and source fields.</p>';
    return;
  }
  target.innerHTML = `<div class="workbook-summary">
    <strong>${esc(workbookState.fileName)}</strong>
    <p class="hint">Detected ${workbookState.sheets.length} sheet(s), ${workbookState.auditSheets.length} possible audit sheet(s), ${workbookState.vanityLabels.length} vanity label row(s), and ${workbookState.logicSteps.length} logic step row(s).</p>
    ${workbookState.warnings.length ? `<div class="validation-list">${workbookState.warnings.map((warning) => `<div class="validation-item warn"><strong>Warning:</strong> ${esc(warning)}</div>`).join("")}</div>` : ""}
  </div>`;
}

/**
 * Renders the workbook audit-sheet selector.
 */
function renderWorkbookAuditSelector() {
  const select = $("workbookAuditSelect");
  if (!select) return;
  select.innerHTML = workbookState.auditSheets.length
    ? workbookState.auditSheets
        .map(
          (name) =>
            `<option value="${esc(name)}" ${workbookState.activeAuditName === name ? "selected" : ""}>${esc(name)}</option>`,
        )
        .join("")
    : '<option value="">No audit sheets detected</option>';
}

// -----------------------------------------------------------------------------
// Workbook file import
// -----------------------------------------------------------------------------
/**
 * Loads an Excel workbook and extracts audit metadata.
 * @param {any} file - Browser File object to import.
 */
async function importWorkbookFile(file) {
  if (!window.ExcelJS) {
    status(
      "ExcelJS is not loaded. Check the ExcelJS script reference in index.html.",
      "bad",
    );
    return;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  workbookState.loaded = true;
  workbookState.fileName = file.name;
  workbookState.loadedWorkbook = workbook;
  detectWorkbookStructure(workbook);
  parseVanityLabels(workbook);
  parseSourceAliases(workbook);
  parseLogicSteps(workbook);
  renderWorkbookStatus();
  renderWorkbookAuditSelector();
  renderActiveAuditSelect?.();
  refreshFieldPickerOptions();
  if (workbookState.auditSheets.length)
    status(`Workbook loaded. Select an audit sheet to import.`, "ok");
  else
    status("Workbook loaded, but no recognized audit sheet was found.", "warn");
}

// -----------------------------------------------------------------------------
// Workbook picker options
// -----------------------------------------------------------------------------
/**
 * Builds picker options from workbook vanity labels and audit fields.
 */
function workbookFieldOptions() {
  const options = [];
  workbookState.vanityLabels.forEach((row) => {
    options.push({
      value: row.label || row.fieldName,
      label: `${row.label || row.fieldName} (${row.sourceFile}.${row.fieldName})`,
      source: row.sourceFile,
      raw: row.fieldName,
      kind: "Vanity Label",
    });
  });
  if (workbookState.activeAuditName && workbookState.loadedWorkbook) {
    auditSheetToFields(
      workbookState.loadedWorkbook,
      workbookState.activeAuditName,
    ).forEach((row) => {
      options.push({
        value: row.auditLabel || row.fieldName,
        label: `${row.auditLabel || row.fieldName} (${row.sourceFile}.${row.fieldName})`,
        source: row.sourceFile,
        raw: row.fieldName,
        kind: "Audit Field",
      });
    });
  }
  return options;
}

// ATLAS-MATH-OPERATIONS-UPDATE:BEGIN
parseLogicSteps = function parseLogicStepsWithParamsJson(workbook) {
  const worksheet = workbook.getWorksheet("_audit_logic_steps");
  workbookState.logicSteps = worksheet
    ? worksheetToObjects(worksheet)
        .map((row) => ({
          auditName: String(row.audit_name || row["audit_name"] || "").trim(),
          stepId: String(row.step_id || row["step_id"] || uid("step")),
          stepNumber: String(
            row.step_number || row["step_number"] || "",
          ).trim(),
          stepType: String(
            row.step_type || row["step_type"] || "if_then",
          ).trim(),
          sourceFile: String(
            row.source_file || row["source_file"] || "",
          ).trim(),
          sourceAlias: String(
            row.source_alias || row["source_alias"] || "",
          ).trim(),
          parentId: String(row.parent_id || row["parent_id"] || "").trim(),
          analystLogic: String(
            row.analyst_logic || row["analyst_logic"] || "",
          ).trim(),
          developerLogic: String(
            row.developer_logic || row["developer_logic"] || "",
          ).trim(),
          notes: String(row.notes || row["notes"] || "").trim(),
          generated: String(row.generated || row["generated"] || "").trim(),
          sortOrder: Number(row.sort_order || row["sort_order"] || 0),
          indentLevel: Number(row.indent_level || row["indent_level"] || 0),
          paramsJson: String(
            row.params_json || row["params_json"] || "",
          ).trim(),
        }))
        .filter((row) => row.auditName || row.analystLogic)
    : [];
};

logicRowsToSteps = function logicRowsToStepsWithParamsJson(auditName) {
  const rows = workbookState.logicSteps.filter(
    (row) => row.auditName === auditName,
  );
  if (!rows.length) return [];
  const byNumber = new Map(rows.map((row) => [row.stepNumber, row]));
  const idByNumber = new Map(
    rows.map((row) => [row.stepNumber, row.stepId || uid("step")]),
  );
  return rows.map((row, index) => {
    const parentNumber = numberToParentNumber(row.stepNumber);
    const parentRow = byNumber.get(parentNumber);
    const parentId =
      row.parentId || (parentRow ? idByNumber.get(parentNumber) : null);
    let params = {};
    if (row.paramsJson) {
      try {
        params = JSON.parse(row.paramsJson);
      } catch (_error) {
        workbookState.warnings.push(
          `Step ${row.stepNumber || index + 1} has invalid params_json and was imported without parameters.`,
        );
      }
    }
    const step = {
      id: idByNumber.get(row.stepNumber) || row.stepId || uid("step"),
      enabled: true,
      parentId: parentId || null,
      branchType: branchTypeFromAnalystLogic(row.analystLogic, parentId),
      sortOrder: row.sortOrder || index + 1,
      title: row.analystLogic
        ? row.analystLogic.slice(0, 70)
        : `Imported Step ${index + 1}`,
      type: parseStepType(row.stepType),
      step_type: row.stepType || undefined,
      source: row.sourceFile || params.source_file || "",
      field: params.field_name || params.column_name || "",
      action: row.analystLogic || "",
      developerLogic: row.developerLogic || "",
      notes: row.notes || "",
      autoGeneratedReference: /^(yes|true|1)$/i.test(row.generated),
      conditions: [],
      params,
    };
    normalizeCatalogStep?.(step, index);
    return step;
  });
};
// ATLAS-MATH-OPERATIONS-UPDATE:END
