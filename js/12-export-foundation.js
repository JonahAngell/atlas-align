/**
 * 12-export-foundation.js
 *
 * Export utilities for current audit outputs, including Excel, HTML, clipboard HTML, and qTest template generation.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Shared export row helpers
// -----------------------------------------------------------------------------
/**
 * Builds export rows from preview rows.
 */
function auditExportRows() {
  const includeNotes = !!e.includeNotes?.checked;
  return previewRows().map((row) => ({
    Step: row.step,
    Branch: row.branch,
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
/**
 * Exports the current audit to an Excel workbook.
 */
async function exportAuditExcel() {
  capture();
  try {
    await atlasEnsureExcelJs();
  } catch {
    return status(
      "The Excel library could not load. Check your connection, then export again.",
      "bad",
    );
  }
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
    { header: "Branch", key: "Branch", width: 14 },
    { header: "Analyst Logic", key: "Analyst Logic", width: 80 },
    { header: "Developer Logic", key: "Developer Logic", width: 40 },
    { header: "Notes", key: "Notes", width: 60 },
  ];
  auditExportRows().forEach((row) => logic.addRow(row));
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
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    `${safeFileName(state.audit.name)}_audit_logic_${today()}.xlsx`,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  status("Excel table view exported.", "ok");
}

// -----------------------------------------------------------------------------
// HTML export
// -----------------------------------------------------------------------------
/**
 * Builds Confluence-friendly HTML for the current audit.
 */
function auditHtmlCell(value) {
  return esc(value).replace(/\n/g, "<br>");
}

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
        `<tr><td>${auditHtmlCell(row.Step)}</td><td>${auditHtmlCell(row.Branch)}</td><td>${auditHtmlCell(row["Analyst Logic"])}</td><td>${auditHtmlCell(row["Developer Logic"])}</td><td>${auditHtmlCell(row.Notes)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(state.audit.name)} Audit Requirements</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#172b4d}h2{margin-top:32px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9e2ef;padding:8px;vertical-align:top;text-align:left}th{background:#0747a6;color:#fff}td{white-space:normal}</style></head><body><h1>${esc(state.audit.name)}</h1><p>${esc(state.audit.purpose || "")}</p><h2>Fields</h2><table><thead><tr><th aria-label="Row number"></th><th>Unique ID</th><th>Field Title</th><th>Vanity Label</th><th>Display Format</th><th>Data Category</th><th>Display</th><th>Notes</th></tr></thead><tbody>${fieldRows}</tbody></table><h2>Audit Logic</h2><table><thead><tr><th>Step</th><th>Branch</th><th>Analyst Logic</th><th>Developer Logic</th><th>Notes</th></tr></thead><tbody>${logicRows}</tbody></table></body></html>`;
}
/**
 * Downloads the audit HTML document.
 */
function exportAuditHtml() {
  capture();
  downloadBlob(
    `${safeFileName(state.audit.name)}_confluence_${today()}.html`,
    auditHtmlDocument(),
    "text/html",
  );
  status("Confluence-friendly HTML exported.", "ok");
}
/**
 * Copies the audit HTML document to the clipboard.
 */
async function copyAuditHtml() {
  capture();
  const html = auditHtmlDocument();
  try {
    await navigator.clipboard?.writeText(html);
    status("Confluence-friendly HTML copied to clipboard.", "ok");
  } catch {
    status(
      "Clipboard copy failed. Use Download Confluence HTML instead.",
      "warn",
    );
  }
}

// -----------------------------------------------------------------------------
// qTest template constants
// -----------------------------------------------------------------------------
const QTEST_TEMPLATE_PATH = "./templates/qtest-test-design-template.xlsx";
const QTEST_GUIDE_SHEET = "Guide - Start Here";
const QTEST_UAT_SHEET = "UAT - Disney3";
const QTEST_FIRST_DATA_ROW = 5;

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

/**
 * Loads the qTest Excel template workbook.
 */
async function loadQtestTemplateWorkbook() {
  try {
    await atlasEnsureExcelJs();
  } catch {
    status(
      "The Excel library could not load. Check your connection, then export again.",
      "bad",
    );
    return null;
  }
  const response = await fetch(QTEST_TEMPLATE_PATH);
  if (!response.ok)
    throw new Error(
      `Could not load Qtest template workbook: ${response.status}`,
    );
  const buffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

/**
 * Classifies a qTest row type from preview data.
 * @param {any} row - ExcelJS row or preview row object.
 */
function qtestTestTypeForRow(row) {
  const branch = String(row.branch || "").toLowerCase();
  if (branch.includes("else")) return "Negative";
  if (row.developer) return "Integration";
  return "UAT";
}

/**
 * Builds the qTest Source/Rule field value.
 * @param {any} row - ExcelJS row or preview row object.
 */
function qtestSourceRuleForRow(row) {
  return (
    [row.source, row.developer].filter(Boolean).join(" | ") || row.branch || ""
  );
}

/**
 * Builds the qTest scenario field value.
 * @param {any} row - ExcelJS row or preview row object.
 */
function qtestScenarioForRow(row) {
  return row.notes || row.analyst || "";
}

/**
 * Returns default qTest action steps.
 */
function qtestDefaultActionSteps() {
  return [
    "1. Identify or stage the source record(s) needed for this scenario.",
    "2. Run or refresh the audit in ATLAS.",
    "3. Search for the relevant record or organization.",
    "4. Review the ATLAS result and displayed source/enrichment fields.",
    "5. Compare the ATLAS result to the source records and document evidence.",
  ].join("\n");
}

/**
 * Builds the ATLAS expected outcome.
 * @param {any} row - ExcelJS row or preview row object.
 */
function qtestAtlasExpectedOutcomeForRow(row) {
  return row.analyst || "";
}

/**
 * Builds the source-data expected outcome.
 * @param {any} row - ExcelJS row or preview row object.
 */
function qtestSourceExpectedOutcomeForRow(row) {
  return row.developer || row.notes || "";
}

/**
 * Converts preview rows into qTest rows.
 */
function qtestRowsFromLogicSteps() {
  capture();
  return previewRows().map((row, index) => ({
    number: index + 1,
    testType: qtestTestTypeForRow(row),
    testPurpose: row.analyst || "",
    sourceRule: qtestSourceRuleForRow(row),
    testDataScenario: qtestScenarioForRow(row),
    testActionSteps: qtestDefaultActionSteps(),
    atlasExpectedOutcome: qtestAtlasExpectedOutcomeForRow(row),
    sourceDataExpectedOutcome: qtestSourceExpectedOutcomeForRow(row),
    testRecordOrg: "",
    tester: "",
    atlasObservedOutcome: "",
    atlasPassFail: "",
    dataValidationObserved: "",
    dataPassFail: "",
    comments: row.notes || "",
  }));
}

/**
 * Copies ExcelJS row/cell styling.
 * @param {any} sourceRow - Input used by copyRowStyle.
 * @param {any} targetRow - Input used by copyRowStyle.
 * @param {any} columnCount - Input used by copyRowStyle.
 */
function copyRowStyle(sourceRow, targetRow, columnCount = 15) {
  targetRow.height = sourceRow.height;
  for (let column = 1; column <= columnCount; column += 1) {
    const sourceCell = sourceRow.getCell(column);
    const targetCell = targetRow.getCell(column);
    targetCell.style = cloneExcelStyle(sourceCell.style);
    targetCell.numFmt = sourceCell.numFmt;
    targetCell.alignment = cloneExcelStyle(sourceCell.alignment);
    targetCell.border = cloneExcelStyle(sourceCell.border);
    targetCell.fill = cloneExcelStyle(sourceCell.fill);
    targetCell.font = cloneExcelStyle(sourceCell.font);
    targetCell.protection = cloneExcelStyle(sourceCell.protection);
  }
}

/**
 * Clears and prepares the qTest UAT sheet.
 * @param {any} sheet - Input used by resetQtestUatSampleContent.
 */
function resetQtestUatSampleContent(sheet) {
  const sectionStyleRow = sheet.getRow(4);
  const dataStyleRow = sheet.getRow(QTEST_FIRST_DATA_ROW);
  const sectionStyle = [];
  const dataStyle = [];
  for (let column = 1; column <= 15; column += 1) {
    sectionStyle[column] = cloneExcelStyle(
      sectionStyleRow.getCell(column).style,
    );
    dataStyle[column] = cloneExcelStyle(dataStyleRow.getCell(column).style);
  }
  const sectionHeight = sectionStyleRow.height;
  const dataHeight = dataStyleRow.height;

  const mergeRanges = sheet.model?.merges
    ? [...sheet.model.merges]
    : Object.keys(sheet._merges || {});
  mergeRanges.forEach((range) => {
    const topRow = Number(String(range).match(/\d+/)?.[0] || 0);
    if (topRow >= 4) sheet.unMergeCells(range);
  });

  for (
    let rowNumber = 4;
    rowNumber <= Math.max(sheet.rowCount, QTEST_FIRST_DATA_ROW);
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= 15; column += 1)
      row.getCell(column).value = null;
  }

  sheet.mergeCells("A4:O4");
  const row4 = sheet.getRow(4);
  row4.height = sectionHeight;
  for (let column = 1; column <= 15; column += 1)
    row4.getCell(column).style = cloneExcelStyle(sectionStyle[column]);
  row4.getCell(1).value = "SECTION A: Generated ATLAS Logic Steps";

  const row5 = sheet.getRow(QTEST_FIRST_DATA_ROW);
  row5.height = dataHeight;
  for (let column = 1; column <= 15; column += 1)
    row5.getCell(column).style = cloneExcelStyle(dataStyle[column]);
}

/**
 * Writes generated qTest rows to the UAT sheet.
 * @param {any} sheet - Input used by populateQtestUatSheet.
 * @param {any} rows - Input used by populateQtestUatSheet.
 */
function populateQtestUatSheet(sheet, rows) {
  resetQtestUatSampleContent(sheet);
  const styleSourceRow = sheet.getRow(QTEST_FIRST_DATA_ROW);
  rows.forEach((item, index) => {
    const rowNumber = QTEST_FIRST_DATA_ROW + index;
    const row = sheet.getRow(rowNumber);
    copyRowStyle(styleSourceRow, row, 15);
    row.values = [
      null,
      item.number,
      item.testType,
      item.testPurpose,
      item.sourceRule,
      item.testDataScenario,
      item.testActionSteps,
      item.atlasExpectedOutcome,
      item.sourceDataExpectedOutcome,
      item.testRecordOrg,
      item.tester,
      item.atlasObservedOutcome,
      item.atlasPassFail,
      item.dataValidationObserved,
      item.dataPassFail,
      item.comments,
    ];
    [3, 4, 5, 6, 7, 8, 11, 13, 15].forEach((column) => {
      row.getCell(column).alignment = {
        ...(row.getCell(column).alignment || {}),
        wrapText: true,
        vertical: "top",
      };
    });
    row.commit?.();
  });
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
 * Exports the qTest workbook populated from current logic.
 */
async function exportQtestExcel() {
  capture();
  const workbook = await loadQtestTemplateWorkbook();
  if (!workbook) return;
  workbook.creator = ATLAS_APP_NAME;
  workbook.modified = new Date();
  const guide = workbook.getWorksheet(QTEST_GUIDE_SHEET);
  const uat = workbook.getWorksheet(QTEST_UAT_SHEET);
  if (!guide || !uat)
    throw new Error(
      "Qtest template must contain Guide - Start Here and UAT - Disney3 sheets.",
    );
  keepOnlyQtestSheets(workbook);
  populateQtestUatSheet(uat, qtestRowsFromLogicSteps());
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    `${safeFileName(state.audit.name)}_qtest_template_${today()}.xlsx`,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  status("Qtest Excel template exported.", "ok");
}
