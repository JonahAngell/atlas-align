/**
 * Text import of a definition's Conditions and Action (5051).
 *
 * A builder type whose English writes {{> conditionText}} (or the replaced
 * conditionText helper) and {{action "english"}} imports from its sentence:
 * the runtime matches the sentence and hands the conditions and the action
 * to the app's IF / THEN readers, registered with useImporters.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const SCHEMA = JSON.parse(
  readFileSync(
    new URL("../catalogs/step-types/schema.json", import.meta.url),
    "utf8",
  ),
);

/** A builder type: "Review IF … THEN …", read with the IF / THEN readers. */
const reviewRule = (overrides = {}) => ({
  schemaVersion: 2,
  id: "review_rule",
  version: 1,
  label: "Review Rule",
  status: "active",
  order: 95,
  fields: [
    {
      param: "conditions_json",
      control: "condition_group",
      label: "Conditions",
    },
    {
      param: "then_action_type",
      control: "action",
      label: "THEN action",
      branch: "THEN",
      ...(overrides.actionField || {}),
    },
  ],
  english: {
    default:
      overrides.english ||
      'Review {{> conditionText}} THEN {{action "english"}}',
  },
  partials: {
    conditionText: "{{conditionText param.conditions_json step}}",
  },
  formulas: {
    shape: "filter",
    fallback: { notes: ["Write the review test by hand."] },
  },
  export: { scriptRole: "condition" },
  textImport: { fromEnglish: true },
});

async function appWith(definitions) {
  const context = await loadApp();
  context.__schema = SCHEMA;
  context.__definitions = definitions;
  const results = vm.runInContext(
    `(() => {
      const registry = ATLASStepTypes.registry.createRegistry({
        schema: __schema,
        helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
        blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
        handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
      });
      const results = [
        ...ATLASStepTypes.bundled.definitions,
        ...__definitions,
      ].map((definition) => registry.add(definition));
      ATLASStepTypeRuntime.useRegistry(registry);
      return results;
    })()`,
    context,
  );
  results.forEach((result) =>
    assert.equal(result.ok, true, JSON.stringify(result.errors)),
  );
  return context;
}

const run = (context, code) =>
  JSON.parse(JSON.stringify(vm.runInContext(code, context) ?? null));

const SENTENCE =
  'Review IF file "wd" column "Status" is equal to text values "Active" THEN display text response "Check status" in new column "Review".';

test("a builder type with Conditions and Action imports from its sentence", async () => {
  const context = await appWith([reviewRule()]);
  context.__sentence = SENTENCE;
  const draft = run(context, "atlasParseImportedLogicText(__sentence)");
  assert.equal(draft.ok, true, draft.message);
  assert.equal(draft.stepType, "review_rule");
  assert.equal(draft.title, "Review Rule");
  assert.equal(draft.conditionParam, "conditions_json");
  assert.equal(draft.conditions.length, 1);
  assert.equal(draft.conditions[0].fieldName, "Status");
  assert.equal(draft.params.then_action_type, "display_text");
  // The condition's file and column are references the dialog maps.
  assert.ok(
    draft.references.some(
      (reference) => reference.kind === "source" && reference.token === "wd",
    ),
  );

  const built = run(
    context,
    `atlasImportMaterialize(atlasParseImportedLogicText(__sentence), {
      sources: { "c0-source": { sourceFile: "WD_Workers", sourceAlias: "wd" } },
      fields: { "c0-field": "Status" },
    })`,
  );
  assert.equal(built.ok, true, built.message);
  assert.equal(built.step.step_type, "review_rule");
  const stored = JSON.parse(built.step.params.conditions_json);
  assert.equal(stored[0].sourceFile, "WD_Workers");
  assert.equal(stored[0].fieldName, "Status");
  assert.equal(stored[0].operator, "is equal to");
  assert.equal(built.step.params.then_action_type, "display_text");
  // The imported step writes a sentence that imports as the same type.
  context.__built = built.step;
  const written = run(context, "ATLASStepTypeRuntime.english(__built)");
  assert.match(
    written,
    /^Review IF file "wd" column "Status" .+ THEN display text response "Check status" in new column "Review"/,
  );
  context.__written = written;
  const again = run(context, "atlasParseImportedLogicText(__written)");
  assert.equal(again.ok, true, again.message);
  assert.equal(again.stepType, "review_rule");
  assert.equal(again.conditions[0].compareValue, "Active");
});

test("the replaced conditionText helper captures the conditions too", async () => {
  const context = await appWith([
    reviewRule({
      english:
        'Review {{conditionText param.conditions_json step}} THEN {{action "english"}}',
    }),
  ]);
  context.__sentence =
    'Review IF file "wd" column "Status" is equal to text values "Active" THEN do NOT display.';
  const draft = run(context, "atlasParseImportedLogicText(__sentence)");
  assert.equal(draft.ok, true, draft.message);
  assert.equal(draft.stepType, "review_rule");
  assert.equal(draft.params.then_action_type, "do_not_display");
});

test("an action the field switches off is not imported", async () => {
  const context = await appWith([
    reviewRule({ actionField: { features: { freeform: false } } }),
  ]);
  context.__sentence =
    'Review IF file "wd" column "Status" is equal to text values "Active" THEN check it by hand.';
  const draft = run(context, "atlasParseImportedLogicText(__sentence)");
  assert.equal(draft.ok, false);
  assert.match(draft.message, /Review Rule does not offer the .+ action\./);
});

test("unreadable conditions explain what to fix", async () => {
  const context = await appWith([reviewRule()]);
  context.__sentence = "Review IF something odd THEN display records.";
  const draft = run(context, "atlasParseImportedLogicText(__sentence)");
  assert.equal(draft.ok, false);
  assert.notEqual(
    draft.message,
    run(context, "ATLAS_IMPORT_UNRECOGNIZED"),
    "the message comes from the conditions reader",
  );
});

test("the bundled IF / THEN reader keeps priority", async () => {
  const context = await appWith([reviewRule()]);
  context.__sentence = SENTENCE.replace(/^Review /, "");
  const draft = run(context, "atlasParseImportedLogicText(__sentence)");
  assert.equal(draft.ok, true, draft.message);
  assert.equal(draft.stepType, "if_then");
});

test("without importers a Conditions sentence does not match", async () => {
  const context = await appWith([reviewRule()]);
  vm.runInContext(
    "ATLASStepTypeRuntime.useImporters({ conditions: null, action: null })",
    context,
  );
  context.__sentence = SENTENCE;
  assert.equal(
    run(context, "ATLASStepTypeRuntime.parseText(__sentence)"),
    null,
  );
});
