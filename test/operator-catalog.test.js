/**
 * The operator catalog (Phase 10, issue 5047 of the Dynamic Step Type
 * Builder plan): app_config.logic_options.operator_catalog in the phrase
 * catalog is the one list of condition operators. Formula meanings, ELSE
 * inversion, text import and the editor's per-mode lists read it through
 * ATLASStepTypes.conditions.operatorCatalog.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildOperators } from "../tools/build-step-type-manifest.mjs";
import { loadApp } from "./support/step-type-harness.js";
import {
  loadStepTypeScripts,
  STEP_TYPE_ENGINE_SCRIPTS,
} from "./support/step-type-scripts.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const CATALOG = JSON.parse(read("catalogs/logic_phrase_catalog.json"));
const run = (context, code) => vm.runInContext(code, context);
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
const engine = () =>
  loadStepTypeScripts(vm.createContext({}), STEP_TYPE_ENGINE_SCRIPTS)
    .ATLASStepTypes.conditions;

test("js/step-types/operators.generated.js matches the phrase catalog", async () => {
  assert.equal(
    read("js/step-types/operators.generated.js"),
    await buildOperators(),
    "run npm run step-types:manifest",
  );
});

test("the operator catalog is consistent", () => {
  assert.deepEqual(
    plain(engine().operatorProblems(CATALOG.app_config.logic_options)),
    [],
  );
  assert.deepEqual(plain(engine().operatorProblems()), []);
});

test("every operator has an opposite, and opposites pair up", () => {
  const { entries, inverses } = engine().operatorCatalog();
  assert.equal(Object.keys(inverses).length, entries.length);
  for (const [operator, opposite] of Object.entries(inverses))
    if (!/greater|less/.test(operator))
      assert.equal(inverses[opposite], operator, operator);
  assert.equal(inverses["is greater than"], "is less than or equal to");
  assert.equal(inverses["is less than or equal to"], "is greater than");
});

test("sentence spellings are read longest first", () => {
  const { sentence } = engine().operatorCatalog();
  sentence.forEach((spelling, index) =>
    sentence
      .slice(index + 1)
      .forEach((later) =>
        assert.ok(
          !later.startsWith(spelling) || later === spelling,
          `${later} after ${spelling}`,
        ),
      ),
  );
  assert.ok(sentence.includes("is blank"));
  assert.ok(!sentence.includes("="), "formula aliases are not read in text");
});

test("run parameters read the parameter set", () => {
  const conditions = engine();
  assert.deepEqual(
    [...conditions.PARAMETER_OPERATORS],
    CATALOG.app_config.logic_options.operator_sets.parameter,
  );
});

test("an operator added to the catalog reaches inversion, import and the editor", async () => {
  const context = await loadApp();
  run(
    context,
    `(() => {
      const options = phraseCatalog.app_config.logic_options;
      options.operator_catalog = [
        ...options.operator_catalog,
        { value: "is within", inverse: "is not within", aliases: ["lies within"] },
        { value: "is not within", inverse: "is within" },
      ];
      options.operator_sets = {
        ...options.operator_sets,
        values: [...options.operator_sets.values, "is within", "is not within"],
      };
    })()`,
  );
  assert.equal(
    run(context, 'inverseConditionOperator("is within")'),
    "is not within",
  );
  assert.ok(
    plain(run(context, 'atlasOperatorListForValueMode("values")')).includes(
      "is within",
    ),
  );
  assert.ok(
    plain(run(context, 'atlasImportOperatorsForMode("values")')).includes(
      "is not within",
    ),
  );
  assert.deepEqual(
    plain(run(context, 'atlasImportMatchOperator("lies within \\"x\\"")')),
    { operator: "is within", length: "lies within".length },
  );
});
