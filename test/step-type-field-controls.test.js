/**
 * Field controls: the palette in catalogs/step-types/controls.json, the
 * schema's control list and the runtime's FIELD_CONTROLS agree, the palette
 * check rejects what a control does not read, and the field-based Format
 * Field, Split Field, Create Column, Join, IF / THEN and ELSE definitions read
 * as the block editors did.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadStepTypeEngine } from "../src/step-type-engine.js";
import { loadApp } from "./support/step-type-harness.js";

const readJson = (file) =>
  JSON.parse(
    readFileSync(new URL(`../catalogs/step-types/${file}`, import.meta.url)),
  );

const palette = readJson("controls.json");
const schema = readJson("schema.json");

function fieldControlEnum() {
  const field = schema.$defs?.field || schema.definitions?.field;
  const found = JSON.stringify(field || schema).match(
    /"control":\{[^}]*"enum":(\[[^\]]*\])/,
  );
  assert.ok(found, "schema lists the field controls");
  return JSON.parse(found[1]);
}

test("palette, schema and runtime list the same controls", () => {
  const { options } = loadStepTypeEngine();
  const names = palette.controls.map((control) => control.name);
  assert.equal(new Set(names).size, names.length, "control names are unique");
  assert.deepEqual([...fieldControlEnum()].sort(), [...names].sort());
  const available = palette.controls
    .filter((control) => control.status === "available")
    .map((control) => control.name);
  assert.deepEqual([...options.controls].sort(), [...available].sort());
});

test("every bundled definition passes the palette check", () => {
  const { engine, options } = loadStepTypeEngine();
  for (const file of [
    "format_field.json",
    "split_field.json",
    "create_column.json",
    "join.json",
    "union_sources.json",
    "if_then.json",
    "else.json",
    "filter_rows.json",
    "flag_records.json",
  ]) {
    const result = engine.definitions.validate(readJson(file), {
      ...options,
      schema,
    });
    assert.equal(JSON.stringify(result.errors || []), "[]", file);
  }
});

function withField(field) {
  const definition = structuredClone(readJson("format_field.json"));
  definition.fields.push(field);
  return definition;
}

function errorsFor(definition) {
  const { engine, options } = loadStepTypeEngine();
  const result = engine.definitions.validate(definition, {
    ...options,
    schema,
  });
  return (result.errors || [])
    .map((error) => `${error.path} ${error.message}`)
    .join("\n");
}

test("palette check rejects properties, features and options a control does not read", () => {
  assert.match(
    errorsFor(
      withField({ param: "extra", control: "toggle", label: "X", min: 1 }),
    ),
    /does not read "min"/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "extra",
        control: "choice",
        label: "X",
        options: [{ value: "a", label: "A", colour: "red" }],
      }),
    ),
    /colour/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "extra",
        control: "text",
        label: "X",
        features: { nesting: false },
      }),
    ),
    /features|nesting/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "conditions_json",
        control: "condition_group",
        features: { groupChecks: false },
      }),
    ),
    /"groupChecks" is planned/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "then_action_type",
        control: "action",
        features: { display: false },
      }),
    ),
    /"display" cannot be switched off yet/,
  );
});

test("palette check accepts the switchable composite features", () => {
  assert.equal(
    errorsFor(
      withField({
        param: "conditions_json",
        control: "condition_group",
        features: { nesting: false },
      }),
    ),
    "",
  );
  assert.equal(
    errorsFor(
      withField({
        param: "then_action_type",
        control: "action",
        features: { freeform: false },
      }),
    ),
    "",
  );
});

test("palette check rejects a control the runtime cannot render", () => {
  const { engine, options } = loadStepTypeEngine();
  const result = engine.definitions.validate(
    withField({ param: "conditions_json", control: "condition_group" }),
    {
      ...options,
      controls: options.controls.filter((name) => name !== "condition_group"),
      schema,
    },
  );
  assert.match(JSON.stringify(result.errors || []), /condition_group/);
});

test("template render escapes text and values separately", () => {
  const { engine } = loadStepTypeEngine();
  const out = engine.templates.render(
    'Say "{{param.x}}" <b>',
    { param: { x: `<a href="y">'` } },
    {
      escapeText: (text) => text.replace(/</g, "&lt;"),
      escapeValue: (value) => String(value).replace(/["'<]/g, "_"),
    },
  );
  assert.equal(out, 'Say "_a href=_y_>_" &lt;b>');
});

async function app() {
  const context = await loadApp();
  return {
    context,
    step(stepType, params) {
      context.__step = { id: "s1", step_type: stepType, params };
      return vm.runInContext("normalizeCatalogStep(__step)", context);
    },
    run(code, step) {
      context.__step = step;
      return vm.runInContext(code, context);
    },
  };
}

test("split field reads in analyst and developer logic", async () => {
  const { step, run } = await app();
  const width = step("split_field", {
    source_file: "PA",
    field_name: "Code",
    split_by: "width",
    split_mode: "part",
    split_width: "3",
    split_part: "2",
    output_column: "Mid",
  });
  assert.match(
    run("analystLogic(__step)", width),
    /pieces of 3 characters and display part 2 in column/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", width).sql,
    /SUBSTRING\(.*, 4, 3\)/,
  );
  const explode = step("split_field", {
    source_file: "PA",
    field_name: "Code",
    split_by: "delimiter",
    split_mode: "explode",
    split_delimiter: "comma",
  });
  assert.match(
    run("analystLogic(__step)", explode),
    /on the comma and make one record for each part/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", explode).python,
    /df\.explode/,
  );
});

test("a hidden option is kept for a saved step that uses it", async () => {
  const { context, step } = await app();
  vm.runInContext(
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      const definitions = bundled.definitions.map((definition) => {
        if (definition.id !== "split_field") return definition;
        const copy = structuredClone(definition);
        copy.fields
          .find((field) => field.param === "split_mode")
          .options.find((option) => option.value === "explode").hidden = true;
        return copy;
      });
      ATLASStepTypeRuntime.loadBundled({ ...bundled, definitions });
    })()`,
    context,
  );
  const editor = (mode) =>
    context.ATLASStepTypeRuntime.renderEditor(
      step("split_field", {
        source_file: "PA",
        field_name: "Code",
        split_by: "delimiter",
        split_mode: mode,
        split_delimiter: "comma",
      }),
    );
  assert.doesNotMatch(editor("part"), /value="explode"/);
  assert.match(editor("explode"), /value="explode"/);
});

test("the editor redraws on params that decide what it shows", async () => {
  const { context } = await app();
  const params = context.ATLASStepTypeRuntime.rerenderParams();
  for (const param of [
    "format_kind",
    "split_by",
    "split_mode",
    "value_mode",
    "string_operation",
    "string_split_mode",
    "string_split_column_count",
  ])
    assert.ok(params.includes(param), param);
});

test("an unknown format shows an escaped callout and no format choice", async () => {
  const { step, run } = await app();
  const html = run(
    "renderGuidedBuilder(__step)",
    step("format_field", {
      source_file: "PA",
      field_name: "Code",
      format: `<b>&"'x`,
    }),
  );
  assert.match(
    html,
    /role="note">This step's format is written as "&lt;b&gt;&amp;&quot;&#39;x", which is not a known format\./,
  );
});

test("create column reads in analyst and developer logic", async () => {
  const { step, run } = await app();
  const since = step("create_column", {
    column_name: "Days Since Hire",
    value_mode: "Date difference",
    date_diff_source_file: "PA0041",
    date_diff_field: "Hire Date",
  });
  assert.match(
    run("analystLogic(__step)", since),
    /days from .*Hire Date.* to the run date/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", since).sql,
    /DATEDIFF\(day, .*@RunDate\)/,
  );
  const joined = step("create_column", {
    column_name: "Full Name",
    value_mode: "Concatenate fields",
    concat_source_1: "PA",
    concat_field_1: "First",
    concat_source_2: "PA",
    concat_field_2: "Last",
    concat_separator: " ",
  });
  assert.match(
    run("analystLogic(__step)", joined),
    /with a space between them/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", joined).sql,
    /CONCAT\(.*, ' ', .*\)/,
  );
});

test("a written create column expression shows as a description", async () => {
  const { context, step } = await app();
  const html = context.ATLASStepTypeRuntime.renderEditor(
    step("create_column", {
      column_name: "Rate",
      value_mode: "Expression / calculation",
      expression_type: "custom_expression",
      expression: "Hourly rate times standard hours",
    }),
  );
  assert.match(
    html,
    /written as an expression[\s\S]*data-param="column_description"[^>]*>Hourly rate times standard hours</,
  );
  assert.match(html, /value="Expression \/ calculation"/);
  const fresh = context.ATLASStepTypeRuntime.renderEditor(
    step("create_column", { column_name: "Rate", value_mode: "Static value" }),
  );
  assert.doesNotMatch(fresh, /Expression \/ calculation/);
});

test("a clearable field picker without a clear key clears by param", async () => {
  const { context, step } = await app();
  const html = vm.runInContext(
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      const definitions = bundled.definitions.map((definition) => {
        if (definition.id !== "create_column") return definition;
        const copy = structuredClone(definition);
        delete copy.fields.find((field) => field.param === "concat_field_2")
          .clearKey;
        return copy;
      });
      ATLASStepTypeRuntime.loadBundled({ ...bundled, definitions });
      return ATLASStepTypeRuntime.renderEditor(__step);
    })()`,
    Object.assign(context, {
      __step: step("create_column", {
        column_name: "C",
        value_mode: "Concatenate fields",
        concat_source_2: "PA",
        concat_field_2: "Last",
      }),
    }),
  );
  assert.match(
    html,
    /data-clear-param="concat_field_2" data-clear-source-param="concat_source_2" aria-label="Clear Second Field">Clear</,
  );
  assert.match(html, /data-clear-concat-field="1"[^>]*disabled/);
});

test("equalsIgnoreCase matches a value in any case, without trimming", () => {
  const { engine } = loadStepTypeEngine();
  const condition = { param: "join_type", equalsIgnoreCase: "UNION" };
  const holds = (value) =>
    engine.definitions.matches(condition, { params: { join_type: value } });
  assert.equal(holds("union"), true);
  assert.equal(holds("Union"), true);
  assert.equal(holds("UNION"), true);
  assert.equal(holds(" UNION"), false);
  assert.equal(holds(undefined), false);
});

test("join reads in analyst and developer logic", async () => {
  const { step, run } = await app();
  const keys = step("join", {
    join_type: "RIGHT JOIN",
    left_source: "wd",
    right_source: "sap",
    left_field: "Worker ID",
    right_field: "Pernr",
    join_keys_json: JSON.stringify([
      { id: "k1", left_field: "Worker ID", right_field: "Pernr" },
      { id: "k2", left_field: "Company", right_field: "BUKRS" },
    ]),
  });
  assert.match(
    run("analystLogic(__step)", keys),
    /column "Worker ID".*column "Pernr".*column "Company" with .*column "BUKRS"/,
  );
  const formulas = run("atlasDeveloperFormulas(__step)", keys);
  assert.match(formulas.lead, /^RIGHT JOIN/);
  assert.match(formulas.sql, /RIGHT JOIN \[sap\]\n {2}ON .* AND /);
  assert.match(formulas.python, /how="right"/);
  assert.equal(formulas.notes.length, 1);
  const union = step("join", {
    join_type: "union",
    left_source: "wd",
    right_source: "sap",
    output_source: "all",
  });
  assert.match(run("analystLogic(__step)", union), /^UNION file "wd"/);
  const unionFormulas = run("atlasDeveloperFormulas(__step)", union);
  assert.equal(unionFormulas.lead, undefined);
  assert.match(unionFormulas.excel, /^=VSTACK\(/);
  assert.match(unionFormulas.sql, /UNION ALL/);
});

test("the join editor keeps its own frame and follows the join type", async () => {
  const { context, step } = await app();
  const render = (params) =>
    context.ATLASStepTypeRuntime.renderEditor(step("join", params));
  const join = render({ join_type: "LEFT JOIN" });
  assert.match(
    join,
    /^<div class="guided-builder join-guided-builder"><h4>Join<\/h4>/,
  );
  assert.match(join, /data-join-keys-editor/);
  assert.doesNotMatch(join, /join-union-input-pair/);
  const union = render({ join_type: "Union" });
  assert.match(union, /<h4>Union Sources<\/h4>/);
  assert.match(union, /class="logic-picker-pair join-union-input-pair"/);
  assert.doesNotMatch(union, /data-join-keys-editor/);
  assert.equal(
    context.ATLASStepTypeRuntime.rerenderParams().includes("join_type"),
    true,
  );
});

const ifCondition = JSON.stringify([
  {
    connector: "IF",
    conditionType: "row_compare",
    sourceFile: "wd",
    sourceAlias: "wd",
    fieldName: "Status",
    operator: "is equal to",
    valueMode: "values",
    compareValue: "T",
  },
]);

test("if then shows its conditions and action on two tabs", async () => {
  const { context, step } = await app();
  const render = (params) =>
    context.ATLASStepTypeRuntime.renderEditor(step("if_then", params));
  const html = render({
    conditions_json: ifCondition,
    then_action_type: "display",
  });
  assert.match(html, /^<div class="guided-builder if-then-tabbed-builder">/);
  assert.doesNotMatch(html, /<h4>IF \/ THEN<\/h4>/);
  assert.match(
    html,
    /class="logic-editor-tab active" data-editor-tab="conditions"> Condition Builder </,
  );
  assert.match(
    html,
    /data-editor-panel="conditions"><div class="condition-guided-stack"/,
  );
  assert.match(
    html,
    /data-editor-panel="actions"><div class="then-action-builder/,
  );
  assert.match(html, /THEN Action Type/);
  vm.runInContext('atlasLogicEditorTab = "actions"', context);
  assert.match(
    render({ conditions_json: ifCondition }),
    /class="logic-editor-tab-panel active" data-editor-panel="actions"/,
  );
  vm.runInContext('atlasLogicEditorTab = ""', context);
});

test("a step without conditions gets one condition and its mirror", async () => {
  const { step } = await app();
  const saved = step("if_then", { field_name: "Status", source_file: "wd" });
  const conditions = JSON.parse(saved.params.conditions_json);
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].fieldName, "Status");
  assert.equal(saved.conditions.length, 1);
  assert.equal(saved.params.then_action_type, "display");
});

test("else keeps its frame without a heading and writes the ELSE action", async () => {
  const { context, step, run } = await app();
  const saved = step("else", { then_action_type: "do_not_display" });
  const html = context.ATLASStepTypeRuntime.renderEditor(saved);
  assert.match(
    html,
    /^<div class="guided-builder else-action-builder"><p class="hint">Configure what happens when the IF conditions are not met\.<\/p><div class="then-action-builder/,
  );
  assert.match(html, /ELSE Action Type/);
  assert.deepEqual(
    { ...run("ATLASStepTypeRuntime.qtestAction(__step)", saved) },
    { kind: "do_not_display" },
  );
  assert.match(run("analystLogic(__step)", saved), /ELSE/);
});

test("if then reads in analyst and developer logic", async () => {
  const { step, run } = await app();
  const saved = step("if_then", {
    conditions_json: ifCondition,
    then_action_type: "display_text",
    then_text: "Check",
    then_output_column: "Error Message",
  });
  assert.match(run("analystLogic(__step)", saved), /^IF .*Status.*Check/);
  const formulas = run("atlasDeveloperFormulas(__step)", saved);
  assert.match(formulas.excel, /^=IF\(/);
  assert.match(formulas.sql, /^CASE WHEN /);
  assert.equal(
    run("ATLASStepTypeRuntime.qtestAction(__step)", saved).kind,
    "display_text",
  );
});

test("filter rows reads in analyst and developer logic and hides rows", async () => {
  const { context, step, run } = await app();
  const saved = step("filter_rows", {
    source_file: "wd",
    field_name: "Status",
    operator: "is equal to",
    compare_value: "Active\nLeave",
    filter_action: "Exclude matching rows",
  });
  const html = context.ATLASStepTypeRuntime.renderEditor(saved);
  assert.match(
    html,
    /^<div class="selected-source-only-builder"><div class="guided-builder"><h4>Filter Rows<\/h4><input type="hidden" data-param="source_file" value="wd">/,
  );
  assert.match(
    html,
    /<span class="atlas-choice-heading">Filter Action<\/span>/,
  );
  assert.match(
    run("analystLogic(__step)", saved),
    /^IF .*Status.* is equal to "Active" or "Leave", THEN Exclude matching rows\.$/,
  );
  assert.equal(
    run("atlasDeveloperFormulas(__step)", saved).excel,
    '=NOT(OR([@[Status]]="Active", [@[Status]]="Leave"))',
  );
  assert.deepEqual(
    { ...run("ATLASStepTypeRuntime.qtestAction(__step)", saved) },
    { kind: "do_not_display" },
  );
});

test("flag records takes its qTest action from the export", async () => {
  const { context, step, run } = await app();
  const shown = step("flag_records", {
    source_file: "wd",
    field_name: "Email",
    operator: "is blank",
    message: "Missing email",
  });
  assert.deepEqual(
    { ...run("ATLASStepTypeRuntime.qtestAction(__step)", shown) },
    {
      kind: "display_text",
      message: "Missing email",
      outputColumn: "Error Message",
    },
  );
  // The output column shows the default column until one is named.
  assert.match(
    context.ATLASStepTypeRuntime.renderEditor(shown),
    /<label>Output Column<button[^>]*data-param-name="output_column"[^>]*><span class="visual-picker-trigger-copy"><strong>Error Message<\/strong>/,
  );
  assert.match(
    run("analystLogic(__step)", shown),
    /THEN display text response "Missing email" in column "Error Message"\.$/,
  );
  const hidden = step("flag_records", { flag_action: "do_not_display" });
  assert.deepEqual(
    { ...run("ATLASStepTypeRuntime.qtestAction(__step)", hidden) },
    { kind: "do_not_display" },
  );
  assert.match(
    run("analystLogic(__step)", hidden),
    /THEN do NOT display record\.$/,
  );
});

test("a qTest action without an action field is checked as a template", () => {
  const { engine, options } = loadStepTypeEngine();
  const definition = readJson("flag_records.json");
  definition.export.qtest.action.message = "{{nope param.message}}";
  const result = engine.definitions.validate(definition, {
    ...options,
    schema,
  });
  assert.ok(
    (result.errors || []).some(
      (error) => error.path === "/export/qtest/action/message",
    ),
    JSON.stringify(result.errors),
  );
});
