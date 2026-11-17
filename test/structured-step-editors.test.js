import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/** Text between two markers of a source file. */
function slice(file, startMarker, endMarker) {
  const source = read(file);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} block found`);
  return source.slice(start, end);
}

/** One top-level function of a source file, by name. */
function fn(file, name) {
  const source = read(file);
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start, `${name} found`);
  return source.slice(start, end + 2);
}

function load() {
  const context = {
    state: { audit: { sources: [], steps: [], fields: [] } },
    uid: (prefix) => `${prefix}_1`,
    sourceAliasFor: (source) => (source ? `alias.${source}` : ""),
    fieldsForSource: () => [],
    normalizeCatalogStep: (step) => step,
    atlasWriteLiveEditorConditions: (step, conditions) => {
      step.params = step.params || {};
      step.params.conditions_json = JSON.stringify(conditions);
    },
    renderCreateModeInputs: (p) => `<base mode="${p.value_mode}">`,
    esc: (value) => String(value ?? ""),
    fieldInputFromOptions: ({ name, value }) =>
      `<picker name="${name}" value="${value ?? ""}">`,
    atlasChoiceControl: ({ attributes, selected }) =>
      `<choice ${attributes} selected="${selected}">`,
    sourceAliasHidden: () => "",
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    console,
  };
  vm.createContext(context);
  for (const file of [
    "js/07-phrase-catalog.js",
    "js/02-logic-rendering.js",
    "js/02b-developer-formulas.js",
  ])
    vm.runInContext(read(file), context, { filename: file });
  const builder = "js/14-catalog-driven-builder.js";
  vm.runInContext(
    slice(
      builder,
      "// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN",
      "function atlasLogicFieldReferences",
    ),
    context,
    { filename: builder },
  );
  vm.runInContext(
    slice(
      builder,
      "// ATLAS-STRUCTURED-STEP-EDITORS:START",
      "// ATLAS-STRUCTURED-STEP-EDITORS:END",
    ),
    context,
    { filename: builder },
  );
  const events = "js/15g-visual-ui-events.js";
  vm.runInContext(
    [
      "atlasExcludeScope",
      "atlasParseJsonList",
      "atlasExcludeKeyField",
      "atlasNormalizeExcludeScopeParams",
    ]
      .map((name) => fn(events, name))
      .join("\n"),
    context,
    { filename: events },
  );
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("exclude by key keeps the key field and mirrors it as a JSON list", () => {
  const ctx = load();
  const params = ctx.atlasNormalizeExcludeScopeParams({
    then_action_type: "do_not_display",
    then_exclude_scope: "key",
    then_exclude_key_field: "Personnel Number",
    then_exclude_key_source_file: "PA0001",
  });
  assert.equal(params.then_exclude_scope, "key");
  assert.equal(params.then_exclude_key_source_alias, "alias.PA0001");
  assert.deepEqual(JSON.parse(params.then_exclude_key_fields_json), [
    {
      sourceFile: "PA0001",
      sourceAlias: "alias.PA0001",
      fieldName: "Personnel Number",
    },
  ]);
  assert.equal(params.then_action, "Do not display all records for this key");
});

test("exclude settings are dropped unless the action hides by key", () => {
  const ctx = load();
  for (const params of [
    { then_action_type: "display", then_exclude_scope: "key" },
    { then_action_type: "do_not_display", then_exclude_scope: "matching" },
  ]) {
    params.then_exclude_key_field = "Personnel Number";
    params.then_exclude_key_fields_json = "[]";
    ctx.atlasNormalizeExcludeScopeParams(params);
    assert.equal(params.then_exclude_scope, undefined);
    assert.equal(params.then_exclude_key_field, undefined);
    assert.equal(params.then_exclude_key_fields_json, undefined);
  }
});

test("exclude by key reads in analyst and developer logic", () => {
  const ctx = load();
  const step = {
    id: "if1",
    step_type: "if_then",
    params: {
      source_file: "PA0001",
      conditions_json: "[]",
      then_action_type: "do_not_display",
      then_exclude_scope: "key",
      then_exclude_key_field: "Personnel Number",
      then_exclude_key_source_file: "PA0001",
    },
  };
  assert.match(
    ctx.thenActionPlain(step),
    /do not display any record with the same .*Personnel Number.* value/,
  );
  const dev = ctx.atlasDevIfThen(step);
  assert.match(dev.sql, /NOT IN \(SELECT/);
  assert.match(dev.python, /isin\(excluded_keys\)/);
});

test("legacy split_on maps to a delimiter choice and keeps its mirror", () => {
  const ctx = load();
  const params = ctx.atlasNormalizeSplitFieldParams({
    field_name: "Name",
    split_on: "comma",
    split_part: "second value",
    output_column: "Last",
  });
  assert.equal(params.split_by, "delimiter");
  assert.equal(params.split_mode, "part");
  assert.equal(params.split_delimiter, "comma");
  assert.equal(params.split_part, "2");
  assert.equal(params.split_on, "comma");
  assert.deepEqual(plain(ctx.atlasSplitFieldProblems(params)), []);

  const custom = ctx.atlasNormalizeSplitFieldParams({ split_on: " - " });
  assert.equal(custom.split_delimiter, "custom");
  assert.equal(custom.split_custom_delimiter, " - ");
  assert.equal(custom.split_on, " - ");

  const dash = ctx.atlasNormalizeSplitFieldParams({ split_on: "-" });
  assert.equal(dash.split_delimiter, "hyphen");
});

test("fixed-width and explode splits blank the split_on mirror", () => {
  const ctx = load();
  const width = ctx.atlasNormalizeSplitFieldParams({
    split_by: "width",
    split_mode: "part",
    split_width: "4",
    split_part: "last",
    split_delimiter: "comma",
    split_on: "comma",
    field_name: "Code",
    output_column: "Tail",
  });
  assert.equal(width.split_on, "");
  assert.equal(width.split_delimiter, "");
  assert.equal(width.split_part, "last");
  assert.deepEqual(plain(ctx.atlasSplitFieldProblems(width)), []);

  const explode = ctx.atlasNormalizeSplitFieldParams({
    split_by: "delimiter",
    split_mode: "explode",
    split_delimiter: "semicolon",
    field_name: "Roles",
    output_column: "Old",
    split_part: "2",
  });
  assert.equal(explode.split_on, "");
  assert.equal(explode.split_part, "");
  assert.equal(explode.output_column, "");
  assert.deepEqual(plain(ctx.atlasSplitFieldProblems(explode)), []);
});

test("an incomplete split lists what it needs", () => {
  const ctx = load();
  assert.deepEqual(
    plain(
      ctx.atlasSplitFieldProblems({
        split_by: "delimiter",
        split_mode: "part",
      }),
    ),
    ["Choose the field.", "Choose a delimiter.", "Choose the output column."],
  );
  assert.deepEqual(
    plain(
      ctx.atlasSplitFieldProblems({
        field_name: "Code",
        split_by: "width",
        split_mode: "explode",
        split_width: "0",
      }),
    ),
    ["Enter a width from 1 to 10000 characters."],
  );
});

test("date difference keeps its settings and reads in both logics", () => {
  const ctx = load();
  const params = ctx.atlasNormalizeCreateColumnStructuredParams({
    column_name: "Days Since Hire",
    value_mode: "Date difference",
    date_diff_source_file: "PA0041",
    date_diff_field: "Hire Date",
  });
  assert.equal(params.date_diff_parameter, "runDate");
  assert.equal(params.date_diff_direction, "parameter_minus_field");
  assert.equal(params.date_diff_unit, "days");
  assert.equal(params.date_diff_source_alias, "alias.PA0041");
  assert.deepEqual(plain(ctx.atlasCreateColumnStructuredProblems(params)), []);
  const step = { id: "c1", step_type: "create_column", params };
  assert.match(
    ctx.atlasCreateColumnSentence(step),
    /days from .*Hire Date.* to the run date/,
  );
  assert.match(
    ctx.atlasDevCreateColumn(step).sql,
    /DATEDIFF\(day, .*@RunDate\)/,
  );

  const other = ctx.atlasNormalizeCreateColumnStructuredParams({
    value_mode: "Static value",
    date_diff_field: "Hire Date",
    concat_separator: "-",
  });
  assert.equal(other.date_diff_field, undefined);
  assert.equal(other.concat_separator, undefined);
});

test("concatenate separator reads in analyst and developer logic", () => {
  const ctx = load();
  const step = {
    id: "c2",
    step_type: "create_column",
    params: {
      column_name: "Full Name",
      value_mode: "Concatenate fields",
      concat_source_1: "PA",
      concat_field_1: "First",
      concat_source_2: "PA",
      concat_field_2: "Last",
      concat_separator: " ",
    },
  };
  assert.match(
    ctx.atlasCreateColumnSentence(step),
    /with a space between them/,
  );
  assert.match(ctx.atlasDevCreateColumn(step).sql, /CONCAT\(.*, ' ', .*\)/);
});

test("a written expression becomes a description and is flagged", () => {
  const ctx = load();
  const params = ctx.atlasNormalizeCreateColumnStructuredParams({
    value_mode: "Expression / calculation",
    expression_type: "custom_expression",
    expression: "Hourly rate times standard hours",
  });
  assert.equal(params.column_description, "Hourly rate times standard hours");
  assert.equal(params.expression, "Hourly rate times standard hours");
  assert.equal(ctx.atlasCreateColumnStructuredProblems(params).length, 1);
  assert.match(
    ctx.renderCreateModeInputs(params),
    /written as an expression[\s\S]*data-param="column_description"/,
  );
  const runnable = {
    value_mode: "Expression / calculation",
    expression_type: "first_characters",
  };
  assert.equal(ctx.atlasCreateColumnIsWrittenExpression(runnable), false);
});

test("a run parameter condition is stored as values with a run date mirror", () => {
  const ctx = load();
  const leaf = ctx.atlasNormalizeConditionLeaf({
    id: "c1",
    fieldName: "End Date",
    operator: "is less than",
    valueMode: "parameter",
    compareValue: "2024-01-01",
  });
  assert.equal(leaf.valueMode, "values");
  assert.equal(leaf.compareParameter, "runDate");
  assert.equal(leaf.compareValue, "run date");
  assert.equal(leaf.compareValues, undefined);
  assert.equal(ctx.atlasConditionUiValueMode(leaf), "parameter");
  assert.deepEqual(plain(ctx.atlasConditionProblems(leaf)), []);
  assert.match(ctx.conditionToPlain(leaf, true), /is less than the run date/);
  assert.match(ctx.atlasDevConditionLeaf(leaf, "sql"), /< @RunDate/);

  const text = ctx.atlasNormalizeConditionLeaf({
    operator: "contains",
    valueMode: "parameter",
  });
  assert.equal(text.compareValue, "");
  assert.equal(ctx.atlasConditionProblems(text).length, 1);
});

test("value lists are kept as arrays and as one value per line", () => {
  const ctx = load();
  const leaf = ctx.atlasNormalizeConditionLeaf({
    valueMode: "values",
    operator: "is equal to",
    compareValue: "A\n B \n\nC",
    compareParameter: "",
  });
  assert.deepEqual(plain(leaf.compareValues), ["A", "B", "C"]);
  assert.equal(leaf.compareValue, "A\nB\nC");
  assert.equal("compareParameter" in leaf, false);
  const field = ctx.atlasNormalizeConditionLeaf({
    valueMode: "field",
    compareValues: ["x"],
  });
  assert.equal(field.compareValues, undefined);

  const step = { params: {} };
  ctx.atlasWriteLiveEditorConditions(step, [
    { id: "a", valueMode: "parameter", operator: "is equal to" },
    {
      id: "g",
      conditionType: "group",
      items: [{ id: "b", valueMode: "values", compareValue: "1\n2" }],
    },
  ]);
  const tree = JSON.parse(step.params.conditions_json);
  assert.equal(tree[0].compareParameter, "runDate");
  assert.deepEqual(tree[1].items[0].compareValues, ["1", "2"]);
});

test("format field maps legacy text and keeps a mirror the compiler reads", () => {
  const ctx = load();
  const pad = ctx.atlasNormalizeFormatFieldParams({
    field_name: "Pernr",
    format: "eight digits with leading zeros",
  });
  assert.equal(pad.format_kind, "zeroPad");
  assert.equal(pad.format_width, "8");
  assert.equal(pad.format, "8 digits with leading zeros");
  assert.deepEqual(plain(ctx.atlasFormatFieldProblems(pad)), []);

  const date = ctx.atlasNormalizeFormatFieldParams({
    field_name: "Hire Date",
    format_kind: "date",
    format_date_output: "YYYY-MM-DD",
  });
  assert.equal(date.format, "YYYY-MM-DD");

  // Settings the current compiler can't run get a mirror it blocks.
  const decimals = ctx.atlasNormalizeFormatFieldParams({
    field_name: "Rate",
    format_kind: "number",
    format_decimals: "2",
  });
  assert.equal(decimals.format, "number (decimals)");
  const upper = ctx.atlasNormalizeFormatFieldParams({
    field_name: "Name",
    format_kind: "upper",
  });
  assert.equal(upper.format, "upper");

  assert.deepEqual(plain(ctx.atlasFormatFieldProblems({ format: "fancy" })), [
    "Choose the field.",
    'The format "fancy" is not a known format. Choose one.',
  ]);
  assert.equal(
    ctx.atlasFormatFieldProblems({
      field_name: "Code",
      format_kind: "zeroPad",
      format_width: "101",
    }).length,
    1,
  );
});

test("remove duplicates needs key fields and a known keep choice", () => {
  const ctx = load();
  assert.deepEqual(
    plain(ctx.atlasRemoveDuplicatesProblems({ duplicate_action: "Keep any" })),
    ["Choose at least one key field.", "Choose which record to keep."],
  );
  assert.deepEqual(
    plain(
      ctx.atlasRemoveDuplicatesProblems({
        duplicate_fields_json: JSON.stringify([
          { sourceFile: "PA", fieldName: "Pernr" },
        ]),
        duplicate_action: "Keep last record",
      }),
    ),
    [],
  );
});
