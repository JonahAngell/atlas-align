import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
const utils = read("00-config-utils.js");
const helper = utils.slice(
  utils.indexOf("function atlasTrapTabKey"),
  utils.indexOf("const csvEscape"),
);

function setup() {
  const nodes = ["first", "middle", "last"].map((id) => ({
    id,
    closest: () => null,
    getClientRects: () => [1],
    focus() {
      context.document.activeElement = this;
    },
  }));
  const container = {
    querySelectorAll: () => nodes,
    contains: (node) => nodes.includes(node),
  };
  const context = vm.createContext({ document: { activeElement: null } });
  vm.runInContext(`${helper}; globalThis.trap = atlasTrapTabKey;`, context);
  const press = (shiftKey) => {
    const event = {
      key: "Tab",
      shiftKey,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    context.trap(event, container);
    return event;
  };
  return { context, nodes, press };
}

test("Tab from the last control wraps to the first, Shift+Tab the reverse", () => {
  const { context, nodes, press } = setup();
  nodes[2].focus();
  assert.equal(press(false).prevented, true);
  assert.equal(context.document.activeElement.id, "first");
  assert.equal(press(true).prevented, true);
  assert.equal(context.document.activeElement.id, "last");
});

test("Tab between inner controls is left to the browser", () => {
  const { nodes, press } = setup();
  nodes[0].focus();
  assert.equal(press(false).prevented, false);
});

test("focus outside the modal is pulled back in", () => {
  const { context, press } = setup();
  context.document.activeElement = { id: "page" };
  press(false);
  assert.equal(context.document.activeElement.id, "first");
});

test("modals without their own trap use the shared helper", () => {
  for (const file of [
    "24-audit-workflow-ui.js",
    "19-audit-version-history.js",
    "15f-join-picker.js",
    "15i-source-replace.js",
    "16a-user-impersonation.js",
  ])
    assert.match(read(file), /atlasTrapTabKey\(/, file);
});
