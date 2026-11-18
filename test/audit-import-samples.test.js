/**
 * docs/audit-imports/legacy-filter-flag-check.json is an audit to import by
 * hand to check the legacy Filter Rows and Flag Records steps, which new
 * rules can't add. These tests check the file still reads as one audit and
 * that its steps render the same as the matching steps in the recorded
 * synthetic-transforms snapshot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp, recordAudit } from "./support/step-type-harness.js";
import { SNAPSHOT_DIR } from "./support/step-type-corpus.js";

const FILE = new URL(
  "../docs/audit-imports/legacy-filter-flag-check.json",
  import.meta.url,
);
const json = JSON.parse(readFileSync(FILE, "utf8"));
const snapshot = JSON.parse(
  readFileSync(new URL("synthetic-transforms.json", SNAPSHOT_DIR), "utf8"),
);
const LEGACY_STEPS = [
  "filter-keep",
  "filter-exclude",
  "flag-text",
  "flag-hide",
];

test("the legacy filter and flag import file is one importable audit", async () => {
  const context = await loadApp();
  context.__importJson = json;
  const documents = vm.runInContext(
    "atlasAuditDocumentsFromJson(__importJson)",
    context,
  );
  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, "legacy-filter-flag-check");
});

test("its steps render like the recorded Filter Rows and Flag Records steps", async () => {
  const context = await loadApp();
  const recorded = JSON.parse(JSON.stringify(await recordAudit(context, json)));
  const steps = vm.runInContext("state.audit.steps", context);
  for (const id of LEGACY_STEPS) {
    const index = recorded.steps.findIndex((step) => step.id === id);
    assert.ok(index >= 0, `${id} is in the file`);
    context.__step = steps.find((step) => step.id === id);
    const type = vm.runInContext(
      "ATLASStepTypeRuntime.definitionFor(__step)?.id",
      context,
    );
    assert.equal(
      type,
      id.startsWith("filter") ? "filter_rows" : "flag_records",
    );
    const actual = recorded.steps[index];
    const expected = snapshot.steps.find((step) => step.id === id);
    for (const key of ["english", "developer", "formulas"])
      assert.deepEqual(actual[key], expected[key], `${id} ${key}`);
    assert.ok(actual.editorHtml && !actual.editorHtml.error, `${id} editor`);
  }
});

test("a Flag Records step that hides the record has no Message or Output Column field", async () => {
  const context = await loadApp();
  const recorded = JSON.parse(JSON.stringify(await recordAudit(context, json)));
  const html = (id) => recorded.steps.find((step) => step.id === id).editorHtml;
  assert.match(html("flag-text"), /data-param="message"/);
  assert.match(html("flag-text"), /data-param(-name)?="output_column"/);
  assert.match(html("flag-hide"), /data-param="flag_action"/);
  assert.doesNotMatch(html("flag-hide"), /data-param="message"/);
  assert.doesNotMatch(html("flag-hide"), /data-param(-name)?="output_column"/);
});
