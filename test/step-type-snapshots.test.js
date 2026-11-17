/**
 * Step type snapshots: the guard for the Dynamic Step Type Builder refactor.
 *
 * Every recorded output (English, automatic notes, Developer Logic, editor
 * markup, Requirements Preview, SQL and Python scripts, qTest rows, Audit
 * Issues, and text import) must stay identical while step types move into
 * definitions. When a change is intended, run `npm run snapshots:record` and
 * review the diff of test/fixtures/step-type-snapshots/recorded/.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadApp, recordAudit } from "./support/step-type-harness.js";
import { SNAPSHOT_DIR, snapshotCorpus } from "./support/step-type-corpus.js";

const RECORD_HINT =
  "If this change is intended, run `npm run snapshots:record` and review the diff.";

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
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    const found = firstDifference(
      expected[key],
      actual[key],
      path ? `${path}.${key}` : key,
    );
    if (found) return found;
  }
  return "";
}

/** Names the step a path points at, so a failure says which step changed. */
function describePath(recorded, path) {
  const match = /^steps\.(\d+)\.(\w+)/.exec(path);
  if (!match) return path;
  const step = recorded.steps[Number(match[1])];
  return `step "${step?.id}" (${step?.stepType}) ${match[2]} at ${path}`;
}

for (const { name, document } of snapshotCorpus()) {
  test(`step type snapshot: ${name}`, async () => {
    const file = new URL(`${name}.json`, SNAPSHOT_DIR);
    assert.ok(
      existsSync(file),
      `No snapshot for ${name}. Run \`npm run snapshots:record\`.`,
    );
    const expected = JSON.parse(readFileSync(file, "utf8"));
    const actual = JSON.parse(
      JSON.stringify(await recordAudit(await loadApp(), document)),
    );
    const path = firstDifference(expected, actual);
    if (path)
      assert.deepEqual(
        actual,
        expected,
        `${name}: ${describePath(expected, path)} changed. ${RECORD_HINT}`,
      );
  });
}

test("snapshots never record a generation error", () => {
  const failures = [];
  for (const { name } of snapshotCorpus()) {
    const file = new URL(`${name}.json`, SNAPSHOT_DIR);
    if (!existsSync(file)) continue;
    const recorded = JSON.parse(readFileSync(file, "utf8"));
    recorded.steps.forEach((step) =>
      Object.entries(step).forEach(([key, value]) => {
        if (value && typeof value === "object" && "error" in value)
          failures.push(`${name} ${step.id} ${key}: ${value.error}`);
      }),
    );
    for (const key of [
      "entries",
      "preview",
      "sqlScript",
      "pythonScript",
      "qtest",
      "issues",
    ])
      if (recorded[key]?.error)
        failures.push(`${name} ${key}: ${recorded[key].error}`);
  }
  assert.deepEqual(failures, []);
});
