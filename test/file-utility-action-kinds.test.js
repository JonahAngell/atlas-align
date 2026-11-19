/**
 * Phase 10 (5053): contract version 3. File Utility readiness runs each
 * action through the handler its action kind names in
 * export.fileUtility.action, and the contract's operators are generated from
 * the operator catalog.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  buildContract,
  fileUtilityOperator,
} from "../tools/build-step-type-manifest.mjs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(read(path));

const contract = readJson("catalogs/file-utility/executable-steps.json");
const options = readJson("catalogs/logic_phrase_catalog.json").app_config
  .logic_options;
const manifest = readJson("catalogs/step-types/manifest.json");
const kinds = Object.fromEntries(
  manifest.definitions
    .filter((entry) => entry.id.startsWith("action_"))
    .map((entry) => {
      const definition = readJson(`catalogs/step-types/${entry.file}`);
      return [definition.name, definition];
    }),
);

const context = vm.createContext({});
vm.runInContext(read("js/22a-file-utility-readiness.js"), context);

function check(document, kindMap) {
  return JSON.parse(
    JSON.stringify(
      context.FileUtilityReadiness.check(
        document,
        contract,
        kindMap ? { actionKindFor: (name) => kindMap[name] || null } : {},
      ),
    ),
  );
}
const messages = (result) => result.blockers.map((blocker) => blocker.message);
const ifThen = (params) => ({
  sources: [],
  steps: [
    {
      id: "1",
      step_type: "if_then",
      title: "Step 1",
      sortOrder: 1,
      params: {
        conditions_json: JSON.stringify([
          { fieldName: "F", operator: "is equal to", compareValue: "x" },
        ]),
        ...params,
      },
    },
  ],
});
/** A builder-made kind: a copy of `base` under a new name. */
function kindLike(base, name, fileUtility) {
  const definition = structuredClone(kinds[base]);
  definition.id = `action_${name}`;
  definition.name = name;
  definition.label = "Flag row";
  if (fileUtility === undefined) delete definition.export.fileUtility;
  else definition.export.fileUtility = fileUtility;
  return definition;
}

test("contract version 3", () => {
  assert.equal(contract.contractVersion, 3);
});

test("the contract's operators are generated from the operator catalog", () => {
  assert.equal(
    buildContract(),
    read("catalogs/file-utility/executable-steps.json"),
    "Run `npm run step-types:manifest`.",
  );
  for (const entry of options.operator_catalog.filter((item) => item.value)) {
    const code = fileUtilityOperator(entry);
    if (code) assert.equal(contract.operators[entry.value], code, entry.value);
    else assert.ok(contract.blockedOperators.includes(entry.value));
  }
  // Every operator an editor offers is either runnable or blocked by name.
  Object.values(options.operator_sets)
    .flat()
    .forEach((value) =>
      assert.ok(
        value in contract.operators ||
          contract.blockedOperators.includes(value),
        value,
      ),
    );
});

test("every bundled action kind names a handler in the contract", () => {
  for (const [name, definition] of Object.entries(kinds)) {
    const handler = definition.export?.fileUtility?.action;
    assert.ok(handler, `${name} names a handler`);
    assert.ok(handler in contract.thenActions, `${name}: ${handler}`);
  }
});

test("bundled kinds give the same answers as the kind names", () => {
  const audits = [
    { then_action_type: "do_not_display" },
    { then_action_type: "display" },
    { then_action_type: "display_text", then_text: "Bad" },
    { then_action_type: "set_column_value" },
    { then_action_type: "set_column_value", then_target_column: "T" },
    { then_action_type: "freeform", then_action: "Do Not Display" },
    { then_action_type: "freeform", then_action: "Something else" },
  ].map(ifThen);
  for (const document of audits)
    assert.deepEqual(check(document, kinds), check(document));
});

test("a new action kind runs through the handler it names", () => {
  const flag_row = kindLike("display_text", "flag_row", {
    action: "display_text",
  });
  const result = check(
    ifThen({ then_action_type: "flag_row", then_text: "Bad" }),
    { ...kinds, flag_row },
  );
  assert.deepEqual(result.blockers, []);
  const setValue = kindLike("set_column_value", "flag_row", {
    action: "set_column_value",
  });
  assert.deepEqual(
    messages(
      check(ifThen({ then_action_type: "flag_row" }), { flag_row: setValue }),
    ),
    ["Set Column Value has no target column."],
  );
});

test("a kind with no handler, or one File Utility lacks, is a blocker", () => {
  const document = ifThen({ then_action_type: "flag_row", then_text: "Bad" });
  assert.deepEqual(
    messages(
      check(document, { flag_row: kindLike("display_text", "flag_row") }),
    ),
    ["the action 'Flag row' has no File Utility handler yet."],
  );
  assert.deepEqual(
    messages(
      check(document, {
        flag_row: kindLike("display_text", "flag_row", { action: "pivot" }),
      }),
    ),
    ["the action 'pivot' is not known."],
  );
  // Without the kind's definition the name is the handler, as in contract v2.
  assert.deepEqual(messages(check(document)), [
    "the action 'flag_row' is not known.",
  ]);
});
