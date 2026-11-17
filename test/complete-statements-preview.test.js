import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadStepTypeScripts } from "./support/step-type-scripts.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const renderingSource = read("js/02-logic-rendering.js");

/** Extracts one top-level function declaration from 02-logic-rendering.js. */
function declaration(name) {
  const start = renderingSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} declaration should exist`);
  const bodyStart = renderingSource.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < renderingSource.length; index += 1) {
    if (renderingSource[index] === "{") depth += 1;
    if (renderingSource[index] === "}") depth -= 1;
    if (depth === 0) return renderingSource.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const COMPLETE_STATEMENT_FUNCTIONS = [
  "completeStatementStepType",
  "completeStatementHasIndependentAction",
  "completeStatementConditionBlock",
  "completeStatementJoinConditions",
  "completeStatementInvertedBlock",
  "completeStatementLowerFirst",
  "completeStatementLogic",
  "completeStatementDeveloperLogic",
  "completeStatementNotes",
  "completeStatementPreviewRows",
];

/**
 * Loads the real phrase catalog plus the complete-statement builders. The step
 * hierarchy is given as a flat list of { step, number } in display order.
 */
function loadPreview(entries) {
  let next = 0;
  const context = {
    state: { audit: { sources: [], steps: entries.map((e) => e.step) } },
    uid: (prefix) => `${prefix}_${++next}`,
    sourceAliasFor: (source) => source,
    normalizeCatalogStep: (step) => step,
    ATLAS_STRING_TRANSFORM_VALUE_MODE: "String transform",
    syncAutoReferenceSteps: undefined,
    stepNumberFor: (id) => id,
    console,
  };
  vm.createContext(context);
  vm.runInContext(read("js/07-phrase-catalog.js"), context);
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  vm.runInContext(
    COMPLETE_STATEMENT_FUNCTIONS.map(declaration).join("\n"),
    context,
  );
  vm.runInContext(read("js/02b-developer-formulas.js"), context);
  loadStepTypeScripts(context);
  context.hierarchicalStepEntries = () =>
    entries.map((entry) => ({ ...entry, level: 0, branchLabel: "" }));
  return context;
}

const cond = (field, operator, value, connector = "AND") => ({
  connector,
  sourceFile: "sap",
  sourceAlias: "sap",
  fieldName: field,
  operator,
  valueMode: "values",
  compareValue: value,
});
const ifStep = (id, conditions, extra = {}) => ({
  id,
  step_type: "if_then",
  enabled: true,
  parentId: null,
  branchType: "root",
  ...extra,
  params: {
    conditions_json: JSON.stringify(conditions),
    then_action_type: "display",
    ...(extra.params || {}),
  },
});
const createColumn = (id, parentId, column) => ({
  id,
  step_type: "create_column",
  enabled: true,
  parentId,
  branchType: "then",
  params: {
    column_name: column,
    value_mode: "Static value",
    static_value: "Y",
  },
});
const rows = (entries) => [
  ...loadPreview(entries).completeStatementPreviewRows(),
];

test("a non-IF child inherits its parent IF and the gate-only parent is hidden", () => {
  const parent = ifStep("p", [cond("Status", "is equal to", "Active", "IF")]);
  const child = createColumn("c", "p", "Flag");
  const result = rows([
    { step: parent, number: "1" },
    { step: child, number: "1.1" },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].step, "1.1", "original hierarchy number is kept");
  assert.match(
    result[0].analyst,
    /^IF file "sap" column "Status" is equal to "Active" THEN create /,
  );
  assert.match(result[0].developer, /=IF\(\[@\[Status\]\]="Active", "Y", ""\)/);
  assert.match(
    result[0].developer,
    /CASE WHEN \[Status\] = 'Active' THEN 'Y' END AS \[Flag\]/,
  );
  assert.match(result[0].developer, /df\.loc\[mask, "Flag"\] = "Y"/);
});

test("conditions accumulate across three levels", () => {
  const a = ifStep("a", [cond("A", "is equal to", "1", "IF")]);
  const b = ifStep("b", [cond("B", "is equal to", "2", "IF")], {
    parentId: "a",
    branchType: "then",
  });
  const c = ifStep("c", [cond("C", "is equal to", "3", "IF")], {
    parentId: "b",
    branchType: "then",
    params: { then_action_type: "do_not_display" },
  });
  const result = rows([
    { step: a, number: "1" },
    { step: b, number: "1.1" },
    { step: c, number: "1.1.1" },
  ]);
  assert.deepEqual(
    result.map((row) => row.step),
    ["1.1.1"],
  );
  assert.match(
    result[0].analyst,
    /^IF file "sap" column "A" is equal to "1" AND file "sap" column "B" is equal to "2" AND file "sap" column "C" is equal to "3" THEN /,
  );
  assert.match(
    result[0].developer,
    /WHERE NOT \(\[A\] = '1' AND \[B\] = '2' AND \[C\] = '3'\)/,
  );
});

test("an OR parent stays grouped when a child condition is AND-ed to it", () => {
  const parent = ifStep("p", [
    cond("A", "is equal to", "1", "IF"),
    cond("B", "is equal to", "2", "OR"),
  ]);
  const child = ifStep("c", [cond("C", "is equal to", "3", "IF")], {
    parentId: "p",
    branchType: "then",
    params: { then_action_type: "do_not_display" },
  });
  const [row] = rows([
    { step: parent, number: "1" },
    { step: child, number: "1.1" },
  ]);
  assert.match(
    row.developer,
    /=NOT\(AND\(\[@\[C\]\]="3", OR\(\[@\[A\]\]="1", \[@\[B\]\]="2"\)\)\)/,
  );
  assert.match(
    row.developer,
    /WHERE NOT \(\[C\] = '3' AND \(\[A\] = '1' OR \[B\] = '2'\)\)/,
  );
  assert.match(
    row.analyst,
    /^IF file "sap" column "C" is equal to "3" AND:\n {2}• file "sap" column "A" is equal to "1" OR\n {2}• file "sap" column "B" is equal to "2" THEN /,
  );
});

test("mixed AND/OR keeps AND precedence when wrapped", () => {
  const ctx = loadPreview([]);
  const block = ctx.completeStatementConditionBlock([
    cond("A", "is equal to", "1", "IF"),
    cond("B", "is equal to", "2", "AND"),
    cond("C", "is equal to", "3", "OR"),
  ]);
  const text = ctx.atlasDevConditionTree(
    ctx.completeStatementJoinConditions([
      [cond("P", "is equal to", "0", "IF")],
      block,
    ]),
    "sql",
  );
  assert.equal(text, "[P] = '0' AND (([A] = '1' AND [B] = '2') OR [C] = '3')");
});

test("children of a linked inverse step inherit its plain-English opposite", () => {
  const source = ifStep("s", [
    cond("Amount", "is greater than", "100", "IF"),
    cond("Region", "is equal to", "West", "AND"),
  ]);
  // Inverse steps store already-inverted conditions (see invertedConditionsForStep).
  const inverse = ifStep(
    "i",
    [
      cond("Amount", "is less than or equal to", "100", "IF"),
      cond("Region", "is not equal to", "West", "OR"),
    ],
    { params: { inverse_else: "Yes", inverse_of_step_id: "s" } },
  );
  const child = createColumn("c", "i", "Review");
  const result = rows([
    { step: source, number: "1" },
    { step: inverse, number: "2" },
    { step: child, number: "2.1" },
  ]);
  const childRow = result.find((row) => row.stepId === "c");
  assert.ok(childRow);
  assert.doesNotMatch(childRow.analyst, /\bNOT\b|ELSE/);
  assert.match(childRow.analyst, /is less than or equal to "100"/);
  assert.match(childRow.analyst, /is not equal to "West"/);
  assert.match(
    childRow.developer,
    /=IF\(OR\(\[@\[Amount\]\]<=100, \[@\[Region\]\]<>"West"\), "Y", ""\)/,
  );
});

test("a legacy ELSE step reads as the opposite of the IF before it", () => {
  const source = ifStep("s", [cond("Amount", "is greater than", "100", "IF")], {
    params: { then_action_type: "do_not_display" },
  });
  const legacyElse = {
    id: "e",
    step_type: "else",
    enabled: true,
    parentId: null,
    branchType: "root",
    params: { then_action_type: "do_not_display" },
  };
  const result = rows([
    { step: source, number: "1" },
    { step: legacyElse, number: "2" },
  ]);
  const elseRow = result.find((row) => row.stepId === "e");
  assert.match(
    elseRow.analyst,
    /^IF file "sap" column "Amount" is less than or equal to "100" THEN /,
  );
  assert.doesNotMatch(elseRow.analyst, /\bELSE\b|\bNOT\b/);
  assert.match(elseRow.developer, /WHERE NOT \(\[Amount\] <= 100\)/);
});

test("an ELSE branch child inherits the opposite of its parent IF", () => {
  const parent = ifStep("p", [cond("Status", "is equal to", "Active", "IF")], {
    params: { then_action_type: "do_not_display" },
  });
  const elseChild = createColumn("c", "p", "Inactive");
  elseChild.branchType = "else";
  const result = rows([
    { step: parent, number: "1" },
    { step: elseChild, number: "1.1" },
  ]);
  assert.equal(result.length, 2, "a parent with its own action keeps its row");
  assert.match(
    result[1].analyst,
    /^IF file "sap" column "Status" is not equal to "Active" THEN create /,
  );
});

test("gate-only parent notes carry into the child row", () => {
  const parent = ifStep("p", [cond("A", "is equal to", "1", "IF")]);
  parent.notes = "Only current records.";
  const child = createColumn("c", "p", "Flag");
  child.notes = "Child note.";
  const [row] = rows([
    { step: parent, number: "1" },
    { step: child, number: "1.1" },
  ]);
  assert.equal(
    row.notes,
    "Parent context note: Only current records.\nChild note.",
  );
});

test("top-level steps without conditions are unchanged", () => {
  const step = createColumn("c", null, "Flag");
  step.branchType = "root";
  const [row] = rows([{ step, number: "1" }]);
  assert.match(row.developer, /^Excel:\n="Y"\n/);
  assert.match(row.developer, /'Y' AS \[Flag\]/);
  assert.doesNotMatch(row.analyst, /^IF/);
});
