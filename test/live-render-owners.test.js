import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scripts = [...read("../index.html").matchAll(/src="\.\/(js\/[^"]+\.js)"/g)].map(
  (match) => match[1],
);

function filesMatching(pattern) {
  return scripts.filter((script) => pattern.test(read(`../${script}`)));
}

test("the last renderSteps assignment is the virtualized logic list", () => {
  const hits = filesMatching(/renderSteps\s*=/);
  assert.equal(hits.at(-1), "js/15g-visual-ui-events.js");
  assert.match(
    read("../js/15g-visual-ui-events.js"),
    /renderSteps = function renderStepsVirtualized/,
  );
  assert.equal(
    (read("../js/15g-visual-ui-events.js").match(/renderSteps\s*=/g) || [])
      .length,
    1,
  );
  assert.deepEqual(
    hits.filter((file) =>
      [
        "js/15a-audit-library-ui.js",
        "js/15c-source-field-picker.js",
        "js/15d-logic-rules-list.js",
      ].includes(file),
    ),
    [],
  );
});

test("renderLogicRuleCard is owned by the logic step editor", () => {
  assert.deepEqual(filesMatching(/function renderLogicRuleCard\b/), [
    "js/15e-logic-step-editor.js",
  ]);
});

test("sourceAliasFor and alpha helpers have one live definition", () => {
  assert.deepEqual(filesMatching(/function sourceAliasFor\b/), [
    "js/09-workbook-import.js",
  ]);
  assert.deepEqual(filesMatching(/function firstLetter\b/), [
    "js/00-config-utils.js",
  ]);
  assert.deepEqual(filesMatching(/function alphaSortItems\b/), [
    "js/00-config-utils.js",
  ]);
});

test("stepTypeLabel keeps both the legacy string helper and the step-object helper", () => {
  const hits = filesMatching(/function stepTypeLabel\b/);
  assert.ok(hits.includes("js/00-config-utils.js"));
  assert.ok(hits.includes("js/15c-source-field-picker.js"));
});
