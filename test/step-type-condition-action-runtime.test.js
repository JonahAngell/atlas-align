/**
 * Condition and action text after the app code was removed (Phase 8, branch
 * 5035 of the Dynamic Step Type Builder plan).
 *
 * The IF / THEN, ELSE, Filter Rows and Flag Records wording, formulas and
 * qTest action now come only from their definitions. Older pinned versions
 * render through the latest versions' partials (replaced helpers), and the
 * complete statements and the qTest condition read the if_then partials
 * through ATLASStepTypeRuntime.partial.
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

const REPLACED = [
  "actionText",
  "conditionFormula",
  "conditionText",
  "elseFormula",
  "ifThenFormula",
];
const LATEST = ["if_then", "else", "filter_rows", "flag_records"];
const PINNED = [
  "if_then.v2.json",
  "else.v2.json",
  "filter_rows.v2.json",
  "flag_records.v3.json",
].map((file) => read(`test/fixtures/step-types-pinned/${file}`));

/** The app with the older pinned definitions next to the bundled ones. */
async function appWithPins() {
  const context = await loadApp();
  context.__pinned = structuredClone(PINNED);
  run(
    context,
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      ATLASStepTypeRuntime.loadBundled({
        ...bundled,
        definitions: [...bundled.definitions, ...__pinned],
      });
    })()`,
  );
  return context;
}

const AUDIT = {
  id: "runtime",
  name: "Runtime",
  sources: [{ name: "wd", alias: "wd" }],
  steps: [
    {
      id: "if_1",
      step_type: "if_then",
      title: "Check status",
      params: {
        conditions_json: JSON.stringify([
          {
            id: "c1",
            connector: "IF",
            sourceFile: "wd",
            fieldName: "Status",
            operator: "is equal to",
            compareValue: "Active",
          },
          {
            id: "c2",
            connector: "AND",
            sourceFile: "wd",
            fieldName: "Amount",
            operator: "is greater than",
            compareValue: "100",
          },
        ]),
        then_action_type: "display_text",
        then_text: "Check pay",
        then_output_column: "Error Message",
      },
    },
    {
      id: "flag_1",
      step_type: "flag_records",
      title: "Flag inactive",
      params: {
        source_file: "wd",
        field_name: "Status",
        operator: "is equal to",
        compare_value: "Inactive",
        message: "Inactive",
        output_column: "Flag",
      },
    },
  ],
};

function useAudit(context) {
  context.__document = structuredClone(AUDIT);
  run(
    context,
    `state.audit = normalizeLoadedAudit(__document, "repo"); state.auditSelected = true;`,
  );
}

test("the app's own condition and action code is gone", async () => {
  const context = await loadApp();
  for (const name of [
    "thenActionPlain",
    "elseActionPlain",
    "conditionGroupPlain",
    "conditionToPlain",
    "conditionTreePlain",
    "ensureIfThenPrefix",
    "excludeKeyColumnPlain",
    "atlasDevIfThen",
    "atlasDevElse",
    "atlasDevLegacyCondition",
    "atlasDevConditionTree",
    "atlasDevConditionLeaf",
    "atlasDevActionValue",
    "atlasDevFilterFormulas",
    "atlasQtestThenAction",
  ])
    assert.equal(run(context, `typeof ${name}`), "undefined", name);
});

test("the latest versions need none of the replaced helpers", async () => {
  const context = await loadApp();
  const replaced = Object.keys(
    run(context, "ATLASStepTypeLibrary.replacedHelpers"),
  ).sort();
  assert.deepEqual(replaced, REPLACED);
  for (const id of LATEST) {
    const source = JSON.stringify(read(`catalogs/step-types/${id}.json`));
    for (const name of replaced)
      assert.ok(
        !new RegExp(`[{(]${name}\\b`).test(source),
        `${id} calls ${name}`,
      );
  }
});

test("pinned versions render like the latest, qTest action included", async () => {
  const context = await appWithPins();
  useAudit(context);
  const outputs = (pins) =>
    plain(
      run(
        context,
        `(() => {
          ATLASStepTypeRuntime.usePinnedVersions(${JSON.stringify(pins)});
          try {
            return state.audit.steps.map((step) => ({
              version: ATLASStepTypeRuntime.definitionFor(step).version,
              english: ATLASStepTypeRuntime.english(step),
              formulas: ATLASStepTypeRuntime.formulas(step),
              qtestAction: ATLASStepTypeRuntime.qtestAction(step),
            }));
          } finally {
            ATLASStepTypeRuntime.usePinnedVersions(null);
          }
        })()`,
      ),
    );
  const latest = outputs(null);
  const pinned = outputs({ if_then: 2, flag_records: 3 });
  assert.deepEqual(
    pinned.map((item) => item.version),
    [2, 3],
  );
  assert.deepEqual(
    latest.map((item) => item.version),
    ["if_then", "flag_records"].map(
      (id) => read(`catalogs/step-types/${id}.json`).version,
    ),
  );
  pinned.forEach(({ version: _version, ...rest }, index) => {
    const { version: _latest, ...expected } = latest[index];
    assert.deepEqual(rest, expected);
  });
  assert.deepEqual(latest[0].qtestAction, {
    kind: "display_text",
    message: "Check pay",
    outputColumn: "Error Message",
  });
  assert.match(latest[0].formulas.sql, /CASE WHEN \[Status\] = 'Active'/);
});

test("a replaced helper writes nothing when no version has its partials", async () => {
  const context = await loadApp();
  const helpers = run(context, "ATLASStepTypeLibrary.helpers");
  for (const name of REPLACED) assert.equal(helpers[name]([], {}, {}), "");
});

test("partial renders one if_then partial for any step", async () => {
  const context = await loadApp();
  useAudit(context);
  const result = plain(
    run(
      context,
      `(() => {
        const step = state.audit.steps[0];
        const runtime = ATLASStepTypeRuntime;
        return {
          text: runtime.partial("if_then", "conditionText", step),
          sql: runtime.partial("if_then", "condition", step, "sql"),
          python: runtime.partial("if_then", "condition", step, "python"),
          missing: runtime.partial("if_then", "noSuchPartial", step),
          badName: runtime.partial("if_then", 'x"}}{{y', step),
          unknownType: runtime.partial("no_such_type", "condition", step),
          qtest: qtestConditionText(step),
          stored: runtime.storedConditions(step).map((item) => item.fieldName),
        };
      })()`,
    ),
  );
  assert.equal(
    result.text,
    'IF file "wd" column "Status" is equal to "Active" AND file "wd" column "Amount" is greater than "100"',
  );
  assert.equal(result.sql, "[Status] = 'Active' AND [Amount] > 100");
  assert.match(result.python, /df\["Status"\] == "Active"/);
  assert.equal(result.missing, "");
  assert.equal(result.badName, "");
  assert.equal(result.unknownType, "");
  assert.equal(result.qtest, result.text.replace(/^IF /, ""));
  assert.deepEqual(result.stored, ["Status", "Amount"]);
});
