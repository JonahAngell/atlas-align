/**
 * Condition and action matrix: the baseline for Phase 8 of the Dynamic Step
 * Type Builder plan, which moves condition and action text and formulas from
 * app code into step type templates.
 *
 * Every case in test/fixtures/condition-action-matrix/cases.js must render
 * exactly as recorded: English, automatic notes, Developer Logic, formulas
 * (with an ELSE's lead and notes), the qTest action, and the SQL and Python
 * scripts. When a change is intended, run `npm run matrix:record` and review
 * the diff of test/fixtures/condition-action-matrix/recorded/.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  MATRIX_DIR,
  matrixGroups,
  recordCase,
} from "./support/condition-action-matrix.js";

const RECORD_HINT =
  "If this change is intended, run `npm run matrix:record` and review the diff.";

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const catalog = readJson(new URL("../catalogs/logic_phrase_catalog.json", import.meta.url));
const controls = readJson(new URL("../catalogs/step-types/controls.json", import.meta.url));

/** Path to the first difference between two values, or "" when equal. */
function firstDifference(expected, actual, path = "") {
  if (Object.is(expected, actual)) return "";
  if (
    typeof expected !== "object" ||
    typeof actual !== "object" ||
    expected === null ||
    actual === null ||
    Array.isArray(expected) !== Array.isArray(actual)
  )
    return path || "(root)";
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const found = firstDifference(expected[key], actual[key], path ? `${path}.${key}` : key);
    if (found) return found;
  }
  return "";
}

const groups = matrixGroups();

for (const { group, cases } of groups) {
  test(`condition and action matrix: ${group}`, async () => {
    const file = new URL(`${group}.json`, MATRIX_DIR);
    assert.ok(existsSync(file), `No recording for ${group}. Run \`npm run matrix:record\`.`);
    const expected = readJson(file);
    assert.deepEqual(
      Object.keys(expected),
      cases.map((document) => document.id),
      `The ${group} cases changed. ${RECORD_HINT}`,
    );
    const changed = [];
    for (const document of cases) {
      const actual = JSON.parse(JSON.stringify(await recordCase(document)));
      const path = firstDifference(expected[document.id], actual);
      if (path) changed.push({ id: document.id, path, expected: expected[document.id], actual });
    }
    if (changed.length) {
      const [first] = changed;
      assert.deepEqual(
        first.actual,
        first.expected,
        `${changed.length} ${group} case(s) changed: ${changed
          .slice(0, 10)
          .map(({ id, path }) => `${id} at ${path}`)
          .join("; ")}. ${RECORD_HINT}`,
      );
    }
  });
}

test("the matrix records no stale groups and no generation errors", () => {
  const names = groups.map(({ group }) => `${group}.json`).sort();
  assert.deepEqual(
    readdirSync(MATRIX_DIR).filter((file) => file.endsWith(".json")).sort(),
    names,
  );
  const failures = [];
  for (const { group } of groups) {
    const recorded = readJson(new URL(`${group}.json`, MATRIX_DIR));
    for (const [id, record] of Object.entries(recorded)) {
      if (!record.steps.length) failures.push(`${id}: no logic steps`);
      for (const key of ["sqlScript", "pythonScript"])
        if (record[key]?.error) failures.push(`${id} ${key}: ${record[key].error}`);
      for (const step of record.steps)
        for (const [key, value] of Object.entries(step))
          if (value && typeof value === "object" && "error" in value)
            failures.push(`${id} ${step.id} ${key}: ${value.error}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("case ids are unique", () => {
  const ids = groups.flatMap(({ cases }) => cases.map((document) => document.id));
  assert.equal(new Set(ids).size, ids.length);
});

/** Every leaf condition of every if_then case, with its value mode. */
function allLeaves() {
  const leaves = [];
  const walk = (nodes) =>
    (nodes || []).forEach((node) =>
      node.conditionType === "group" ? walk(node.items) : leaves.push(node),
    );
  for (const { cases } of groups)
    for (const document of cases)
      for (const step of document.steps)
        if (step.params?.conditions_json)
          try {
            walk(JSON.parse(step.params.conditions_json));
          } catch {
            // The bad JSON case on purpose.
          }
  return leaves;
}

test("the matrix covers every catalog operator in every value mode", () => {
  const sets = catalog.app_config.logic_options.operator_sets;
  const leaves = allLeaves();
  const covered = (mode, operator) =>
    leaves.some((leaf) => (leaf.valueMode || "values") === mode && leaf.operator === operator);
  const missing = [];
  for (const [mode, operators] of Object.entries(sets))
    for (const operator of operators) if (!covered(mode, operator)) missing.push(`${mode}: ${operator}`);
  for (const operator of catalog.app_config.logic_options.operators)
    if (!leaves.some((leaf) => leaf.operator === operator)) missing.push(`any: ${operator}`);
  for (const mode of ["values", "field", "parameter", "blank", "expression"])
    if (!covered(mode, "is between")) missing.push(`${mode}: an unknown operator`);
  assert.deepEqual(missing, []);
});

test("the matrix covers every condition part and every action kind", () => {
  const leaves = allLeaves();
  assert.ok(leaves.some((leaf) => leaf.compareMathJson), "compare math");
  assert.ok(leaves.some((leaf) => leaf.compareSourceFile === "sap"), "a second source");
  assert.ok(leaves.some((leaf) => String(leaf.compareValue).includes("\n")), "a value list");
  assert.ok(leaves.some((leaf) => leaf.compareParameter), "a run parameter");

  const depth = (nodes) =>
    Math.max(0, ...(nodes || []).map((node) => (node.conditionType === "group" ? 1 + depth(node.items) : 0)));
  const ifThen = groups.flatMap(({ cases }) => cases.flatMap((document) => document.steps));
  const deepest = Math.max(
    ...ifThen.map((step) => {
      try {
        return depth(JSON.parse(step.params?.conditions_json || "[]"));
      } catch {
        return 0;
      }
    }),
  );
  assert.ok(deepest >= 3, "groups nested three deep");

  const actionFeatures = controls.controls.find((control) => control.name === "action").features.map((feature) => feature.name);
  for (const stepType of ["if_then", "else"])
    for (const kind of actionFeatures)
      assert.ok(
        ifThen.some((step) => step.step_type === stepType && step.params?.then_action_type === kind),
        `${stepType} with ${kind}`,
      );
  assert.ok(ifThen.some((step) => step.params?.then_exclude_scope === "key"), "key-scoped do not display");
  assert.ok(ifThen.some((step) => step.params?.inverse_else === "Yes"), "inverse_else");
  assert.ok(ifThen.some((step) => step.params?.managed_else_branch === "Yes"), "a managed ELSE");
  for (const action of ["Keep matching rows", "Exclude matching rows"])
    assert.ok(ifThen.some((step) => step.params?.filter_action === action), `Filter Rows ${action}`);
  for (const action of ["display_text", "do_not_display"])
    assert.ok(ifThen.some((step) => step.params?.flag_action === action), `Flag Records ${action}`);
  assert.ok(ifThen.some((step) => step.source && step.field), "legacy step.source / step.field");
});
