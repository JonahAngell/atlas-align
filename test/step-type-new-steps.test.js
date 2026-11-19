/**
 * New steps built from the definition (Phase 10, issue 5046 of the Dynamic
 * Step Type Builder plan): composite defaults in controls.json, one builder
 * for every way of adding a step, and the menus read from the registry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const read = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const run = (context, code) => vm.runInContext(code, context);
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

/** IF / THEN's Conditions and Action placed in a builder type. */
function checkRule() {
  const definition = structuredClone(read("catalogs/step-types/if_then.json"));
  definition.id = "check_rule";
  definition.label = "Check Rule";
  definition.order = 35;
  delete definition.aliases;
  return definition;
}

async function app() {
  const context = await loadApp();
  context.__extra = [checkRule()];
  run(
    context,
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      ATLASStepTypeRuntime.loadBundled({
        ...bundled,
        definitions: [...bundled.definitions, ...__extra],
      });
      atlasSyncStepTypeOptions?.();
      state.audit = normalizeLoadedAudit(
        { id: "new", name: "New", sources: [{ name: "wd", alias: "wd" }], steps: [] },
        "repo",
      );
      state.auditSelected = true;
    })()`,
  );
  return context;
}

test("composite defaults come from the control palette", async () => {
  const context = await app();
  assert.deepEqual(
    plain(run(context, "ATLASStepTypeRuntime.newStepDefaults('if_then')")),
    { blankCondition: true, params: { then_action_type: "display" } },
  );
  assert.deepEqual(
    plain(
      run(context, "ATLASStepTypeRuntime.newStepDefaults('create_column')"),
    ),
    { blankCondition: false, params: {} },
  );
});

test("a builder type with Conditions and Action starts like IF / THEN", async () => {
  const context = await app();
  const build = (type) =>
    plain(
      run(
        context,
        `atlasBuildNewStep(${JSON.stringify(type)}, { sourceFile: "wd" })`,
      ),
    );
  const ifThen = build("if_then");
  const builder = build("check_rule");
  for (const step of [ifThen, builder]) {
    assert.equal(step.params.then_action_type, "display");
    assert.equal(step.params.source_file, "wd");
    const conditions = JSON.parse(step.params.conditions_json);
    assert.equal(conditions.length, 1);
    assert.equal(conditions[0].sourceFile, "wd");
    assert.equal(conditions[0].fieldName, "");
    assert.equal(step.conditions.length, 1);
  }
  assert.equal(builder.title, "Check Rule");
  const column = build("create_column");
  assert.equal(column.params.conditions_json, undefined);
  assert.deepEqual(column.conditions, []);
});

test("the New Rule menu lists the registry's types with their own labels", async () => {
  const context = await app();
  const options = plain(run(context, "atlasNewRuleTypeOptions()"));
  assert.deepEqual(
    options.map(([value]) => value),
    [
      "create_column",
      "if_then",
      "check_rule",
      "join",
      "format_field",
      "split_field",
      "sort_records",
      "remove_duplicates",
    ],
  );
  assert.deepEqual(
    options.find(([value]) => value === "if_then"),
    ["if_then", "IF / THEN"],
  );
  const created = plain(run(context, "atlasCreateRuleOfType('check_rule')"));
  assert.equal(created.step_type, "check_rule");
  assert.equal(created.params.then_action_type, "display");
});

test("a Reference step offers the types that set referenceChild", async () => {
  const context = await app();
  assert.deepEqual(
    plain(run(context, "atlasReferenceChildTypeOptions().map(([v]) => v)")),
    ["create_column", "if_then"],
  );
});

test("Audit Issues adds a logic step with the same builder", async () => {
  const context = await app();
  const choices = plain(
    run(
      context,
      "atlasNewRuleTypeOptions().map(([value, label]) => ({ value, label }))",
    ),
  );
  assert.ok(choices.some((choice) => choice.value === "check_rule"));
  const source = readFileSync(
    new URL("../js/23-atlas-audit-issues.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /global\.atlasBuildNewStep\(type,/);
  assert.match(source, /global\.atlasNewRuleTypeOptions\(\)/);
});
