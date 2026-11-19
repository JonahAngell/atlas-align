/**
 * Field `normalize` handlers and validation rules with inline fixes (5052).
 *
 * The per-type clean-up the editor ran on save, and the per-type field
 * problems Audit Issues listed, now come from the step type definitions:
 * a field names a normalize handler, and a validation rule names the param,
 * the inline fix and (for the editors' own checks) a problem check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const run = (context, code) =>
  JSON.parse(JSON.stringify(vm.runInContext(code, context) ?? null));

const withStep = (context, step) => {
  context.__step = step;
};

test("saving a Display card keeps the toggle's choice", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "if_then",
    params: {
      then_action_type: "display",
      then_display_mode: "do_not_display",
      then_exclude_scope: "key",
      then_exclude_key_field: "Worker ID",
      then_exclude_key_source_file: "WD_Workers",
    },
  });
  assert.equal(
    run(context, "ATLASStepTypeRuntime.normalizeFields(__step)"),
    true,
  );
  const params = run(context, "__step.params");
  // display_toggle (the kind's field) runs before exclude_scope (the action
  // field), so the key scope is kept for the Do Not Display it became.
  assert.equal(params.then_action_type, "do_not_display");
  assert.equal(params.then_display_mode, undefined);
  assert.equal(params.then_exclude_scope, "key");
  assert.equal(params.then_action, "Do not display all records for this key");
  assert.deepEqual(JSON.parse(params.then_exclude_key_fields_json), [
    {
      sourceFile: "WD_Workers",
      sourceAlias: params.then_exclude_key_source_alias,
      fieldName: "Worker ID",
    },
  ]);
});

test("the key scope is dropped from an action that is not Do Not Display", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "else",
    params: {
      then_action_type: "display_text",
      then_exclude_scope: "key",
      then_exclude_key_field: "Worker ID",
    },
  });
  run(context, "ATLASStepTypeRuntime.normalizeFields(__step)");
  const params = run(context, "__step.params");
  assert.equal(params.then_exclude_scope, undefined);
  assert.equal(params.then_exclude_key_field, undefined);
});

test("editor-only clean-up waits for a save", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "if_then",
    params: { then_action_type: "display", then_display_mode: "x" },
  });
  // Loading a step keeps what it saved: then_display_mode is editor input.
  run(context, "normalizeCatalogStep(__step, 0)");
  assert.equal(run(context, "__step.params.then_display_mode"), "x");
});

test("the latest definitions name their normalize handlers", async () => {
  const context = await loadApp();
  const normalizers = run(
    context,
    `Object.fromEntries(
      ["split_field", "format_field", "create_column", "if_then", "else"].map(
        (id) => [
          id,
          ATLASStepTypeRuntime.registry()
            .get(id)
            .fields.filter((field) => field.normalize)
            .map((field) => field.normalize),
        ],
      ),
    )`,
  );
  assert.deepEqual(normalizers, {
    split_field: ["split_field_params"],
    format_field: ["format_field_params"],
    create_column: [
      "create_column_string_transform",
      "create_column_structured",
    ],
    if_then: ["exclude_scope"],
    else: ["exclude_scope"],
  });
});

test("field problems come from rules with a param and an inline fix", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "split_field",
    params: { split_by: "delimiter", split_mode: "part" },
  });
  const problems = run(context, "ATLASStepTypeRuntime.fieldProblems(__step)");
  assert.deepEqual(
    problems.map((problem) => [problem.param, problem.message]),
    [
      ["field_name", "Split field: Choose the field."],
      ["split_delimiter", "Split field: Choose a delimiter."],
      ["output_column", "Split field: Choose the output column."],
    ],
  );
  assert.deepEqual(problems[0].fix, {
    sourceParam: "source_file",
    title: "Choose field to split",
  });
  assert.equal(problems[1].fix.choices[0].value, "space");
  // validate() leaves them to fieldProblems, so no issue is listed twice.
  assert.deepEqual(run(context, "ATLASStepTypeRuntime.validate(__step)"), []);
});

test("a written Create Column expression is a warning", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "create_column",
    params: {
      column_name: "Flag",
      value_mode: "Expression / calculation",
      expression: "A+B",
    },
  });
  const problems = run(context, "ATLASStepTypeRuntime.fieldProblems(__step)");
  const written = problems.find((problem) => problem.param === "value_mode");
  assert.equal(written?.severity, "warning");
  assert.equal(written.fix.title, "Choose value type");
});

test("Do Not Display by key needs its key field", async () => {
  const context = await loadApp();
  withStep(context, {
    id: "s1",
    step_type: "if_then",
    params: { then_action_type: "do_not_display", then_exclude_scope: "key" },
  });
  assert.deepEqual(run(context, "ATLASStepTypeRuntime.fieldProblems(__step)"), [
    {
      id: "exclude_key_field",
      severity: "critical",
      param: "then_exclude_key_field",
      label: "then_exclude_key_field",
      title: "IF / THEN step needs attention",
      message: "Do Not Display: choose the key field whose records are hidden.",
      fix: {
        sourceParam: "then_exclude_key_source_file",
        title: "Choose key field",
      },
    },
  ]);
});

test("a pinned version without the rules still gets the latest field problems", async () => {
  const context = await loadApp();
  context.__v4 = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/step-types-pinned/format_field.v4.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(context.__v4.validation || [], []);
  vm.runInContext(
    `ATLASStepTypeRuntime.registry().add(__v4);
    ATLASStepTypeRuntime.usePinnedVersions({ format_field: 4 });`,
    context,
  );
  withStep(context, {
    id: "s1",
    step_type: "format_field",
    params: { field_name: "Pay", format_kind: "zeroPad", format_width: "0" },
  });
  assert.equal(
    run(context, "ATLASStepTypeRuntime.definitionFor(__step).version"),
    4,
  );
  assert.deepEqual(
    run(context, "ATLASStepTypeRuntime.fieldProblems(__step)").map(
      (problem) => problem.param,
    ),
    ["format_width"],
  );
});

test("definitions name only known normalize handlers and problem checks", async () => {
  const context = await loadApp();
  const errors = run(
    context,
    `(() => {
      const definition = JSON.parse(
        JSON.stringify(ATLASStepTypeRuntime.registry().get("split_field")),
      );
      definition.version = 901;
      definition.fields[2].normalize = "not_a_handler";
      definition.validation = [
        { problems: { check: "not_a_check" }, severity: "critical", param: "field_name" },
        { problems: { check: "split_field", match: "(" }, severity: "critical" },
        { check: { param: "field_name", notBlank: true }, severity: "warning", message: "x", fix: { title: "Fix" } },
        { problems: { check: "split_field" }, require: "field_name", severity: "warning" },
        { problems: { check: "split_field" }, severity: "warning", param: "absent" },
      ];
      return ATLASStepTypes.definitions
        .validate(definition, {
          schema: ATLASStepTypes.bundled.schema,
          helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
          blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
          handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
          problemChecks: [...ATLASStepTypeRuntime.PROBLEM_CHECK_NAMES],
          palette: ATLASStepTypes.bundled.controls,
        })
        .errors.map((error) => \`\${error.path} \${error.message}\`);
    })()`,
  );
  assert.deepEqual(errors, [
    '/fields/2/normalize unknown normalize handler "not_a_handler"',
    '/validation/0/problems/check unknown problem check "not_a_check"',
    "/validation/1/problems/match is not a regular expression",
    "/validation/2/fix an inline fix needs param or require",
    "/validation/3 a problems rule takes no require or check",
    '/validation/4/param "absent" is not a field of this step type',
  ]);
});
