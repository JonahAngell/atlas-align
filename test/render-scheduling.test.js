import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const source = fs.readFileSync(
  new URL("../js/02-logic-rendering.js", import.meta.url),
  "utf8",
);
const context = {};
vm.runInNewContext(
  `${functionSource(source, "atlasMergeRenderFlags")}; this.merge = atlasMergeRenderFlags;`,
  context,
);

test("render flags merge without canceling pending work", () => {
  const merged = context.merge(
    { preview: true, selectedStep: true },
    { preview: false, validation: true },
  );
  assert.equal(merged.preview, true);
  assert.equal(merged.selectedStep, true);
  assert.equal(merged.validation, true);
});

test("steps subsume a separately requested selected-step render", () => {
  const merged = context.merge(
    { selectedStep: true, logicTable: true },
    { steps: true },
  );
  assert.equal(merged.steps, true);
  assert.equal(merged.selectedStep, false);
  assert.equal(merged.logicTable, true);
});

test("immediate requests remain sticky within a batch", () => {
  const merged = context.merge(
    { immediate: true },
    { immediate: false, preview: true },
  );
  assert.equal(merged.immediate, true);
  assert.equal(merged.preview, true);
});

test("live editor typing batches preview and debounces audit issues", () => {
  const rulesList = fs.readFileSync(
    new URL("../js/15d-logic-rules-list.js", import.meta.url),
    "utf8",
  );
  const commit = functionSource(rulesList, "atlasCommitLiveEditor");
  const contentOnly = commit.slice(
    commit.indexOf("atlasRefreshLogicRuleCard(step);"),
  );
  assert.doesNotMatch(contentOnly, /renderPreview\?\.\(\)/);
  assert.doesNotMatch(contentOnly, /renderValidationPanel\?\.\(\)/);
  assert.match(
    contentOnly,
    /atlasRequestRender\?\.\(\{ preview: true, logicTable: true \}\)/,
  );
  assert.match(contentOnly, /atlasRequestRender\?\.\(\{ validation: true \}\)/);
});

test("precomputed inverse links build the same sync key as a per-step scan", () => {
  const visual = fs.readFileSync(
    new URL("../js/15g-visual-ui-events.js", import.meta.url),
    "utf8",
  );
  const inverse = {};
  vm.runInNewContext(
    `${functionSource(visual, "atlasInverseLinkedIds")}; ${functionSource(visual, "atlasInverseSyncKey")}; this.linked = atlasInverseLinkedIds; this.key = atlasInverseSyncKey;`,
    inverse,
  );
  const steps = [
    { id: "a", step_type: "if_then", params: { x: 1 } },
    { id: "b", params: { inverse_of_step_id: "a" }, inverseOfStepId: "a" },
    { id: "c", params: {}, inverseOfStepId: "a" },
    { id: "d", step_type: "if_then", params: {} },
    { id: "e", params: { inverse_of_step_id: "d" }, inverseOfStepId: "a" },
  ];
  const linked = inverse.linked(steps);
  steps.forEach((step) =>
    assert.equal(inverse.key(step, steps, linked), inverse.key(step, steps)),
  );
  assert.match(inverse.key(steps[0], steps, linked), /^b\nc\ne\n/);
});
