import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const TEMPLATE_URL = new URL(
  "../templates/qtest-test-design-template.xlsx",
  import.meta.url,
);
const CATALOG_URL = new URL(
  "../catalogs/logic_phrase_catalog.json",
  import.meta.url,
);

function step(id, stepType, params = {}, extra = {}) {
  return {
    id,
    enabled: true,
    parentId: null,
    branchType: "root",
    step_type: stepType,
    notes: "",
    conditions: [],
    params,
    ...extra,
  };
}

function condition(fieldName, operator, compareValue, sourceFile = "wd.org") {
  return {
    connector: "IF",
    conditionType: "row_compare",
    sourceFile,
    sourceAlias: sourceFile,
    fieldName,
    operator,
    valueMode: "values",
    compareValue,
  };
}

function ifThen(id, conditions, params = {}, extra = {}) {
  return step(
    id,
    "if_then",
    { conditions_json: JSON.stringify(conditions), ...params },
    extra,
  );
}

function managementChainAudit() {
  const steps = [
    step("ref-wd", "reference_source", { source_file: "wd.org" }),
    step("join", "join", {
      join_type: "LEFT JOIN",
      left_source: "wd.org",
      left_alias: "wd.org",
      left_field: "Supervisory Org Ref ID",
      right_source: "sap.hrp1001",
      right_alias: "sap.hrp1001",
      right_field: "OBJID",
    }),
    ifThen(
      "exclude",
      [condition("Inactive", "is equal to", "Yes")],
      { then_action_type: "do_not_display" },
      { notes: "  Exclude inactive orgs.  " },
    ),
    ifThen(
      "mismatch",
      [condition("Superior Org Ref ID", "is not equal to", "SOBID")],
      {
        then_action_type: "display_text",
        then_text: "Supervisory Org Mismatch",
        then_output_column: "Error Message",
      },
    ),
    ifThen("dnu", [condition("Supervisory Org Name", "starts with", "DNU_")], {
      then_action_type: "display_text",
      then_text: "Research - DNU Supervisory Org",
      then_output_column: "Error Message",
    }),
    step(
      "else-dnu",
      "else",
      { then_action_type: "do_not_display" },
      { branchType: "else" },
    ),
    step("country", "create_column", {
      column_name: "Country Code",
      value_mode: "Source field value",
      source_file: "sap.org",
      source_alias: "sap.org",
      field_name: "Country",
    }),
    ifThen("suppress", [condition("Error Message", "is blank/null", "", "")], {
      then_action_type: "do_not_display",
    }),
    step("freeform", "if_then", {
      then_action_type: "freeform",
      then_action: "Route unchanged records to the legacy workflow",
    }),
    step(
      "disabled",
      "create_column",
      { column_name: "Hidden" },
      {
        enabled: false,
      },
    ),
  ];
  steps.forEach((item, index) => (item.sortOrder = index + 1));
  return { id: "audit-1", name: "Management Chain (NAA)", steps };
}

async function runExport(audit) {
  const downloads = [];
  const statuses = [];
  const sandbox = {
    console,
    JSON,
    Map,
    Set,
    ExcelJS,
    ATLAS_APP_NAME: "ATLAS Align",
    ATLAS_STRING_TRANSFORM_VALUE_MODE: "String transformation",
    state: { audit },
    e: {},
    capture() {},
    status: (message, kind) => statuses.push([message, kind]),
    syncAutoReferenceSteps() {},
    atlasDisplayDocument: () => null,
    atlasEnsureExcelJs: async () => {},
    normalizeCatalogStep: (item) => item,
    parseSourceMathOperations: () => [],
    sourceAliasFor: (sourceFile) => sourceFile,
    uid: (prefix) => `${prefix}_test`,
    today: () => "2026-10-28",
    downloadBlob: (name, buffer) => downloads.push({ name, buffer }),
    async fetch(url) {
      const target = String(url).includes("logic_phrase_catalog")
        ? CATALOG_URL
        : TEMPLATE_URL;
      const bytes = readFileSync(target);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        json: async () => JSON.parse(bytes.toString("utf8")),
      };
    },
  };
  vm.createContext(sandbox);
  for (const file of [
    "02-hierarchy.js",
    "07-phrase-catalog.js",
    "12-export-foundation.js",
  ])
    vm.runInContext(
      readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8"),
      sandbox,
      { filename: file },
    );
  await vm.runInContext("initPhraseCatalog()", sandbox);
  await vm.runInContext("exportQtestExcel()", sandbox);
  assert.equal(downloads.length, 1, JSON.stringify(statuses));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(downloads[0].buffer);
  return { workbook, download: downloads[0], statuses };
}

function sheetRows(sheet) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    const values = [];
    for (let column = 1; column <= 15; column += 1)
      values.push(row.getCell(column).value ?? null);
    rows[number] = values;
  });
  return rows;
}

let exported;
let template;
test.before(async () => {
  exported = await runExport(managementChainAudit());
  template = new ExcelJS.Workbook();
  await template.xlsx.readFile(TEMPLATE_URL.pathname);
});

test("Qtest export keeps only the two template sheets", () => {
  assert.deepEqual(
    exported.workbook.worksheets.map((sheet) => sheet.name),
    ["Guide - Start Here", "UAT - Disney3"],
  );
  assert.equal(
    exported.download.name,
    "Management_Chain_NAA__qtest_template_2026-10-28.xlsx",
  );
});

test("Guide sheet exports exactly as the template", () => {
  const actual = exported.workbook.getWorksheet("Guide - Start Here");
  const expected = template.getWorksheet("Guide - Start Here");
  assert.deepEqual(sheetRows(actual), sheetRows(expected));
  assert.equal(actual.rowCount, expected.rowCount);
  expected.eachRow({ includeEmpty: true }, (row, number) => {
    assert.equal(actual.getRow(number).height, row.height, `row ${number}`);
    row.eachCell({ includeEmpty: true }, (cell, column) =>
      assert.deepEqual(
        actual.getRow(number).getCell(column).style,
        cell.style,
        `${cell.address} style`,
      ),
    );
  });
  assert.deepEqual(
    actual.columns.map((column) => column.width),
    expected.columns.map((column) => column.width),
  );
  assert.deepEqual(actual.model.merges.sort(), expected.model.merges.sort());
});

test("UAT title and headers name the exported audit", () => {
  const sheet = exported.workbook.getWorksheet("UAT - Disney3");
  assert.equal(
    sheet.getCell("A1").value,
    "ATLAS Test Scenario Grid - Management Chain (NAA)  |  Test / Design Draft",
  );
  const templateSheet = template.getWorksheet("UAT - Disney3");
  for (const row of [2, 3])
    assert.deepEqual(sheetRows(sheet)[row], sheetRows(templateSheet)[row]);
});

test("UAT scenarios are grouped into lettered sections with sequential numbers", () => {
  const sheet = exported.workbook.getWorksheet("UAT - Disney3");
  const rows = sheetRows(sheet).slice(4).filter(Boolean);
  const layout = rows.map((row) =>
    typeof row[0] === "string" ? row[0] : [row[0], row[1], row[3].slice(0, 30)],
  );
  assert.deepEqual(layout, [
    "SECTION A: Core Comparison Logic - Expected Match and Mismatch Results",
    [1, "UAT", 'IF file "wd.org" column "Super'],
    "SECTION B: Record Exclusions and Source Filters",
    [2, "Negative", 'IF file "wd.org" column "Inact'],
    [3, "Negative", "ELSE do not display record."],
    "SECTION C: Research Error Classification",
    [4, "UAT", 'IF file "wd.org" column "Super'],
    "SECTION D: Enrichment, Regionalization and Display Fields",
    [5, "Integration", 'Join file "wd.org" column "Sup'],
    [6, "Data Validation", 'Create new column "Country Cod'],
    "SECTION E: Output Suppression and Data Quality",
    [7, "Negative", 'IF column "Error Message" is b'],
    "SECTION F: Legacy Workflow / ATLAS Design Decisions",
    [8, "Design Validation", "IF THEN Route unchanged record"],
    "SECTION G: End-to-End, Refresh and Regression Validation",
    [9, "Integration", 'Reference source file "wd.org"'],
  ]);
  assert.ok(
    !rows.some((row) => String(row[3] || "").includes("Hidden")),
    "disabled steps are not exported",
  );
  const sectionRows = [];
  sheet.eachRow((row, number) => {
    if (String(row.getCell(1).value).startsWith("SECTION "))
      sectionRows.push(number);
  });
  sectionRows.forEach((number) =>
    assert.ok(sheet.model.merges.includes(`A${number}:O${number}`)),
  );
});

test("UAT columns carry logic text, generated outcomes, and manual notes only", () => {
  const sheet = exported.workbook.getWorksheet("UAT - Disney3");
  const byNumber = new Map(
    sheetRows(sheet)
      .filter((row) => row && typeof row[0] === "number")
      .map((row) => [row[0], row]),
  );
  const mismatch = byNumber.get(1);
  assert.equal(mismatch[2], null, "C Test Purpose stays blank");
  assert.equal(mismatch[4], null, "E Test Data / Scenario stays blank");
  assert.match(mismatch[5], /^1\. Identify/);
  assert.match(
    mismatch[5],
    /2\. Run or refresh the Management Chain \(NAA\) audit in ATLAS\./,
  );
  assert.equal(
    mismatch[6],
    'One Management Chain (NAA) audit record is displayed with "Error Message" = "Supervisory Org Mismatch" for records that meet this condition.',
  );
  assert.match(mismatch[7], /^Source data confirms file "wd\.org" column/);
  assert.deepEqual(mismatch.slice(8, 14), [null, null, null, null, null, null]);
  assert.equal(mismatch[14], null, "steps without manual notes stay blank");

  const exclusion = byNumber.get(2);
  assert.equal(exclusion[14], "Exclude inactive orgs.");
  assert.equal(
    exclusion[6],
    "No Management Chain (NAA) audit record is displayed for records that meet this condition.",
  );
  const elseRow = byNumber.get(3);
  assert.match(elseRow[6], /do not meet the ATLAS logic step 6 condition/);
});

test("UAT result columns have Pass/Fail dropdowns only on scenario rows", () => {
  const sheet = exported.workbook.getWorksheet("UAT - Disney3");
  sheet.eachRow((row) => {
    const isScenario = typeof row.getCell(1).value === "number";
    for (const column of [12, 14]) {
      const validation = row.getCell(column).dataValidation;
      if (isScenario)
        assert.deepEqual(validation?.formulae, ['"Pass,Fail,Blocked,N/A"']);
      else assert.equal(validation, undefined);
    }
  });
  assert.equal(sheet.conditionalFormattings.length, 1);
  assert.equal(sheet.conditionalFormattings[0].ref, "L5:L19 N5:N19");
});

test("Qtest export warns when the audit has no enabled logic steps", async () => {
  const { workbook, statuses } = await runExport({ name: "Empty", steps: [] });
  const sheet = workbook.getWorksheet("UAT - Disney3");
  assert.equal(sheet.actualRowCount, 3);
  assert.equal(statuses.at(-1)[1], "warn");
});
