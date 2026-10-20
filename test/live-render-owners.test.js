import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const scripts = [
  ...read("../index.html").matchAll(/src="\.\/(js\/[^"]+\.js)"/g),
].map((match) => match[1]);

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

test("stepTypeLabel has one live definition for step objects and legacy type strings", () => {
  assert.deepEqual(filesMatching(/function stepTypeLabel\b/), [
    "js/15c-source-field-picker.js",
  ]);
  const source = readFileSync(
    new URL("../js/15c-source-field-picker.js", import.meta.url),
    "utf8",
  );
  const body = source.slice(
    source.indexOf("function stepTypeLabel"),
    source.indexOf("function renderLiveSourceOptions"),
  );
  const context = vm.createContext({
    STEP_TYPE_OPTIONS: [["if_then", "If/Then"]],
  });
  vm.runInContext(`${body}; globalThis.label = stepTypeLabel;`, context);
  assert.equal(context.label({ step_type: "if_then" }), "If/Then");
  assert.equal(context.label("if"), "If / Then");
  assert.equal(context.label("create"), "Create Field");
});
