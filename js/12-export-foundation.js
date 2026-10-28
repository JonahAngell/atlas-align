/**
 * 12-export-foundation.js
 *
 * File builders for current audit exports: Excel table view, HTML, and the qTest template.
 * The Export page (29-export-dashboard.js) registers these builders as export formats.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Shared export row helpers
// -----------------------------------------------------------------------------
// HTML indent for each nesting level of the Analyst Logic cell.
const AUDIT_EXPORT_HTML_INDENT_PX = 24;

/**
 * Builds export rows from preview rows. `level` is the step's nesting depth,
 * shown as an indent on the Analyst Logic cell rather than as a column.
 */
function auditExportRows() {
  const includeNotes = !!e.includeNotes?.checked;
  return previewRows().map((row) => ({
    level: row.level || 0,
    Step: row.step,
    "Analyst Logic": row.analyst,
    "Developer Logic": row.developer,
    Notes: includeNotes ? row.notes : "",
  }));
}

function requirementsFieldExportRows() {
  return requirementsFieldRows().map((row) => ({
    Number: row.rowNumber,
    "Unique ID": row.uniqueId,
    "Field Title": row.fieldTitle,
    "Vanity Label": row.vanityLabel,
    "Display Format": row.displayFormat,
    "Data Category": row.dataCategory,
    Display: row.display,
    Notes: row.notes,
  }));
}
/**
 * Sanitizes text for use in downloaded filenames.
 * @param {any} name - Name, filename, or key used by the operation.
 */
function safeFileName(name) {
  return String(name || "audit_logic").replace(/[^A-Za-z0-9_-]+/g, "_");
}

// -----------------------------------------------------------------------------
// Excel export
// -----------------------------------------------------------------------------
const ATLAS_EXCEL_LIBRARY_ERROR =
  "The Excel library could not load. Check your connection, then export again.";

/**
 * Loads ExcelJS, throwing a user-facing error when it is unavailable.
 */
async function atlasRequireExcelJs() {
  try {
    await atlasEnsureExcelJs();
  } catch {
    throw new Error(ATLAS_EXCEL_LIBRARY_ERROR);
  }
}

/**
 * Builds the Excel table-view workbook for the current audit.
 */
async function buildAuditExcelWorkbook() {
  await atlasRequireExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = ATLAS_APP_NAME;
  const fields = workbook.addWorksheet("Fields");
  fields.columns = [
    { header: "#", key: "Number", width: 8 },
    { header: "Unique ID", key: "Unique ID", width: 24 },
    { header: "Field Title", key: "Field Title", width: 30 },
    { header: "Vanity Label", key: "Vanity Label", width: 30 },
    { header: "Display Format", key: "Display Format", width: 28 },
    { header: "Data Category", key: "Data Category", width: 22 },
    { header: "Display", key: "Display", width: 12 },
    { header: "Notes", key: "Notes", width: 60 },
  ];
  requirementsFieldExportRows().forEach((row) => fields.addRow(row));
  const logic = workbook.addWorksheet("Audit Logic");
  logic.columns = [
    { header: "Step", key: "Step", width: 18 },
    { header: "Analyst Logic", key: "Analyst Logic", width: 80 },
    { header: "Developer Logic", key: "Developer Logic", width: 40 },
    { header: "Notes", key: "Notes", width: 60 },
  ];
  const logicRows = auditExportRows();
  logicRows.forEach(({ level, ...row }) => logic.addRow(row));
  [fields, logic].forEach((sheet) => {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0747A6" },
    };
    header.alignment = { vertical: "middle", wrapText: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
    });
  });
  const analystColumn = logic.getColumn("Analyst Logic").number;
  logicRows.forEach(({ level }, index) => {
    if (!level) return;
    const cell = logic.getRow(index + 2).getCell(analystColumn);
    cell.alignment = { ...cell.alignment, indent: level };
  });
  return workbook;
}

// -----------------------------------------------------------------------------
// HTML export
// -----------------------------------------------------------------------------
/**
 * Escapes a table cell value for the HTML export, keeping line breaks.
 */
function auditHtmlCell(value) {
  return esc(value).replace(/\n/g, "<br>");
}

/**
 * Builds Confluence-friendly HTML for the current audit.
 */
function auditHtmlDocument() {
  const fieldRows = requirementsFieldRows()
    .map(
      (row) =>
        `<tr><td>${row.rowNumber}</td><td>${auditHtmlCell(row.uniqueId)}</td><td>${auditHtmlCell(row.fieldTitle)}</td><td>${auditHtmlCell(row.vanityLabel)}</td><td>${auditHtmlCell(row.displayFormat)}</td><td>${auditHtmlCell(row.dataCategory)}</td><td>${auditHtmlCell(row.display)}</td><td>${auditHtmlCell(row.notes)}</td></tr>`,
    )
    .join("");
  const logicRows = auditExportRows()
    .map(
      (row) =>
        `<tr><td>${auditHtmlCell(row.Step)}</td><td${row.level ? ` style="padding-left:${8 + row.level * AUDIT_EXPORT_HTML_INDENT_PX}px"` : ""}>${auditHtmlCell(row["Analyst Logic"])}</td><td>${auditHtmlCell(row["Developer Logic"])}</td><td>${auditHtmlCell(row.Notes)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.audit.name)} Audit Requirements</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#172b4d}h2{margin-top:32px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9e2ef;padding:8px;vertical-align:top;text-align:left}th{background:#0747a6;color:#fff}td{white-space:normal}</style></head><body><h1>${esc(state.audit.name)}</h1><p>${esc(state.audit.purpose || "")}</p><h2>Fields</h2><table><thead><tr><th aria-label="Row number"></th><th>Unique ID</th><th>Field Title</th><th>Vanity Label</th><th>Display Format</th><th>Data Category</th><th>Display</th><th>Notes</th></tr></thead><tbody>${fieldRows}</tbody></table><h2>Audit Logic</h2><table><thead><tr><th>Step</th><th>Analyst Logic</th><th>Developer Logic</th><th>Notes</th></tr></thead><tbody>${logicRows}</tbody></table></body></html>`;
}

// -----------------------------------------------------------------------------
// qTest template constants
// -----------------------------------------------------------------------------
const QTEST_TEMPLATE_PATH = "./templates/qtest-test-design-template.xlsx";
const QTEST_GUIDE_SHEET = "Guide - Start Here";
const QTEST_UAT_SHEET = "UAT - Disney3";
const QTEST_SECTION_STYLE_ROW = 4;
const QTEST_FIRST_DATA_ROW = 5;
const QTEST_COLUMN_COUNT = 15;
const QTEST_ATLAS_PASS_FAIL_COLUMN = 12;
const QTEST_DATA_PASS_FAIL_COLUMN = 14;
const QTEST_RESULT_OPTIONS = '"Pass,Fail,Blocked,N/A"';
const QTEST_WRAPPED_COLUMNS = [3, 4, 5, 6, 7, 8, 11, 13, 15];
const QTEST_COLUMN_KEYS = [
  "number",
  "testType",
  "testPurpose",
  "sourceRule",
  "testDataScenario",
  "testActionSteps",
  "atlasExpectedOutcome",
  "sourceDataExpectedOutcome",
  "testRecordOrg",
  "tester",
  "atlasObservedOutcome",
  "atlasPassFail",
  "dataValidationObserved",
  "dataPassFail",
  "comments",
];
const QTEST_SECTIONS = [
  ["A", "Core Comparison Logic - Expected Match and Mismatch Results"],
  ["B", "Record Exclusions and Source Filters"],
  ["C", "Research Error Classification"],
  ["D", "Enrichment, Regionalization and Display Fields"],
  ["E", "Output Suppression and Data Quality"],
  ["F", "Legacy Workflow / ATLAS Design Decisions"],
  ["G", "End-to-End, Refresh and Regression Validation"],
];

// -----------------------------------------------------------------------------
// qTest workbook helpers
// -----------------------------------------------------------------------------
/**
 * Deep-copies an ExcelJS style object.
 * @param {any} style - Input used by cloneExcelStyle.
 */
function cloneExcelStyle(style) {
  return style ? JSON.parse(JSON.stringify(style)) : {};
}

let qtestTemplateBytes = null;

/**
 * Loads the qTest Excel template workbook. The template bytes are fetched once
 * and reused, since the Export page builds the workbook on each visit.
 */
async function loadQtestTemplateWorkbook() {
  await atlasRequireExcelJs();
  if (!qtestTemplateBytes) {
    const response = await fetch(QTEST_TEMPLATE_PATH);
    if (!response.ok)
      throw new Error(
        `Could not load Qtest template workbook: ${response.status}`,
      );
    qtestTemplateBytes = await response.arrayBuffer();
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(qtestTemplateBytes.slice(0));
  return workbook;
}

// -----------------------------------------------------------------------------
// qTest scenario classification
// -----------------------------------------------------------------------------
/**
 * Reads the THEN/ELSE outcome of a logic step, including legacy free-text actions.
 * @param {any} step - Logic step object being read.
 */
function qtestStepAction(step) {
  const params = step.params || {};
  const errorColumn = phrasePlaceholder(
    "error_message_column",
    "Error Message",
  );
  if (step.step_type === "flag_records")
    return params.flag_action === "do_not_display"
      ? { kind: "do_not_display" }
      : {
          kind: "display_text",
          message: params.message || "",
          outputColumn: params.output_column || errorColumn,
        };
  if (step.step_type === "filter_rows") return { kind: "do_not_display" };
  if (step.step_type !== "if_then" && step.step_type !== "else")
    return { kind: "none" };
  const actionType = params.then_action_type || "freeform";
  if (actionType === "display_text")
    return {
      kind: "display_text",
      message: params.then_text || "",
      outputColumn: params.then_output_column || errorColumn,
    };
  if (actionType === "do_not_display") return { kind: "do_not_display" };
  if (actionType.startsWith("set_column"))
    return {
      kind: "set_column",
      targetColumn: params.then_target_column || "",
      valueField: params.then_value_field || "",
      calculated: actionType !== "set_column_value",
    };
  const text = String(params.then_action || step.action || "").trim();
  if (!text || /^(ELSE\s*:?|(ELSE\s+)?IF\b[\s\S]*:)$/i.test(text))
    return { kind: "none" };
  const display =
    /display\s+(?:text\s+response\s+)?"([^"]+)"\s+in\s+(?:new\s+|newly\s+created\s+)?column\s+"([^"]+)"/i.exec(
      text,
    );
  if (display)
    return {
      kind: "display_text",
      message: display[1],
      outputColumn: display[2],
    };
  if (/\bdo\s+not\s+display\b/i.test(text)) return { kind: "do_not_display" };
  return { kind: "freeform", text };
}

/**
 * Returns the condition text of an IF/THEN step without its leading IF.
 * @param {any} step - Logic step object being read.
 */
function qtestConditionText(step) {
  const group = conditionGroupPlain(step)
    .replace(/^IF\s+/i, "")
    .trim();
  if (group) return group;
  const text = String(step.params?.then_action || step.action || "");
  const match = /^\s*IF\s+([\s\S]*?)(?:\s+THEN\b|:\s*$)/i.exec(text);
  return match ? match[1].trim() : "";
}

/**
 * Collects the names of columns that audit logic creates or populates.
 * @param {any} entries - Hierarchy entries with their resolved actions.
 */
function qtestOutputColumns(entries) {
  const columns = new Set();
  const add = (name) => {
    const clean = String(name || "")
      .trim()
      .toLowerCase();
    if (clean) columns.add(clean);
  };
  entries.forEach(({ step, action }) => {
    if (step.step_type === "create_column")
      add(step.params?.column_name || step.field);
    if (action.kind === "display_text") add(action.outputColumn);
    if (action.kind === "set_column") add(action.targetColumn);
  });
  return columns;
}

/**
 * Returns whether a step's condition tests a column the audit logic produces.
 * @param {any} step - Logic step object being read.
 * @param {Set<string>} outputColumns - Lowercased produced column names.
 */
function qtestConditionUsesOutputColumn(step, outputColumns) {
  const fields = parseStepConditions(step).flatMap((condition) => [
    condition.fieldName,
    condition.compareFieldName,
  ]);
  if (
    fields.some((field) =>
      outputColumns.has(
        String(field || "")
          .trim()
          .toLowerCase(),
      ),
    )
  )
    return true;
  const text = qtestConditionText(step).toLowerCase();
  return [...outputColumns].some((column) => text.includes(`"${column}"`));
}

/**
 * Assigns a logic step to a qTest section letter.
 * @param {any} step - Logic step object being read.
 * @param {any} action - Resolved step action from qtestStepAction.
 * @param {Set<string>} outputColumns - Lowercased produced column names.
 */
function qtestSectionForStep(step, action, outputColumns) {
  switch (step.step_type) {
    case "reference_source":
      return "G";
    case "join":
    case "union_sources":
    case "create_column":
    case "format_field":
    case "split_field":
      return "D";
    case "sort_records":
    case "remove_duplicates":
      return "E";
  }
  if (action.kind === "display_text")
    return /^research\b/i.test(String(action.message).trim()) ? "C" : "A";
  if (action.kind === "do_not_display")
    return qtestConditionUsesOutputColumn(step, outputColumns) ? "E" : "B";
  if (action.kind === "set_column") return "D";
  if (action.kind === "none") return "B";
  return "F";
}

/**
 * Classifies the qTest test type for a logic step.
 * @param {any} step - Logic step object being read.
 * @param {any} action - Resolved step action from qtestStepAction.
 */
function qtestTestTypeForStep(step, action) {
  switch (step.step_type) {
    case "reference_source":
    case "join":
    case "union_sources":
      return "Integration";
    case "create_column":
    case "format_field":
    case "split_field":
    case "sort_records":
    case "remove_duplicates":
      return "Data Validation";
  }
  if (action.kind === "display_text" || action.kind === "none") return "UAT";
  if (action.kind === "do_not_display") return "Negative";
  if (action.kind === "set_column") return "Data Validation";
  return "Design Validation";
}

// -----------------------------------------------------------------------------
// qTest scenario text
// -----------------------------------------------------------------------------
/**
 * Returns the generic qTest action steps for an audit.
 * @param {string} auditName - Name of the exported audit.
 */
function qtestDefaultActionSteps(auditName = "") {
  const audit = auditName ? `the ${auditName} audit` : "the audit";
  return [
    "1. Identify or stage the source record(s) needed for this scenario.",
    `2. Run or refresh ${audit} in ATLAS.`,
    "3. Search for the relevant record or organization.",
    "4. Review the ATLAS result and displayed source/enrichment fields.",
    "5. Compare the ATLAS result to the source records and document evidence.",
  ].join("\n");
}

/**
 * Builds the ATLAS and source-data expected outcomes for a logic step.
 * @param {any} step - Logic step object being read.
 * @param {any} action - Resolved step action from qtestStepAction.
 * @param {any} context - Audit name and, for ELSE steps, the ATLAS number of the IF step.
 */
function qtestExpectedOutcomes(step, action, { auditName, ifNumber }) {
  const params = step.params || {};
  const record = auditName ? `${auditName} audit record` : "audit record";
  const ifStep = ifNumber ? `ATLAS logic step ${ifNumber}` : "preceding IF";
  const isElse = step.step_type === "else";
  const condition = isElse ? "" : qtestConditionText(step);
  const conditionMet = isElse
    ? `the ${ifStep} condition is not met`
    : condition || "the condition for this step is met";
  const scope = isElse
    ? `records that do not meet the ${ifStep} condition`
    : "records that meet this condition";
  switch (step.step_type) {
    case "reference_source": {
      const file = quotePhraseValue(params.source_file || step.source || "");
      return [
        `The audit run loads source file ${file} with current data.`,
        `Source file ${file} is available, current, and contains the expected columns.`,
      ];
    }
    case "union_sources":
      return qtestUnionOutcomes(params, step);
    case "join": {
      if (phraseIsUnionJoinType(params.join_type))
        return qtestUnionOutcomes(params, step);
      const left = tableColumnPlain(
        params.left_source,
        params.left_alias,
        params.left_field,
      );
      const right = tableColumnPlain(
        params.right_source,
        params.right_alias,
        params.right_field,
      );
      return [
        `Records are matched where ${left} equals ${right}; joined values display on the ${record}.`,
        `Source values for ${left} and ${right} agree for each joined record.`,
      ];
    }
    case "create_column": {
      const name = quotePhraseValue(params.column_name || step.field || "");
      const blank =
        (params.value_mode === "Static value" || !params.value_mode) &&
        !String(params.static_value || "").trim();
      if (blank)
        return [
          `Column ${name} is added to the ${record} for later logic steps to populate.`,
          `Column ${name} is present in the output.`,
        ];
      return [
        `Column ${name} is created and populated as defined in this step.`,
        `Values in column ${name} reconcile to the source fields and rule in this step.`,
      ];
    }
    case "format_field": {
      const field = tableColumnPlain(
        params.source_file,
        params.source_alias,
        params.field_name,
      );
      return [
        `${field} displays in ${params.format || "the designed"} format.`,
        `The formatted ${field} value matches the underlying source value.`,
      ];
    }
    case "split_field": {
      const field = tableColumnPlain(
        params.source_file,
        params.source_alias,
        params.field_name,
      );
      const output = quotePhraseValue(params.output_column || "");
      return [
        `Column ${output} displays ${params.split_part || "the designed part"} of ${field}.`,
        `The ${output} value matches the corresponding part of the source ${field} value.`,
      ];
    }
    case "sort_records":
      return [
        "Audit records display in the sort order defined in this step.",
        "The displayed order agrees with the source values of the sort columns.",
      ];
    case "remove_duplicates":
      return [
        `Duplicate records are removed, ${atlasDuplicateKeepClause(params.duplicate_action)}.`,
        "Source data contains the duplicate records, and any retained record follows the rule in this step.",
      ];
  }

  if (action.kind === "display_text")
    return [
      `One ${record} is displayed with ${quotePhraseValue(action.outputColumn)} = ${quotePhraseValue(action.message)} for ${scope}.`,
      `Source data confirms ${conditionMet}.`,
    ];
  if (action.kind === "do_not_display")
    return [
      `No ${record} is displayed for ${scope}.`,
      `Source data confirms ${conditionMet}.`,
    ];
  if (action.kind === "set_column") {
    const target = quotePhraseValue(action.targetColumn);
    return [
      action.calculated || !action.valueField
        ? `Column ${target} displays the value calculated in this step for ${scope}.`
        : `Column ${target} displays the ${quotePhraseValue(action.valueField)} value for ${scope}.`,
      `The displayed ${target} value reconciles to the source values where ${conditionMet}.`,
    ];
  }
  if (action.kind === "none")
    return isElse
      ? [
          `Only records that do not meet the ${ifStep} condition are evaluated by the nested ELSE steps.`,
          `Source data confirms ${conditionMet}.`,
        ]
      : [
          "Only records that meet this condition are evaluated by the nested logic steps.",
          `Source data confirms which records meet ${condition || "this condition"}.`,
        ];
  return [
    `ATLAS behavior matches the approved design: ${action.text || analystLogic(step)}`,
    "Source data supports the designed outcome for this step.",
  ];
}

/**
 * Builds expected outcomes for a union step.
 * @param {any} params - Step params object.
 * @param {any} step - Logic step object being read.
 */
function qtestUnionOutcomes(params, step) {
  const left = quotePhraseValue(
    params.left_source || params.union_left_source || "",
  );
  const right = quotePhraseValue(
    params.right_source || params.union_right_source || "",
  );
  const output = quotePhraseValue(params.output_source || step.source || "");
  return [
    `Records from ${left} and ${right} are combined into ${output}.`,
    `The combined record count reconciles to the records in ${left} and ${right}.`,
  ];
}

/**
 * Returns the ATLAS number of the IF step an ELSE step answers: the nearest
 * preceding IF sibling, else an IF parent.
 * @param {any} entries - Hierarchy entries in logic order.
 * @param {number} index - Position of the ELSE entry.
 */
function qtestElseIfNumber(entries, index) {
  const { step } = entries[index];
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const candidate = entries[previous].step;
    if (candidate.id === step.parentId)
      return candidate.step_type === "if_then" ? entries[previous].number : "";
    if (
      (candidate.parentId || null) === (step.parentId || null) &&
      candidate.step_type === "if_then"
    )
      return entries[previous].number;
  }
  return "";
}

/**
 * Capitalizes the first letter of generated outcome text.
 * @param {string} text - Generated sentence.
 */
function qtestSentenceCase(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Converts enabled logic steps into qTest rows grouped by section.
 */
function qtestSectionsFromLogicSteps() {
  syncAutoReferenceSteps();
  const auditName = String(state.audit?.name || "").trim();
  const entries = hierarchicalStepEntries({ includeDisabled: false }).map(
    (entry) => ({ ...entry, action: qtestStepAction(entry.step) }),
  );
  const outputColumns = qtestOutputColumns(entries);
  const items = entries.map(({ step, action }, index) => {
    const [atlasExpectedOutcome, sourceDataExpectedOutcome] =
      qtestExpectedOutcomes(step, action, {
        auditName,
        ifNumber:
          step.step_type === "else" ? qtestElseIfNumber(entries, index) : "",
      }).map(qtestSentenceCase);
    return {
      section: qtestSectionForStep(step, action, outputColumns),
      row: {
        testType: qtestTestTypeForStep(step, action),
        testPurpose: "",
        sourceRule: analystLogic(step),
        testDataScenario: "",
        testActionSteps: qtestDefaultActionSteps(auditName),
        atlasExpectedOutcome,
        sourceDataExpectedOutcome,
        comments: String(step.notes || "").trim(),
      },
    };
  });
  let number = 0;
  return QTEST_SECTIONS.map(([code, title]) => ({
    code,
    title,
    rows: items
      .filter((item) => item.section === code)
      .map((item) => ({ ...item.row, number: (number += 1) })),
  })).filter((section) => section.rows.length);
}

// -----------------------------------------------------------------------------
// qTest UAT sheet writing
// -----------------------------------------------------------------------------
/**
 * Returns the title row text for an exported audit.
 * @param {string} auditName - Name of the exported audit.
 */
function qtestSheetTitle(auditName) {
  const audit = auditName ? ` - ${auditName}` : "";
  return `ATLAS Test Scenario Grid${audit}  |  Test / Design Draft`;
}

/**
 * Captures the template's section, scenario, and Pass/Fail highlight styles.
 * @param {any} sheet - qTest UAT worksheet.
 */
function qtestTemplateStyles(sheet) {
  const rowStyle = (rowNumber) => {
    const row = sheet.getRow(rowNumber);
    const cells = [];
    for (let column = 1; column <= QTEST_COLUMN_COUNT; column += 1)
      cells[column] = cloneExcelStyle(row.getCell(column).style);
    return { height: row.height, cells };
  };
  const rules = (sheet.conditionalFormattings || []).flatMap(
    (format) => format.rules || [],
  );
  const highlight = (value) =>
    cloneExcelStyle(
      rules.find(
        (rule) => rule.type === "cellIs" && rule.formulae?.[0] === `"${value}"`,
      )?.style,
    );
  return {
    section: rowStyle(QTEST_SECTION_STYLE_ROW),
    scenario: rowStyle(QTEST_FIRST_DATA_ROW),
    pass: highlight("Pass"),
    fail: highlight("Fail"),
  };
}

/**
 * Applies a captured row style.
 * @param {any} row - ExcelJS row.
 * @param {any} style - Row style from qtestTemplateStyles.
 */
function qtestApplyRowStyle(row, style) {
  row.height = style.height;
  for (let column = 1; column <= QTEST_COLUMN_COUNT; column += 1)
    row.getCell(column).style = cloneExcelStyle(style.cells[column]);
}

/**
 * Removes the template's sample scenarios, merges, dropdowns, and highlights.
 * @param {any} sheet - qTest UAT worksheet.
 */
function qtestClearSampleScenarios(sheet) {
  (sheet.model?.merges || []).forEach((range) => {
    const topRow = Number(String(range).match(/\d+/)?.[0] || 0);
    if (topRow >= QTEST_SECTION_STYLE_ROW) sheet.unMergeCells(range);
  });
  for (
    let rowNumber = QTEST_SECTION_STYLE_ROW;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    row.height = undefined;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }
  sheet.dataValidations.model = {};
  sheet.conditionalFormattings = [];
}

/**
 * Writes generated qTest sections and scenario rows to the UAT sheet.
 * @param {any} sheet - qTest UAT worksheet.
 * @param {any} sections - Sections from qtestSectionsFromLogicSteps.
 * @param {string} auditName - Name of the exported audit.
 */
function populateQtestUatSheet(sheet, sections, auditName) {
  const styles = qtestTemplateStyles(sheet);
  qtestClearSampleScenarios(sheet);
  sheet.getCell("A1").value = qtestSheetTitle(auditName);

  let rowNumber = QTEST_SECTION_STYLE_ROW;
  sections.forEach((section) => {
    const sectionRow = sheet.getRow(rowNumber);
    qtestApplyRowStyle(sectionRow, styles.section);
    sectionRow.getCell(1).value = `SECTION ${section.code}: ${section.title}`;
    sheet.mergeCells(rowNumber, 1, rowNumber, QTEST_COLUMN_COUNT);
    rowNumber += 1;

    section.rows.forEach((item) => {
      const row = sheet.getRow(rowNumber);
      qtestApplyRowStyle(row, styles.scenario);
      QTEST_COLUMN_KEYS.forEach((key, index) => {
        const value = item[key];
        row.getCell(index + 1).value =
          value === undefined || value === "" ? null : value;
      });
      QTEST_WRAPPED_COLUMNS.forEach((column) => {
        const cell = row.getCell(column);
        cell.alignment = {
          ...(cell.alignment || {}),
          wrapText: true,
          vertical: "top",
        };
      });
      [QTEST_ATLAS_PASS_FAIL_COLUMN, QTEST_DATA_PASS_FAIL_COLUMN].forEach(
        (column) => {
          row.getCell(column).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [QTEST_RESULT_OPTIONS],
          };
        },
      );
      rowNumber += 1;
    });
  });

  const lastRow = rowNumber - 1;
  const highlights = [
    ["Pass", styles.pass],
    ["Fail", styles.fail],
  ].filter(([, style]) => Object.keys(style).length);
  if (lastRow >= QTEST_FIRST_DATA_ROW && highlights.length) {
    const atlas = sheet.getColumn(QTEST_ATLAS_PASS_FAIL_COLUMN).letter;
    const data = sheet.getColumn(QTEST_DATA_PASS_FAIL_COLUMN).letter;
    sheet.addConditionalFormatting({
      ref: `${atlas}${QTEST_FIRST_DATA_ROW}:${atlas}${lastRow} ${data}${QTEST_FIRST_DATA_ROW}:${data}${lastRow}`,
      rules: highlights.map(([value, style], index) => ({
        type: "cellIs",
        operator: "equal",
        priority: index + 1,
        formulae: [`"${value}"`],
        style,
      })),
    });
  }
}

/**
 * Removes all workbook sheets except the qTest sheets.
 * @param {any} workbook - ExcelJS workbook object.
 */
function keepOnlyQtestSheets(workbook) {
  const keep = new Set([QTEST_GUIDE_SHEET, QTEST_UAT_SHEET]);
  [...workbook.worksheets].forEach((sheet) => {
    if (!keep.has(sheet.name)) workbook.removeWorksheet(sheet.id);
  });
}

// -----------------------------------------------------------------------------
// qTest export
// -----------------------------------------------------------------------------
/**
 * Builds the qTest workbook for the current audit.
 */
async function buildQtestWorkbook() {
  const workbook = await loadQtestTemplateWorkbook();
  workbook.creator = ATLAS_APP_NAME;
  workbook.modified = new Date();
  const guide = workbook.getWorksheet(QTEST_GUIDE_SHEET);
  const uat = workbook.getWorksheet(QTEST_UAT_SHEET);
  if (!guide || !uat)
    throw new Error(
      "Qtest template must contain Guide - Start Here and UAT - Disney3 sheets.",
    );
  keepOnlyQtestSheets(workbook);
  const auditName = String(state.audit?.name || "").trim();
  const sections = qtestSectionsFromLogicSteps();
  populateQtestUatSheet(uat, sections, auditName);
  return { workbook, scenarioCount: sections.flatMap((s) => s.rows).length };
}

/**
 * Builds the qTest workbook bytes and a completion message for the export.
 */
async function buildQtestExportFile() {
  const built = await buildQtestWorkbook();
  const count = built.scenarioCount;
  return {
    workbook: built.workbook,
    content: await built.workbook.xlsx.writeBuffer(),
    message: count
      ? `Qtest Excel exported with ${count} scenario${count === 1 ? "" : "s"}.`
      : "Qtest Excel exported without scenarios because this audit has no enabled logic steps. Add logic steps, then export again.",
    kind: count ? "ok" : "warn",
  };
}
