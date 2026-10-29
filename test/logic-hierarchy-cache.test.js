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

// Arrays from the vm context have a different prototype, so copy them here.
const numbers = (hierarchy, options = { includeDisabled: true }) =>
  Array.from(
    hierarchy.hierarchicalStepEntries(options),
    (entry) => `${entry.number}:${entry.step.id}`,
  );

test("Cached hierarchy entries follow in-place step mutations", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1 },
    { id: "b", parentId: null, sortOrder: 2 },
    { id: "b1", parentId: "b", sortOrder: 1, branchType: "then" },
  ];
  const hierarchy = loadHierarchy(steps);
  assert.deepEqual(numbers(hierarchy), ["1:a", "2:b", "2.1:b1"]);

  steps[0].sortOrder = 3;
  assert.deepEqual(numbers(hierarchy), ["1:b", "1.1:b1", "2:a"]);

  hierarchy.setStepParent(steps[0], "b");
  assert.deepEqual(numbers(hierarchy), ["1:b", "1.1:b1", "1.2:a"]);

  steps.splice(1, 1);
  assert.equal(hierarchy.stepById("b"), null);
  assert.equal(hierarchy.stepById("b1").id, "b1");
  steps.push({ id: "c", parentId: null, sortOrder: 9 });
  assert.equal(hierarchy.stepById("c"), steps[steps.length - 1]);
  assert.deepEqual(
    Array.from(hierarchy.childrenOf(null), (step) => step.id),
    ["c"],
  );
});

test("Replacing a step object at the same position is not served from cache", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1 },
    { id: "b", parentId: null, sortOrder: 2 },
  ];
  const hierarchy = loadHierarchy(steps);
  hierarchy.hierarchicalStepEntries();
  const replacement = { ...steps[1] };
  steps[1] = replacement;
  assert.equal(hierarchy.hierarchicalStepEntries()[1].step, replacement);
  assert.equal(hierarchy.stepById("b"), replacement);
});

test("Callers cannot corrupt cached hierarchy entries or sibling lists", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1 },
    { id: "b", parentId: null, sortOrder: 2 },
  ];
  const hierarchy = loadHierarchy(steps);
  hierarchy.hierarchicalStepEntries()[0].number = "99";
  hierarchy.childrenOf(null).pop();
  assert.deepEqual(numbers(hierarchy), ["1:a", "2:b"]);
  assert.equal(hierarchy.childrenOf(null).length, 2);
});

test("Disabled steps are excluded only from the enabled-only view", () => {
  const steps = [
    { id: "a", parentId: null, sortOrder: 1, enabled: false },
    { id: "b", parentId: null, sortOrder: 2 },
  ];
  const hierarchy = loadHierarchy(steps);
  assert.equal(hierarchy.hierarchicalStepEntries().length, 2);
  assert.deepEqual(numbers(hierarchy, { includeDisabled: false }), ["1:b"]);
  steps[0].enabled = true;
  assert.equal(
    hierarchy.hierarchicalStepEntries({ includeDisabled: false }).length,
    2,
  );
});
