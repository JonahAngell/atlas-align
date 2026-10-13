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
