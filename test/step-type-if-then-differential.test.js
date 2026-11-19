/**
 * IF / THEN and ELSE templates against the app code they replace (Phase 8,
 * branch 5032 of the Dynamic Step Type Builder plan).
 *
 * if_then v3 and else v3 write their English, formulas, notes and qTest
 * action with partials. While the app's own functions still exist, every
 * IF / THEN and ELSE step of the condition and action matrix must render the
 * same through:
 *   - the app functions (thenActionPlain, elseActionPlain, conditionGroupPlain,
 *     atlasDevIfThen, atlasDevElse, atlasQtestThenAction);
 *   - the latest definitions (v3);
 *   - the definitions pinned to v2, whose helpers are now replaced helpers
 *     that render the v3 partials.
 * Filter Rows v3 and Flag Records v4 do the same for their formulas, against
 * atlasDevLegacyCondition, with filter_rows v2 and flag_records v3 pinned
 * through the conditionFormula replaced helper.
 * Branch 5035 deletes this test together with the app functions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";
import { matrixGroups } from "./fixtures/condition-action-matrix/cases.js";

const PINNED = [
  "if_then.v2.json",
  "else.v2.json",
  "filter_rows.v2.json",
  "flag_records.v3.json",
].map((file) =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/step-types-pinned/${file}`, import.meta.url),
      "utf8",
    ),
  ),
);
const run = (context, code) => vm.runInContext(code, context);
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

/** The app with the v2 definitions loaded next to the bundled latest ones. */
async function appWithV2() {
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

/**
 * What the step renders as: from the app functions (`source: "app"`), or
 * through the runtime with the latest or the v2 definitions.
 */
const OUTPUTS = `(source) => {
  const step = __step;
  const runtime = ATLASStepTypeRuntime;
  const isIf = step.step_type === "if_then";
  // The formulas as the runtime returns them: trimmed, blank notes dropped,
  // and only the lead when there is nothing else.
  const shaped = (result) => {
    const out = {};
    if (result?.lead) out.lead = result.lead;
    ["excel", "sql", "python"].forEach((dialect) => {
      const code = String(result?.[dialect] || "").trim();
      if (code) out[dialect] = code;
    });
    const notes = (result?.notes || []).map((note) => String(note).trim()).filter(Boolean);
    if (out.lead && !notes.length && !out.excel && !out.sql && !out.python) return out;
    out.notes = notes;
    return out;
  };
  if (source === "app") {
    let english;
    if (isIf) {
      const action = thenActionPlain(step);
      const conditions = ensureIfThenPrefix(conditionGroupPlain(step));
      english = ensureIfThenPrefix(
        String(action || "").trim()
          ? renderCatalogPhrase("analyst_logic.if_then.condition_group_with_action", {
              condition_group: conditions,
              then_action: action,
            })
          : renderCatalogPhrase("analyst_logic.if_then.condition_group_without_action", {
              condition_group: conditions,
            }),
      );
    } else english = elseActionPlain(step);
    return {
      english,
      formulas: shaped(isIf ? atlasDevIfThen(step) : atlasDevElse(step)),
      qtestAction: atlasQtestThenAction(step),
    };
  }
  runtime.usePinnedVersions(
    source === "v2"
      ? { if_then: 2, else: 2, filter_rows: 2, flag_records: 3 }
      : null,
  );
  try {
    const version = runtime.definitionFor(step)?.version;
    return {
      version,
      english: runtime.english(step),
      formulas: runtime.formulas(step),
      qtestAction: runtime.qtestAction(step),
    };
  } finally {
    runtime.usePinnedVersions(null);
  }
}`;

/** Every IF / THEN and ELSE step of the matrix that is not an inverse ELSE. */
function matrixSteps(context, document) {
  context.__document = structuredClone(document);
  run(
    context,
    `state.audit = normalizeLoadedAudit(__document, "repo");
     state.auditSelected = true;`,
  );
  return run(
    context,
    `state.audit.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => ["if_then", "else"].includes(step.step_type))
      .filter(({ step }) => step.params?.inverse_else !== "Yes")
      .map(({ step, index }) => ({ id: step.id, index }))`,
  );
}

for (const { group, cases } of matrixGroups()) {
  test(`IF / THEN and ELSE templates match the app code: ${group}`, async () => {
    const context = await appWithV2();
    const outputs = run(context, OUTPUTS);
    let checked = 0;
    const differences = [];
    for (const document of cases) {
      for (const { id, index } of matrixSteps(context, document)) {
        context.__step = run(context, `state.audit.steps[${index}]`);
        const app = plain(outputs("app"));
        const { version: latest, ...v3 } = plain(outputs("latest"));
        const { version: pinned, ...v2 } = plain(outputs("v2"));
        assert.equal(latest, 3, `${document.id} ${id} renders with v3`);
        assert.equal(pinned, 2, `${document.id} ${id} renders with v2`);
        for (const [name, actual] of [
          ["v3", v3],
          ["v2", v2],
        ])
          for (const part of ["english", "formulas", "qtestAction"])
            if (JSON.stringify(actual[part]) !== JSON.stringify(app[part]))
              differences.push({
                where: `${document.id} ${id} ${name} ${part}`,
                app: app[part],
                actual: actual[part],
              });
        checked += 1;
      }
    }
    if (group !== "filter-flag")
      assert.ok(checked > 0, `the ${group} group has IF / THEN steps`);
    assert.deepEqual(
      differences.slice(0, 3),
      [],
      `${differences.length} difference(s) in ${group}`,
    );
  });
}

test("the latest versions need none of the replaced helpers", async () => {
  const context = await loadApp();
  const replaced = Object.keys(
    run(context, "ATLASStepTypeLibrary.replacedHelpers"),
  );
  assert.deepEqual(replaced.sort(), [
    "actionText",
    "conditionFormula",
    "conditionText",
    "elseFormula",
    "ifThenFormula",
  ]);
  for (const [id, version] of [
    ["if_then", 3],
    ["else", 3],
    ["filter_rows", 3],
    ["flag_records", 4],
  ]) {
    const definition = JSON.parse(
      readFileSync(
        new URL(`../catalogs/step-types/${id}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(definition.version, version);
    const source = JSON.stringify(definition);
    for (const name of replaced)
      assert.ok(
        !new RegExp(`[{(]${name}\\b`).test(source),
        `${id} v3 calls ${name}`,
      );
  }
});

test("a replaced helper falls back to the app code when the latest version has no partial", async () => {
  const context = await loadApp();
  // Only the v2 definitions: the replaced helpers find no partials.
  context.__pinned = structuredClone(PINNED);
  run(
    context,
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      ATLASStepTypeRuntime.loadBundled({
        ...bundled,
        definitions: [
          ...bundled.definitions.filter((item) => !["if_then", "else"].includes(item.id)),
          ...__pinned,
        ],
      });
    })()`,
  );
  context.__document = {
    id: "fallback",
    name: "Fallback",
    sources: [{ name: "wd", alias: "wd" }],
    steps: [
      {
        id: "if_1",
        step_type: "if_then",
        title: "Check status",
        params: {
          conditions_json: JSON.stringify([
            { id: "c1", connector: "IF", sourceFile: "wd", fieldName: "Status", operator: "is equal to", compareValue: "Active" },
          ]),
          then_action_type: "display",
        },
      },
    ],
  };
  run(
    context,
    `state.audit = normalizeLoadedAudit(__document, "repo"); state.auditSelected = true;`,
  );
  const result = plain(
    run(
      context,
      `(() => {
        const step = state.audit.steps[0];
        return {
          version: ATLASStepTypeRuntime.definitionFor(step).version,
          english: ATLASStepTypeRuntime.english(step),
          app: ensureIfThenPrefix(renderCatalogPhrase("analyst_logic.if_then.condition_group_with_action", {
            condition_group: ensureIfThenPrefix(conditionGroupPlain(step)),
            then_action: thenActionPlain(step),
          })),
          excel: ATLASStepTypeRuntime.formulas(step).excel,
          appExcel: atlasDevIfThen(step).excel,
        };
      })()`,
    ),
  );
  assert.equal(result.version, 2);
  assert.equal(result.english, result.app);
  assert.equal(result.excel, result.appExcel);
});

for (const { group, cases } of matrixGroups().filter(
  ({ group }) => group === "filter-flag",
)) {
  test(`Filter Rows and Flag Records templates match the app code: ${group}`, async () => {
    const context = await appWithV2();
    const formulasOf = run(
      context,
      `(source) => {
        const step = __step;
        const runtime = ATLASStepTypeRuntime;
        if (source === "app") {
          const result = atlasDevLegacyCondition(step);
          return {
            excel: result.excel,
            sql: result.sql,
            python: result.python,
            notes: (result.notes || []).filter(Boolean),
          };
        }
        runtime.usePinnedVersions(
          source === "pinned" ? { filter_rows: 2, flag_records: 3 } : null,
        );
        try {
          return {
            version: runtime.definitionFor(step).version,
            ...runtime.formulas(step),
          };
        } finally {
          runtime.usePinnedVersions(null);
        }
      }`,
    );
    const latestVersion = { filter_rows: 3, flag_records: 4 };
    const pinnedVersion = { filter_rows: 2, flag_records: 3 };
    let checked = 0;
    const differences = [];
    for (const document of cases) {
      context.__document = structuredClone(document);
      run(
        context,
        `state.audit = normalizeLoadedAudit(__document, "repo"); state.auditSelected = true;`,
      );
      const steps = run(
        context,
        `state.audit.steps.map((step, index) => ({ type: step.step_type, index }))
          .filter(({ type }) => type === "filter_rows" || type === "flag_records")`,
      );
      for (const { type, index } of steps) {
        context.__step = run(context, `state.audit.steps[${index}]`);
        const app = plain(formulasOf("app"));
        const { version: latest, ...v3 } = plain(formulasOf("latest"));
        const { version: pinned, ...old } = plain(formulasOf("pinned"));
        assert.equal(latest, latestVersion[type], `${document.id} latest`);
        assert.equal(pinned, pinnedVersion[type], `${document.id} pinned`);
        for (const [name, actual] of [
          ["latest", v3],
          ["pinned", old],
        ])
          if (JSON.stringify(actual) !== JSON.stringify(app))
            differences.push({ where: `${document.id} ${name}`, app, actual });
        checked += 1;
      }
    }
    assert.ok(checked > 0, "the group has Filter Rows and Flag Records steps");
    assert.deepEqual(
      differences.slice(0, 3),
      [],
      `${differences.length} difference(s) in ${group}`,
    );
  });
}
