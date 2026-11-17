import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { STEP_TYPE_SCRIPTS } from "./support/step-type-scripts.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/**
 * Loads the Developer Logic formulas and the code export builders with a
 * stubbed audit. Steps with a parentId are listed after their parent.
 */
function load({
  steps = [],
  sources = [],
  fields = {},
  name = "Pay Audit",
} = {}) {
  let next = 0;
  const context = {
    state: { audit: { name, sources, steps, fields: [] } },
    uid: (prefix) => `${prefix}_${++next}`,
    sourceAliasFor: (source) => source,
    fieldsForSource: (source) => fields[source] || [],
    document: { querySelector: () => null, querySelectorAll: () => [] },
    console,
  };
  vm.createContext(context);
  for (const file of [
    "js/07-phrase-catalog.js",
    "js/02-logic-rendering.js",
    "js/02b-developer-formulas.js",
    ...STEP_TYPE_SCRIPTS,
    "js/12b-code-export.js",
  ])
    vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  const numbers = new Map();
  const entries = [];
  const visit = (parentId, prefix) =>
    steps
      .filter((step) => (step.parentId || null) === parentId)
      .filter((step) => step.enabled !== false)
      .forEach((step, index) => {
        const number = [...prefix, index + 1].join(".");
        numbers.set(step.id, number);
        entries.push({
          step,
          number,
          level: prefix.length,
          branchLabel: parentId ? "THEN" : "Root",
        });
        visit(step.id, [...prefix, index + 1]);
      });
  visit(null, []);
  Object.assign(context, {
    hierarchicalStepEntries: () => entries.map((entry) => ({ ...entry })),
    stepNumberFor: (id) => numbers.get(id) || "",
    analystLogic: (step) => `Analyst logic for ${step.id}`,
    today: () => "2026-11-16",
  });
  return context;
}

const condition = (fieldName, operator, compareValue) => ({
  connector: "IF",
  sourceFile: "wd",
  sourceAlias: "wd",
  fieldName,
  operator,
  valueMode: "values",
  compareValue,
});

const ifStep = (id, conditions, params) => ({
  id,
  step_type: "if_then",
  params: { conditions_json: JSON.stringify(conditions), ...params },
});

const wdFields = {
  wd: [{ fieldName: "ID" }, { fieldName: "Status" }, { fieldName: "Pay" }],
  sap: [{ fieldName: "PERNR" }, { fieldName: "Status" }],
};

const auditSteps = () => [
  { id: "ref", step_type: "reference_source", params: { source_file: "wd" } },
  {
    id: "msg",
    step_type: "if_then",
    params: {
      conditions_json: JSON.stringify([
        condition("Status", "is equal to", "T"),
      ]),
      then_action_type: "display_text",
      then_text: "Terminated",
      then_output_column: "Error Message",
    },
  },
  {
    id: "fmt",
    step_type: "format_field",
    params: {
      source_file: "wd",
      field_name: "ID",
      format: "eight digits with leading zeroes",
    },
  },
  {
    id: "sort",
    step_type: "sort_records",
    params: {
      source_file: "wd",
      sort_fields_json: JSON.stringify([
        { sourceFile: "wd", fieldName: "Pay", direction: "Descending" },
      ]),
    },
  },
  {
    id: "dupe",
    step_type: "remove_duplicates",
    params: {
      source_file: "wd",
      duplicate_fields_json: JSON.stringify([
        { sourceFile: "wd", fieldName: "ID" },
      ]),
      duplicate_action: "Keep first record",
    },
  },
  ifStep("keep", [condition("Pay", "is greater than", "0")], {
    then_action_type: "display",
  }),
  {
    id: "off",
    enabled: false,
    step_type: "format_field",
    params: { field_name: "Pay", format: "number" },
  },
];

test("SQL export chains one CTE per step and ends in the final SELECT", () => {
  const ctx = load({
    steps: auditSteps(),
    sources: [{ name: "wd", alias: "wd" }],
    fields: wdFields,
  });
  const sql = ctx.buildAuditSqlScript();
  assert.match(sql, /^-- Pay Audit - SQL Server audit query\n/);
  assert.match(
    sql,
    /-- Exported from ATLAS Align on 2026-11-16\. 6 enabled steps/,
  );
  assert.match(
    sql,
    /\nWITH\n-- Step 1\n-- Analyst logic for ref\nstep_1 AS \(\n  SELECT \* FROM \[wd\] AS \[wd\]\n\)/,
  );
  // The first message on a new column starts from NULL instead of the column.
  assert.match(
    sql,
    /step_2 AS \(\n  SELECT \*, CASE WHEN \[Status\] = 'T' THEN CONCAT_WS\('\|\|', NULLIF\(CAST\(NULL AS NVARCHAR\(4000\)\), ''\), 'Terminated'\) ELSE CAST\(NULL AS NVARCHAR\(4000\)\) END AS \[Error Message\]\n  FROM step_1\n\)/,
  );
  // Overwriting an existing column lists the columns so it is not selected twice.
  assert.match(
    sql,
    /step_3 AS \(\n  SELECT RIGHT\(REPLICATE\('0', 8\) \+ CAST\(\[ID\] AS VARCHAR\(50\)\), 8\) AS \[ID\],\n         \[Status\],\n         \[Pay\],\n         \[Error Message\]\n  FROM step_2\n\)/,
  );
  // Sort feeds the duplicate rank and the final ORDER BY.
  assert.match(
    sql,
    /ROW_NUMBER\(\) OVER \(PARTITION BY \[ID\] ORDER BY \[Pay\] DESC\) AS \[Duplicate Rank\]/,
  );
  assert.match(
    sql,
    /step_5 AS \(\n  SELECT \[ID\],\n         \[Status\],\n         \[Pay\],\n         \[Error Message\]\n  FROM step_5_ranked\n  WHERE \[Duplicate Rank\] = 1\n\)/,
  );
  assert.match(
    sql,
    /step_6 AS \(\n  SELECT \*\n  FROM step_5\n  WHERE \[Pay\] > 0\n\)\n\nSELECT \*\nFROM step_6\nORDER BY \[Pay\] DESC;\n$/,
  );
  assert.doesNotMatch(sql, /off|TODO/);
  assert.match(sql, /Source tables[^\n]*\n--   - \[wd\]/);
});

test("SQL export starts from the first step's source and keeps rows' old values", () => {
  const ctx = load({
    steps: [
      ifStep("set", [condition("Status", "is equal to", "A")], {
        then_action_type: "set_column_value",
        then_target_column: "Pay",
        then_value_field: "ID",
      }),
    ],
    sources: [{ name: "wd", alias: "wd" }],
    fields: wdFields,
  });
  const sql = ctx.buildAuditSqlScript();
  assert.match(
    sql,
    /-- Source data: wd\nsource_data AS \(\n  SELECT \* FROM \[wd\] AS \[wd\]\n\)/,
  );
  assert.match(
    sql,
    /CASE WHEN \[Status\] = 'A' THEN \[ID\] ELSE \[Pay\] END AS \[Pay\]/,
  );
  assert.match(sql, /FROM source_data\n/);
});

test("SQL join reads the previous step and renames clashing right columns", () => {
  const ctx = load({
    steps: [
      {
        id: "ref",
        step_type: "reference_source",
        params: { source_file: "wd" },
      },
      {
        id: "join",
        step_type: "join",
        params: {
          join_type: "LEFT JOIN",
          left_source: "wd",
          right_source: "sap",
          left_field: "ID",
          right_field: "PERNR",
        },
      },
      {
        id: "flag",
        step_type: "if_then",
        params: {
          conditions_json: JSON.stringify([
            {
              ...condition("Status", "is not equal to", "A"),
              sourceFile: "sap",
              sourceAlias: "sap",
            },
          ]),
          then_action_type: "do_not_display",
        },
      },
    ],
    sources: [
      { name: "wd", alias: "wd" },
      { name: "sap", alias: "sap" },
    ],
    fields: wdFields,
  });
  const sql = ctx.buildAuditSqlScript();
  assert.match(
    sql,
    /step_2 AS \(\n  SELECT \[wd\]\.\*,\n         \[sap\]\.\[PERNR\],\n         \[sap\]\.\[Status\] AS \[Status_sap\]\n  FROM step_1 AS \[wd\]\n  LEFT JOIN \[sap\] AS \[sap\]\n    ON \[wd\]\.\[ID\] = \[sap\]\.\[PERNR\]\n\)/,
  );
  // [sap].[Status] now means the renamed column of the joined data.
  assert.match(sql, /WHERE NOT \(\[Status_sap\] <> 'A'\)/);
});

test("steps that cannot become code are skipped as TODOs and listed in the header", () => {
  const ctx = load({
    steps: [
      {
        id: "ref",
        step_type: "reference_source",
        params: { source_file: "wd" },
      },
      ifStep("free", [condition("Status", "is equal to", "T")], {
        then_action_type: "freeform",
        then_action: "Email the manager",
      }),
      {
        id: "blank",
        step_type: "format_field",
        params: { source_file: "wd", format: "number" },
      },
      {
        id: "keep",
        step_type: "format_field",
        params: { source_file: "wd", field_name: "Pay", format: "number" },
      },
    ],
    sources: [{ name: "wd", alias: "wd" }],
    fields: wdFields,
  });
  const sql = ctx.buildAuditSqlScript();
  assert.match(
    sql,
    /-- TODO: 2 steps could not be converted and are skipped below:/,
  );
  assert.match(
    sql,
    /--   - Step 2: THEN action is free text and is not in the formulas: Email the manager/,
  );
  assert.match(sql, /--   - Step 3: Missing values?: \[field\]/);
  assert.match(
    sql,
    /-- TODO \(skipped\) Step 2\n-- Analyst logic for free\n-- Reason: /,
  );
  // Skipped steps leave the chain intact: step 4 reads step 1.
  assert.match(
    sql,
    /\[Status\],\n         TRY_CAST\(\[Pay\] AS DECIMAL\(38, 10\)\) AS \[Pay\]\n  FROM step_1\n\)/,
  );

  const py = ctx.buildAuditPythonScript();
  assert.match(py, /# TODO: 2 steps could not be converted/);
  assert.match(py, /    # TODO \(skipped\) Step 2\n/);
  assert.match(py, /    # mask = df\["Status"\] == "T"/);
  assert.match(
    py,
    /    df\["Pay"\] = pd\.to_numeric\(df\["Pay"\], errors="coerce"\)/,
  );
});

test("Python export lists the required paths and runs the steps in order", () => {
  const ctx = load({
    steps: auditSteps(),
    sources: [{ name: "wd", alias: "wd", sourceFile: "Workday Workers.csv" }],
    fields: wdFields,
  });
  const py = ctx.buildAuditPythonScript();
  assert.match(py, /^# Pay Audit - Python \(pandas\) audit script\n/);
  assert.match(
    py,
    /\nSOURCE_PATHS = \{\n    "wd": "",\n\}\n\n# File to write the audit results to \(\.csv or \.xlsx\)\.\nOUTPUT_PATH = ""\n/,
  );
  assert.match(
    py,
    /def run_audit\(sources\):\n    """Runs the audit steps in order and returns the results\."""\n    # Step 1\n    # Analyst logic for ref\n    df = sources\["wd"\]\.copy\(\)/,
  );
  const order = [
    "Analyst logic for msg",
    "Analyst logic for fmt",
    "Analyst logic for sort",
    "Analyst logic for dupe",
    "Analyst logic for keep",
  ];
  const positions = order.map((text) => py.indexOf(text));
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
  );
  assert.ok(positions.every((position) => position > 0));
  assert.match(py, /    df = df\[mask\]\n\n    return df\n/);
  assert.match(py, /write_output\(results, OUTPUT_PATH\)/);
  assert.doesNotMatch(py, /off|TODO/);
});

test("Python join merges onto the current data with a suffix for clashes", () => {
  const ctx = load({
    steps: [
      {
        id: "fmt",
        step_type: "format_field",
        params: { source_file: "wd", field_name: "ID", format: "text" },
      },
      {
        id: "join",
        step_type: "join",
        params: {
          join_type: "INNER JOIN",
          left_source: "wd",
          right_source: "sap",
          left_field: "ID",
          right_field: "PERNR",
        },
      },
    ],
    sources: [
      { name: "wd", alias: "wd" },
      { name: "sap", alias: "sap" },
    ],
  });
  const py = ctx.buildAuditPythonScript();
  assert.match(py, /    # Source data: wd\n    df = sources\["wd"\]\.copy\(\)/);
  assert.match(
    py,
    /    df = df\.merge\(sources\["sap"\], how="inner", left_on="ID", right_on="PERNR", suffixes=\("", "_sap"\)\)/,
  );
  assert.match(py, /SOURCE_PATHS = \{\n    "wd": "",\n    "sap": "",\n\}/);
});

test("an audit with no steps still gives a valid starting script", () => {
  const ctx = load({ sources: [{ name: "wd", alias: "wd" }] });
  assert.match(
    ctx.buildAuditSqlScript(),
    /source_data AS \(\n  SELECT \* FROM \[wd\] AS \[wd\]\n\)\n\nSELECT \*\nFROM source_data;\n$/,
  );
  const py = ctx.buildAuditPythonScript();
  assert.match(
    py,
    /# The audit has no enabled steps yet\.\n\n    return pd\.DataFrame\(\)/,
  );
  assert.match(py, /# The audit logic does not read any source yet\./);
});
