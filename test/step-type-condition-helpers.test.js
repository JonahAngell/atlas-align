/**
 * Condition and action formula helpers, the operator meanings in the phrase
 * catalog, and the export shape warning (Phase 8, branch 5031 of the Dynamic
 * Step Type Builder plan).
 *
 * A test-only definition writes a condition's formula with them, through a
 * leaf partial, and must match the if_then definition's condition partial
 * (which replaced the app's condition formulas in branch 5035) for every
 * condition in the condition and action matrix.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";
import {
  loadStepTypeScripts,
  STEP_TYPE_ENGINE_SCRIPTS,
} from "./support/step-type-scripts.js";
import { matrixGroups } from "./fixtures/condition-action-matrix/cases.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const SCHEMA = JSON.parse(read("catalogs/step-types/schema.json"));
const CATALOG = JSON.parse(read("catalogs/logic_phrase_catalog.json"));
/** ATLASStepTypes.conditions from the engine scripts alone. */
const engineConditions = () =>
  loadStepTypeScripts(vm.createContext({}), STEP_TYPE_ENGINE_SCRIPTS)
    .ATLASStepTypes.conditions;
const DIALECTS = ["excel", "sql", "python"];
const plain = (value) => JSON.parse(JSON.stringify(value));
const run = (context, code) => vm.runInContext(code, context);

// -----------------------------------------------------------------------------
// The test-only definitions
// -----------------------------------------------------------------------------

/** The left column of a condition. */
const LEFT =
  "(field this.sourceFile (default this.fieldName this.field) alias=this.sourceAlias)";
/** The compare column of a field condition, with its math (no rounding). */
const RIGHT =
  "(mathFormula this.compareSourceFile this.compareSourceAlias this.compareFieldName (default this.compareMathJson this.compare_math_json this.compareMath) raw=true)";
const VALUES = "(compareLiteral (conditionValues this) this)";
const EXPRESSION =
  '(default (trim this.expression) (placeholder "expression" "[expression]"))';

/** One condition as a formula, the rules of the if_then leaf partial. */
const LEAF = [
  `{{#if (or (eq this.valueMode "blank") (eq (operatorKind this.operator) "blank"))}}`,
  `{{blankTest ${LEFT} this.operator}}`,
  `{{else if (eq this.valueMode "expression")}}`,
  `{{#if (operatorNegated this.operator)}}{{negate (concat "(" ${EXPRESSION} ")")}}{{else}}({{${EXPRESSION.slice(1, -1)}}}){{/if}}`,
  `{{else if (eq this.valueMode "field")}}`,
  `{{#if (eq (operatorKind this.operator) "text_match")}}`,
  `{{textMatch ${LEFT} this.operator ${RIGHT} field=true leftName=(trim (default this.fieldName this.field)) rightName=(trim this.compareFieldName)}}`,
  `{{else}}{{compare ${LEFT} this.operator ${RIGHT}}}{{/if}}`,
  `{{else if (eq this.compareParameter "runDate")}}`,
  `{{compare ${LEFT} this.operator (runParameter)}}`,
  `{{else if (eq (operatorKind this.operator) "text_match")}}`,
  `{{textMatch ${LEFT} this.operator (conditionValues this)}}`,
  `{{else if (and (gt (count (conditionValues this)) 1) (in (operatorSymbol this.operator) "=" "<>"))}}`,
  "{{> manyValues}}",
  `{{else}}{{combine (compare ${LEFT} this.operator ${VALUES}) "OR"}}{{/if}}`,
].join("");

const NEGATED = '(eq (operatorSymbol this.operator) "<>")';
/** Several values with = or <>: IN, isin, or OR / AND in Excel. */
const MANY_VALUES = {
  excel: `{{#if ${NEGATED}}}{{combine (compare ${LEFT} this.operator ${VALUES}) "AND"}}{{else}}{{combine (compare ${LEFT} this.operator ${VALUES}) "OR"}}{{/if}}`,
  sql: `{{field this.sourceFile (default this.fieldName this.field) alias=this.sourceAlias}} {{#if ${NEGATED}}}NOT IN{{else}}IN{{/if}} ({{join ${VALUES}}})`,
  python: `{{#if ${NEGATED}}}~{{/if}}{{field this.sourceFile (default this.fieldName this.field) alias=this.sourceAlias}}.isin([{{join ${VALUES}}}])`,
};

/**
 * The stored tree as the app reads it (json of conditions_json), so the probe
 * tests the helpers alone. The `conditions` root is normalized, which turns an
 * unknown run parameter into the run date.
 */
const TREE =
  '{{conditionTree (json param.conditions_json) leaf="leaf" style="precedence"}}';

const CONDITION_PROBE = {
  schemaVersion: 2,
  id: "condition_probe",
  version: 1,
  label: "Condition Probe",
  order: 90,
  status: "active",
  legacyType: "transform",
  fields: [{ param: "conditions_json", control: "hidden" }],
  partials: { leaf: LEAF, manyValues: MANY_VALUES },
  english: { default: "Probe." },
  formulas: {
    shape: "frame",
    default: { excel: TREE, sql: TREE, python: TREE },
  },
  export: {
    scriptRole: "column",
    qtest: { section: "D", testType: "Data Validation" },
  },
};

/** A THEN action's value with the Create Column helpers and then_ params. */
const ACTION_VALUE = [
  "{{#switch param.then_action_type}}",
  '{{#case "set_column_calculation"}}',
  "{{mathFormula (default param.then_value_source_file param.source_file) param.then_value_source_alias param.then_value_field param.then_math_json param.then_rounding_mode param.then_rounding_decimal_places}}",
  "{{/case}}",
  '{{#case "set_column_string_transform"}}{{stringTransformFormula param prefix="then_"}}{{/case}}',
  "{{#default}}none{{/default}}",
  "{{/switch}}",
].join("");

const ACTION_PROBE = {
  schemaVersion: 1,
  id: "action_probe",
  version: 1,
  label: "Action Probe",
  order: 91,
  status: "active",
  legacyType: "transform",
  fields: [{ param: "then_action_type", control: "hidden" }],
  english: {
    default:
      '{{#switch param.then_action_type}}{{#case "set_column_string_transform"}}{{stringTransformPhrase param prefix="then_" context="if_then"}}{{/case}}{{#default}}{{stringTransformTarget param prefix="then_"}}{{/default}}{{/switch}}',
  },
  formulas: {
    shape: "frame",
    default: { excel: ACTION_VALUE, sql: ACTION_VALUE, python: ACTION_VALUE },
  },
  export: {
    scriptRole: "column",
    qtest: { section: "D", testType: "Data Validation" },
  },
};

/** A fresh app with the bundled definitions plus `extra` in its registry. */
async function appWith(extra = []) {
  const context = await loadApp();
  context.__schema = SCHEMA;
  context.__definitions = extra;
  const results = run(
    context,
    `(() => {
      const registry = ATLASStepTypes.registry.createRegistry({
        schema: __schema,
        helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
        blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
        handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
      });
      const results = [...ATLASStepTypes.bundled.definitions, ...__definitions]
        .map((definition) => registry.add(definition));
      ATLASStepTypeRuntime.useRegistry(registry);
      return results;
    })()`,
  );
  plain(results).forEach((result) =>
    assert.equal(result.ok, true, JSON.stringify(result.errors)),
  );
  return context;
}

function useAudit(context, document) {
  context.__auditInput = structuredClone(document);
  run(
    context,
    `state.audit = normalizeLoadedAudit(__auditInput, "repo");
     state.auditSelected = true;
     state.selectedStepId = null;`,
  );
}

const helper = (context, name, args, hash = {}, format = "excel") => {
  context.__helperCall = { name, args, hash, format };
  return plain(
    run(
      context,
      `ATLASStepTypeLibrary.helpers[__helperCall.name](
        __helperCall.args, __helperCall.hash, { format: __helperCall.format })`,
    ),
  );
};

// -----------------------------------------------------------------------------
// Operator meanings
// -----------------------------------------------------------------------------

test("operator meanings: the catalog gives every listed operator a meaning", () => {
  const options = CATALOG.app_config.logic_options;
  const meanings = engineConditions().operatorCatalog(options).meanings;
  const known = new Set(
    ["compare", "text_match", "blank"].flatMap((kind) =>
      Object.keys(meanings[kind]),
    ),
  );
  const listed = Object.values(options.operator_sets)
    .flat()
    .map((operator) => String(operator).toLowerCase())
    .filter((operator) => !/expression/.test(operator));
  const missing = listed.filter((operator) => !known.has(operator));
  assert.deepEqual(missing, []);
  Object.values(meanings.text_match).forEach((meaning) => {
    assert.ok(["contains", "starts", "ends"].includes(meaning.kind));
    assert.equal(typeof meaning.negated, "boolean");
  });
});

test("operator meanings: js/02b reads them from the catalog", async () => {
  const context = await appWith();
  const meaning = (kind, operator) =>
    plain(
      run(
        context,
        `atlasDevOperatorMeaning(${JSON.stringify(kind)}, ${JSON.stringify(operator)}) ?? null`,
      ),
    );
  assert.equal(meaning("compare", "is not equal to"), "<>");
  assert.deepEqual(meaning("text_match", "does not start with"), {
    kind: "starts",
    negated: true,
  });
  assert.equal(meaning("blank", "is not blank/null"), true);
  assert.equal(meaning("compare", "constructor"), null);
  assert.equal(meaning("compare", "is between"), null);
});

// -----------------------------------------------------------------------------
// The helpers one at a time
// -----------------------------------------------------------------------------

test("helpers: combine, list, negate and unwrap follow each dialect", async () => {
  const context = await appWith();
  assert.equal(
    helper(context, "combine", [["a=1", "b=2"], "or"], {}, "excel"),
    "OR(a=1, b=2)",
  );
  assert.equal(
    helper(context, "combine", [["a = 1", "", "b = 2"], "AND"], {}, "sql"),
    "(a = 1 AND b = 2)",
  );
  assert.equal(
    helper(context, "combine", [["(a)", "(b)"], "OR"], {}, "python"),
    "((a) | (b))",
  );
  assert.equal(helper(context, "combine", ["only", "AND"], {}, "sql"), "only");
  assert.deepEqual(helper(context, "list", ["a", 2, true]), ["a", 2, true]);
  assert.equal(helper(context, "negate", ["(x=1)"], {}, "excel"), "NOT(x=1)");
  assert.equal(helper(context, "negate", ["x = 1"], {}, "sql"), "NOT (x = 1)");
  assert.equal(helper(context, "negate", ["(x)"], {}, "python"), "~(x)");
  assert.equal(helper(context, "unwrap", ["(a) AND (b)"]), "(a) AND (b)");
  assert.equal(helper(context, "unwrap", ["((a) AND (b))"]), "(a) AND (b)");
});

test("helpers: operator kind, symbol and negation", async () => {
  const context = await appWith();
  const kind = (operator) => helper(context, "operatorKind", [operator]);
  assert.equal(kind("is greater than"), "compare");
  assert.equal(kind("Does Not Contain"), "text_match");
  assert.equal(kind("is blank/null"), "blank");
  assert.equal(kind("is between"), "");
  assert.equal(kind(""), "compare");
  assert.equal(helper(context, "operatorSymbol", ["<="]), "<=");
  assert.equal(helper(context, "operatorSymbol", ["is between"]), "=");
  assert.equal(helper(context, "operatorNegated", ["is not equal to"]), true);
  assert.equal(helper(context, "operatorNegated", ["contains"]), false);
});

test("helpers: compare values become number or text literals by the app's rule", async () => {
  const context = await appWith();
  useAudit(context, matrixGroups()[0].cases[0]);
  const condition = (fieldName, operator = "is equal to") => ({
    sourceFile: "wd",
    sourceAlias: "wd",
    fieldName,
    operator,
  });
  assert.deepEqual(
    helper(context, "conditionValues", [{ compareValue: " a \n\n b " }]),
    ["a", "b"],
  );
  assert.deepEqual(
    helper(context, "conditionValues", [
      { compareValues: ["x", " "], compareValue: "ignored" },
    ]),
    ["x"],
  );
  // A cataloged number field compares as a number, without leading zeros.
  assert.deepEqual(
    helper(context, "compareLiteral", [["040", "10"], condition("Pay")], {}, "sql"),
    ["40", "10"],
  );
  // A code in a text field stays text, unless the operator is < or >.
  assert.equal(
    helper(context, "compareLiteral", ["1016", condition("Code")], {}, "sql"),
    "'1016'",
  );
  assert.equal(
    helper(
      context,
      "compareLiteral",
      ["1016", condition("Code", "is greater than")],
      {},
      "python",
    ),
    "1016",
  );
  assert.deepEqual(
    helper(context, "compareLiteral", [[], condition("Pay")], {}, "excel"),
    ['""'],
  );
  assert.deepEqual(
    helper(context, "compare", ["[Pay]", "is less than", ["1", "2"]], {}, "sql"),
    ["[Pay] < 1", "[Pay] < 2"],
  );
  assert.equal(
    helper(context, "compare", ['df["Pay"]', "is not equal to", "3"], {}, "python"),
    '(df["Pay"] != 3)',
  );
});

test("helpers: textMatch, blankTest, runParameter and json", async () => {
  const context = await appWith();
  assert.equal(
    helper(context, "textMatch", ["[Code]", "contains", ["50%_off"]], {}, "sql"),
    "[Code] LIKE '%50[%][_]off%'",
  );
  assert.equal(
    helper(context, "textMatch", ["[@[Code]]", "does not start with", "AB"], {}, "excel"),
    'NOT(LEFT([@[Code]], 2)="AB")',
  );
  assert.equal(
    helper(
      context,
      "textMatch",
      ['df["Code"]', "ends with", 'df["Other"]'],
      { field: true, leftName: "Code", rightName: "Other" },
      "python",
    ),
    'df.apply(lambda row: str(row["Code"]).lower().endswith(str(row["Other"]).lower()), axis=1)',
  );
  assert.equal(helper(context, "textMatch", ["[Code]", "is equal to", "x"]), "");
  assert.equal(
    helper(context, "blankTest", ["[Status]", "is not blank"], {}, "sql"),
    "NULLIF(LTRIM(RTRIM([Status])), '') IS NOT NULL",
  );
  assert.equal(
    helper(context, "blankTest", ["[@[Status]]", "is equal to"], {}, "excel"),
    "LEN(TRIM([@[Status]]))=0",
  );
  assert.equal(helper(context, "runParameter", [], {}, "sql"), "@RunDate");
  assert.equal(helper(context, "runParameter", [], {}, "python"), "run_date");
  assert.equal(helper(context, "runParameter", [], {}, "excel"), "RunDate");
  assert.deepEqual(helper(context, "json", ['[{"a":1}]']), [{ a: 1 }]);
  assert.deepEqual(helper(context, "json", ["not json"]), []);
  assert.deepEqual(helper(context, "json", [""]), []);
  assert.deepEqual(helper(context, "json", ["3"]), []);
});

test("helpers: freeformOutcome reads a sentence as the qTest action does", async () => {
  const context = await appWith();
  const sentences = [
    'Display "Check pay" in new column "Error Message"',
    'display text response "Late" in column "Flag"',
    "Do not display the row",
    "Send to payroll",
    "",
  ];
  for (const sentence of sentences) {
    context.__sentence = sentence;
    const expected = plain(
      run(
        context,
        `qtestFreeformOutcome(__sentence)`,
      ),
    );
    assert.deepEqual(helper(context, "freeformOutcome", [sentence]), expected);
    assert.equal(
      helper(context, "freeformOutcome", [sentence], { part: "kind" }),
      expected.kind,
    );
  }
});

test("helpers: math helpers take list arguments and string transforms a prefix", async () => {
  const context = await appWith();
  const document = matrixGroups().find(({ group }) => group === "actions");
  useAudit(context, document.cases[0]);
  const params = {
    source_file: "wd",
    source_alias: "wd",
    field_name: "Pay",
    source_math_json: JSON.stringify([
      { operator: "*", operandType: "number", operand: "1.5" },
    ]),
    rounding_mode: "down",
    rounding_decimal_places: "2",
  };
  const list = [
    params.source_file,
    params.source_alias,
    params.field_name,
    params.source_math_json,
    params.rounding_mode,
    params.rounding_decimal_places,
  ];
  for (const format of DIALECTS)
    assert.equal(
      helper(context, "mathFormula", list, {}, format),
      helper(context, "mathFormula", [params], {}, format),
    );
  assert.equal(
    helper(context, "mathPhrase", list, {}, "english"),
    helper(context, "mathPhrase", [params], {}, "english"),
  );
  assert.equal(helper(context, "mathActive", list), true);
  assert.equal(
    helper(context, "mathFormula", list, { raw: true }, "sql"),
    "([Pay] * 1.5)",
  );
  const thenParams = {
    then_string_operation: "first_characters",
    then_string_source_file: "wd",
    then_string_source_field: "Country",
    then_string_character_count: "2",
    then_string_destination_column: "Country Code",
  };
  context.__thenParams = thenParams;
  for (const format of DIALECTS)
    assert.equal(
      helper(context, "stringTransformFormula", [thenParams], { prefix: "then_" }, format),
      plain(
        run(
          context,
          `atlasDevStringTransform(atlasDevStringTransformConfig(__thenParams, "then_"), ${JSON.stringify(format)})`,
        ),
      ),
    );
  assert.equal(
    helper(
      context,
      "stringTransformPhrase",
      [thenParams],
      { prefix: "then_", context: "if_then" },
      "english",
    ),
    plain(
      run(
        context,
        `atlasStringTransformAnalystPhrase(atlasStringTransformConfig(__thenParams, "then_"), "if_then")`,
      ),
    ),
  );
  assert.notEqual(
    helper(context, "stringTransformFormula", [thenParams], { prefix: "then_" }, "sql"),
    helper(context, "stringTransformFormula", [thenParams], {}, "sql"),
  );
});

// -----------------------------------------------------------------------------
// The test-only definitions against the app code, over the matrix
// -----------------------------------------------------------------------------

/** Every IF / THEN step of the matrix with its case. */
function matrixSteps(groupNames) {
  return matrixGroups()
    .filter(({ group }) => groupNames.includes(group))
    .flatMap(({ cases }) =>
      cases.flatMap((document) =>
        document.steps
          .filter((step) => step.step_type === "if_then")
          .map((step) => ({ document, step })),
      ),
    );
}

test("matrix: the condition partial matches the if_then condition for every condition", async () => {
  const items = matrixSteps(["conditions", "groups", "actions"]);
  assert.ok(items.length > 50, `only ${items.length} IF / THEN steps`);
  const differences = [];
  for (const { document, step } of items) {
    const context = await appWith([CONDITION_PROBE]);
    useAudit(context, document);
    context.__probeId = step.id;
    const result = plain(
      run(
        context,
        `(() => {
          const step = state.audit.steps.find((item) => item.id === __probeId);
          const probe = { ...step, step_type: "condition_probe" };
          const formulas = ATLASStepTypeRuntime.formulas(probe);
          const expected = {};
          ["excel", "sql", "python"].forEach((dialect) => {
            expected[dialect] = ATLASStepTypeRuntime.partial("if_then", "condition", step, dialect);
          });
          return { formulas, expected };
        })()`,
      ),
    );
    for (const dialect of DIALECTS)
      if (result.formulas[dialect] !== result.expected[dialect])
        differences.push({
          id: document.id,
          dialect,
          expected: result.expected[dialect],
          actual: result.formulas[dialect] ?? result.formulas.lead,
        });
  }
  assert.deepEqual(differences.slice(0, 5), []);
});

test("matrix: the action helpers match the if_then action value for every action", async () => {
  const items = matrixSteps(["actions"]).filter(({ step }) =>
    ["set_column_calculation", "set_column_string_transform"].includes(
      step.params.then_action_type,
    ),
  );
  assert.ok(items.length >= 4, `only ${items.length} action steps`);
  for (const { document, step } of items) {
    const context = await appWith([ACTION_PROBE]);
    useAudit(context, document);
    context.__probeId = step.id;
    const result = plain(
      run(
        context,
        `(() => {
          const step = state.audit.steps.find((item) => item.id === __probeId);
          const probe = { ...step, step_type: "action_probe" };
          const formulas = ATLASStepTypeRuntime.formulas(probe);
          const expected = {};
          ["excel", "sql", "python"].forEach((dialect) => {
            expected[dialect] = ATLASStepTypeRuntime.partial("if_then", "actionValue", step, dialect);
          });
          const english = ATLASStepTypeRuntime.english(probe);
          const config = atlasStringTransformConfig(step.params, "then_");
          return {
            formulas,
            expected,
            english,
            phrase: step.params.then_action_type === "set_column_string_transform"
              ? atlasStringTransformAnalystPhrase(config, "if_then")
              : config.destinationColumn || "",
          };
        })()`,
      ),
    );
    for (const dialect of DIALECTS)
      assert.equal(result.formulas[dialect], result.expected[dialect], `${document.id} ${dialect}`);
    assert.equal(result.english, result.phrase, document.id);
  }
});

// -----------------------------------------------------------------------------
// The export shape warning
// -----------------------------------------------------------------------------

test("export shape: placeable, unplaceable and exempt formulas", async () => {
  const context = await appWith();
  const problems = (role, formulas) => {
    context.__shape = { role, formulas };
    return plain(
      run(
        context,
        "ATLASStepTypes.definitions.exportShapeProblems(__shape.role, __shape.formulas)",
      ),
    );
  };
  assert.deepEqual(problems("condition", { sql: "WHERE [Status] = 'A'" }), []);
  assert.deepEqual(
    problems("condition", { sql: "CASE WHEN x THEN 1 END AS [Flag]" }),
    [],
  );
  assert.deepEqual(problems("filter", { sql: "WHERE x" }), []);
  assert.deepEqual(problems("else", { lead: "See step 2." }), []);
  assert.deepEqual(problems("column", { sql: "anything" }), []);
  assert.deepEqual(problems("none", {}), []);
  // A freeform action carries a note, which the export shows as the reason.
  assert.deepEqual(
    problems("condition", { sql: "[Status] = 'A'", notes: ["Note: send it."] }),
    [],
  );
  const [unplaced] = problems("condition", { sql: "[Status] = 'A'" });
  assert.equal(unplaced.code, "export_shape");
  assert.match(unplaced.message, /WHERE /);
  assert.equal(problems("flag", { sql: " WHERE x" }).length, 1);
  assert.equal(problems("else", {}).length, 1);
  assert.equal(problems("condition", { excel: "=x" }).length, 1);
  assert.equal(problems("filter", { notes: ["", ""] }).length, 1);
});

test("export shape: the rule agrees with the code export's gaps", async () => {
  const context = await appWith();
  context.__entry = {
    step: { id: "x", step_type: "if_then", params: {} },
    formulas: { excel: "=x", sql: "[Status] = 'A'", python: "x", notes: [] },
  };
  const placed = plain(run(context, "atlasCodeClassify(__entry, 'sql', [])"));
  assert.ok(placed.gap, "the code export reports a gap");
  assert.equal(
    plain(
      run(
        context,
        "ATLASStepTypes.definitions.exportShapeProblems('condition', __entry.formulas)",
      ),
    ).length,
    1,
  );
  context.__entry.formulas.sql = "WHERE [Status] = 'A'";
  assert.equal(
    plain(run(context, "atlasCodeClassify(__entry, 'sql', [])")).gap,
    undefined,
  );
});

const SHAPE_SAMPLE = (sql, extra = {}) => ({
  schemaVersion: 1,
  id: "shape_sample",
  version: 1,
  label: "Shape Sample",
  order: 92,
  status: "active",
  legacyType: "transform",
  fields: [{ param: "field_name", control: "hidden" }],
  english: { default: "Sample." },
  formulas: { shape: "frame", default: { excel: "=x", sql, python: "x" } },
  export: {
    scriptRole: "condition",
    qtest: { section: "D", testType: "Data Validation" },
  },
  tests: [
    { name: "one", params: { field_name: "Status" }, expect: { english: "Sample." } },
    { name: "two", params: {}, expect: { english: "Sample." } },
  ],
  ...extra,
});

test("export shape: validate warns per test case only when asked to render", async () => {
  const context = await appWith();
  context.__schema = SCHEMA;
  const validate = (definition, render = true) => {
    context.__definition = definition;
    return plain(
      run(
        context,
        `ATLASStepTypes.definitions.validate(__definition, {
          schema: __schema,
          helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
          ${render ? "renderFormulas: __renderSample," : ""}
        })`,
      ),
    );
  };
  // Render the sample's own templates the way the runtime would.
  run(
    context,
    `globalThis.__renderSample = (definition, step) => ({
      sql: ATLASStepTypes.templates.render(definition.formulas.default.sql, { param: step.params }),
    });`,
  );
  const unplaced = validate(SHAPE_SAMPLE("[{{param.field_name}}] = 'A'"));
  assert.equal(unplaced.ok, true, JSON.stringify(unplaced.errors));
  assert.deepEqual(
    unplaced.warnings.map((warning) => [warning.path, warning.code]),
    [
      ["/tests/0", "export_shape"],
      ["/tests/1", "export_shape"],
    ],
  );
  assert.match(unplaced.warnings[0].message, /^test "one": /);
  const placed = validate(SHAPE_SAMPLE("WHERE [{{param.field_name}}] = 'A'"));
  assert.deepEqual(placed.warnings, []);
  const column = validate(
    SHAPE_SAMPLE("[x]", {
      export: {
        scriptRole: "column",
        qtest: { section: "D", testType: "Data Validation" },
      },
    }),
  );
  assert.deepEqual(column.warnings, []);
  const without = validate(SHAPE_SAMPLE("[x]"), false);
  assert.equal("warnings" in without, false);
});

test("export shape: the runtime renders a definition's tests with its formulas", async () => {
  const unplaced = SHAPE_SAMPLE("[{{param.field_name}}] = 'A'");
  const context = await appWith([unplaced]);
  context.__definition = unplaced;
  const warnings = plain(
    run(context, "ATLASStepTypeRuntime.exportShapeWarnings(__definition)"),
  );
  assert.equal(warnings.length, 2);
  context.__definition = SHAPE_SAMPLE("WHERE [{{param.field_name}}] = 'A'");
  assert.deepEqual(
    plain(run(context, "ATLASStepTypeRuntime.exportShapeWarnings(__definition)")),
    [],
  );
  context.__definition = SHAPE_SAMPLE("[x]", {
    formulas: {
      shape: "frame",
      default: { excel: "=x", sql: "[x]", python: "x" },
      notes: ["Note: the action is freeform."],
    },
  });
  assert.deepEqual(
    plain(run(context, "ATLASStepTypeRuntime.exportShapeWarnings(__definition)")),
    [],
  );
});

test("export shape: a matrix step warns only where the code export skips it", async () => {
  const warned = [];
  const disagreements = [];
  for (const { cases } of matrixGroups())
    for (const document of cases) {
      const context = await appWith();
      useAudit(context, document);
      const rows = plain(
        run(
          context,
          `state.audit.steps.map((step) => {
            const role = ATLASStepTypeRuntime.scriptRole(step) || "none";
            const formulas = atlasDeveloperFormulas(step) || {};
            const problems = ATLASStepTypes.definitions.exportShapeProblems(role, formulas);
            const row = ATLASStepTypes.definitions.ROW_TEST_ROLES.includes(role);
            const classified = row ? atlasCodeClassify({ step, formulas }, "sql", []) : {};
            const noted = (formulas.notes || []).some(Boolean);
            return {
              id: step.id,
              warns: problems.length > 0,
              skipped: Boolean(classified.gap) && !noted,
            };
          })`,
        ),
      );
      rows.forEach((row) => {
        if (row.warns) warned.push(row.id);
        if (row.warns !== row.skipped) disagreements.push(row.id);
      });
    }
  assert.deepEqual(disagreements, []);
  // Only an ELSE whose action has no code of its own: today's SQL script
  // already skips these with a TODO.
  assert.deepEqual(warned.sort(), [
    "else-managed-freeform-empty::else",
    "else-managed-unknown-action-type::else",
    "else-own-freeform-empty::else",
    "else-own-unknown-action-type::else",
  ]);
});

test("export shape: no bundled definition's tests get a warning", async () => {
  const context = await appWith();
  const bundled = plain(
    run(
      context,
      `ATLASStepTypes.bundled.definitions.flatMap((definition) =>
        ATLASStepTypeRuntime.exportShapeWarnings(definition)
          .map((warning) => ({ id: definition.id, ...warning })))`,
    ),
  );
  assert.deepEqual(bundled, []);
});
