import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadHierarchy(steps) {
  const context = {
    state: { audit: { steps } },
    atlasDisplayDocument: () => null,
    console,
  };
  vm.createContext(context);
  vm.runInContext(
    readFileSync(new URL("../js/02-hierarchy.js", import.meta.url), "utf8"),
    context,
  );
  return context;
}

test("Indent nests a step only one level under its previous sibling", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1 },
    { id: "a1", parentId: "a", sortOrder: 1, branchType: "then" },
    { id: "a1x", parentId: "a1", sortOrder: 1, branchType: "then" },
    { id: "b", parentId: null, sortOrder: 2 },
  ];
  const hierarchy = loadHierarchy(steps);
  const b = steps.find((step) => step.id === "b");

  assert.equal(hierarchy.makeChildOfPrevious(b), true);
  assert.equal(b.parentId, "a");

  assert.equal(hierarchy.makeChildOfPrevious(b), true);
  assert.equal(b.parentId, "a1");
});

test("Indent is refused for the first sibling", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1 },
    { id: "a1", parentId: "a", sortOrder: 1, branchType: "then" },
  ];
  const hierarchy = loadHierarchy(steps);
  const a1 = steps.find((step) => step.id === "a1");
  assert.equal(hierarchy.makeChildOfPrevious(a1), false);
  assert.equal(a1.parentId, "a");
});
