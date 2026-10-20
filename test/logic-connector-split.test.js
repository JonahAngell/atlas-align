import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const BREAK = '<br class="logic-connector-break">';

function loadStepCardLogic(splitLogicConnectors) {
  const source = readFileSync(
    new URL("../js/02-logic-rendering.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const ATLAS_LOGIC_LINE_BREAK_CONNECTORS");
  const end = source.indexOf("\n}\n", source.indexOf("function renderStepCardLogic"));
  const context = {
    state: { splitLogicConnectors },
    // Stand-in pill renderer: escapes text and wraps quoted names in a span.
    renderLogicWithPills: (text) =>
      String(text || "")
        .split(/("[^"]+")/g)
        .map((part) =>
          part.startsWith('"') && part.endsWith('"')
            ? `<span class="pill">${part.slice(1, -1)}</span>`
            : part.replace(/</g, "&lt;"),
        )
        .join(""),
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end + 2)}\nthis.renderStepCardLogic = renderStepCardLogic;`, context);
  return context;
}

const logic = 'IF "Region" = "East" AND "Sales" > 10 OR "Returns" < 2';

test("split view off renders exactly like the pill renderer", () => {
  const ctx = loadStepCardLogic(false);
  assert.equal(ctx.renderStepCardLogic(logic), ctx.renderLogicWithPills(logic));
  assert.ok(!ctx.renderStepCardLogic(logic).includes(BREAK));
});

test("split view on starts AND and OR on new lines", () => {
  const ctx = loadStepCardLogic(true);
  const html = ctx.renderStepCardLogic(logic);
  assert.ok(html.includes(`<span class="pill">East</span>${BREAK}AND <span class="pill">Sales</span>`));
  assert.ok(html.includes(`> 10${BREAK}OR <span class="pill">Returns</span>`));
  assert.equal(html.split(BREAK).length, 3);
});

test("split view leaves quoted names and lowercase words alone", () => {
  const ctx = loadStepCardLogic(true);
  const html = ctx.renderStepCardLogic('IF "Sales AND Returns" = "black or white" and more');
  assert.ok(!html.includes(BREAK));
  assert.ok(html.includes('<span class="pill">Sales AND Returns</span>'));
});

test("split view does not change the logic text", () => {
  const ctx = loadStepCardLogic(true);
  const text = String(logic);
  ctx.renderStepCardLogic(text);
  assert.equal(text, logic);
  const plain = ctx.renderStepCardLogic(logic).split(BREAK).join(" ");
  assert.equal(plain, ctx.renderLogicWithPills(logic));
});
