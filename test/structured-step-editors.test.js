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

test("split field reads in analyst and developer logic", () => {
  const ctx = load();
  const step = (params) => ({
    id: "s1",
    step_type: "split_field",
    params: { source_file: "PA", field_name: "Code", ...params },
  });
  assert.match(
    ctx.analystLogic(
      step({
        split_by: "width",
        split_mode: "part",
        split_width: "3",
        split_part: "2",
        output_column: "Mid",
      }),
    ),
    /pieces of 3 characters and display part 2 in column/,
  );
  assert.match(
    ctx.analystLogic(
      step({
        split_by: "delimiter",
        split_mode: "explode",
        split_delimiter: "comma",
      }),
    ),
    /on the comma and make one record for each part/,
  );
  const width = ctx.atlasDevSplitField(
    step({
      split_by: "width",
      split_mode: "part",
      split_width: "3",
      split_part: "2",
      output_column: "Mid",
    }),
  );
  assert.match(width.sql, /SUBSTRING\(.*, 4, 3\)/);
  const explode = ctx.atlasDevSplitField(
    step({
      split_by: "delimiter",
      split_mode: "explode",
      split_delimiter: "comma",
    }),
  );
  assert.match(explode.python, /df\.explode/);
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
    ctx.analystLogic(step),
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
  assert.match(ctx.analystLogic(step), /with a space between them/);
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
