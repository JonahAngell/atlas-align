import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function load(audit = {}) {
  const elements = {};
  const context = {
    state: { audit },
    sourceAliasFor: (file) => (file ? `alias.${file}` : ""),
    esc: (value) => String(value ?? ""),
    atlasChoiceControl: ({ attributes, selected }) =>
      `<choice ${attributes} selected="${selected}">`,
    document: {
      getElementById: (id) => elements[id] || null,
      addEventListener: () => {},
    },
    globalThis: {},
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(
      new URL("../js/31-audit-execution.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  return { context, elements };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("only settings that differ from the defaults are stored", () => {
  const { context } = load();
  assert.equal(
    context.atlasNormalizeExecution({
      resultRows: "all_except_excluded",
      textCombine: "append",
      textSeparator: "",
      resultSource: "",
    }),
    null,
  );
  assert.deepEqual(
    plain(
      context.atlasNormalizeExecution({
        resultRows: "only_flagged",
        textCombine: "append",
        textSeparator: " | ",
        resultSource: "alias.PA0001",
      }),
    ),
    {
      resultRows: "only_flagged",
      textSeparator: " | ",
      resultSource: "alias.PA0001",
    },
  );
});

test("execution problems match what File Utility blocks", () => {
  const { context } = load();
  const audit = {
    sources: [{ sourceFile: "PA0001" }],
    execution: {
      textCombine: "merge",
      textSeparator: "12345678901",
      resultSource: "alias.PA9999",
    },
  };
  assert.equal(context.atlasExecutionProblems(audit).length, 3);
  assert.deepEqual(
    plain(
      context.atlasExecutionProblems({
        sources: [{ sourceFile: "PA0001" }],
        execution: { resultSource: "alias.PA0001" },
      }),
    ),
    [],
  );
});

test("capturing the card writes and clears audit.execution", () => {
  const audit = { sources: [{ sourceFile: "PA0001" }] };
  const { context, elements } = load(audit);
  const values = {
    resultRows: "only_flagged",
    textCombine: "last",
    textSeparator: "",
    resultSource: "",
  };
  const inputs = Object.entries(values).map(([key, value]) => ({
    dataset: { executionSetting: key },
    get value() {
      return values[key];
    },
  }));
  elements.atlasExecutionCardBody = {
    querySelectorAll: () => inputs,
    querySelector: (selector) =>
      inputs.find((input) => selector.includes(input.dataset.executionSetting)),
  };
  assert.equal(context.atlasCaptureExecution(), true);
  assert.deepEqual(plain(audit.execution), {
    resultRows: "only_flagged",
    textCombine: "last",
  });
  values.resultRows = "all_except_excluded";
  values.textCombine = "append";
  assert.equal(context.atlasCaptureExecution(), true);
  assert.equal("execution" in audit, false);
  assert.equal(context.atlasCaptureExecution(), false);
});

test("an unloaded result source stays visible in the picker", () => {
  const { context } = load();
  const html = context.atlasExecutionCardHtml({
    sources: [{ sourceFile: "PA0001" }],
    execution: { resultSource: "alias.GONE" },
  });
  assert.match(html, /alias\.GONE \(not loaded\)/);
  assert.match(html, /role="alert"/);
});
