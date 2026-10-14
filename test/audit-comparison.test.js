import test from "node:test";
import assert from "node:assert/strict";
import {
  compareAuditDocuments,
  compareSteps,
} from "../src/audit-comparison.js";
test("object key order is not semantic change", () => {
  const a = { id: "a", name: "N", meta: { b: 2, a: 1 } },
    b = { name: "N", meta: { a: 1, b: 2 }, id: "a" };
  assert.equal(compareAuditDocuments(a, b).hasChanges, false);
});
test("stable step ids separate reorder content and hierarchy", () => {
  const a = {
      steps: [
        {
          id: "1",
          title: "A",
          parentId: null,
          branchType: "root",
          sortOrder: 1,
        },
        {
          id: "2",
          title: "B",
          parentId: null,
          branchType: "root",
          sortOrder: 2,
        },
      ],
    },
    b = {
      steps: [
        {
          id: "2",
          title: "B2",
          parentId: "1",
          branchType: "then",
          sortOrder: 1,
        },
        {
          id: "1",
          title: "A",
          parentId: null,
          branchType: "root",
          sortOrder: 2,
        },
      ],
    };
  const r = compareAuditDocuments(a, b);
  assert.equal(r.changes.steps.modified[0].id, "2");
  assert.equal(r.changes.steps.hierarchyChanged[0].id, "2");
  assert.equal(r.changes.steps.reordered.length, 2);
});
test("added and removed steps are distinct", () => {
  const r = compareAuditDocuments(
    { steps: [{ id: "a" }] },
    { steps: [{ id: "b" }] },
  );
  assert.deepEqual(
    r.changes.steps.removed.map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(
    r.changes.steps.added.map((x) => x.id),
    ["b"],
  );
});
test("duplicate step ids are rejected", () =>
  assert.throws(
    () =>
      compareAuditDocuments(
        { steps: [{ id: "a" }, { id: "a" }] },
        { steps: [] },
      ),
    /Duplicate step IDs/,
  ));
test("step comparison returns versioned contract", () =>
  assert.equal(
    compareSteps({ id: "a", title: "A" }, { id: "a", title: "B" })
      .contractVersion,
    1,
  ));

import {
  buildCanonicalAuditObjects,
  classifyCanonicalChanges,
} from "../src/audit-comparison.js";

test("canonical identity is audit scoped and overview values do not define identity", () => {
  const first = buildCanonicalAuditObjects({
    id: "a",
    name: "First",
    description: "One",
  });
  const second = buildCanonicalAuditObjects({
    id: "a",
    name: "Second",
    description: "Two",
  });
  const other = buildCanonicalAuditObjects({
    id: "b",
    name: "Second",
    description: "Two",
  });
  assert.equal(first[0].canonicalObjectKey, second[0].canonicalObjectKey);
  assert.notEqual(first[0].semanticFingerprint, second[0].semanticFingerprint);
  assert.notEqual(second[0].canonicalObjectKey, other[0].canonicalObjectKey);
});

test("Display Field movement changes order only", () => {
  const before = {
    id: "a",
    displayFields: [
      { canonicalKey: "s::one", label: "One" },
      { canonicalKey: "s::two", label: "Two" },
    ],
  };
  const after = {
    id: "a",
    displayFields: [before.displayFields[1], before.displayFields[0]],
  };
  const changes = classifyCanonicalChanges(before, after, { auditId: "a" });
  assert.ok(
    changes
      .filter((x) => x.itemType === "display-inclusion")
      .every((x) => x.changeReasonCodes.length === 0),
  );
  assert.deepEqual(
    changes.find((x) => x.itemType === "display-order").changeReasonCodes,
    ["order_changed"],
  );
});

test("deleted supported objects become direct candidates", () => {
  const changes = classifyCanonicalChanges(
    { id: "a", sources: [{ sourceKey: "s", alias: "Source" }] },
    { id: "a", sources: [] },
    { auditId: "a" },
  );
  const deleted = changes.find((x) => x.isDeleted);
  assert.equal(deleted.itemType, "source");
  assert.equal(deleted.isDirect, true);
  assert.deepEqual(deleted.changeReasonCodes, ["object_removed"]);
  assert.equal(deleted.displayLabel, "Source");
});

test("parent changes invalidate descendants but not siblings", () => {
  const before = {
    id: "a",
    steps: [
      { id: "p", title: "Parent" },
      { id: "c", parentId: "p", title: "Child" },
      { id: "s", title: "Sibling" },
    ],
  };
  const after = structuredClone(before);
  after.steps[0].title = "Changed";
  const changes = classifyCanonicalChanges(before, after, { auditId: "a" });
  assert.ok(
    changes
      .find((x) => x.stableItemKey === "logic-step:c")
      .changeReasonCodes.includes("ancestor_changed"),
  );
  assert.deepEqual(
    changes.find((x) => x.stableItemKey === "logic-step:s").changeReasonCodes,
    [],
  );
});

test("invalid hierarchy fails closed", () => {
  assert.throws(
    () =>
      buildCanonicalAuditObjects({
        id: "a",
        steps: [{ id: "x", parentId: "missing" }],
      }),
    /missing parent/,
  );
  assert.throws(
    () =>
      buildCanonicalAuditObjects({
        id: "a",
        steps: [
          { id: "x", parentId: "y" },
          { id: "y", parentId: "x" },
        ],
      }),
    /cycle/,
  );
});

test("generated Reference resolves a selected source by alias", () => {
  const objects = buildCanonicalAuditObjects({
    id: "audit-1",
    sources: [
      {
        sourceKey: "canonical-source",
        sourceFile: "Physical Source.csv",
        alias: "Worker Source",
      },
    ],
    steps: [
      {
        id: "reference-1",
        type: "reference",
        autoGeneratedReference: true,
        source: "Worker Source",
        title: "Worker Source reference",
      },
    ],
  });
  const reference = objects.find((item) => item.itemType === "logic-reference");
  assert.equal(reference.isDirect, false);
  assert.equal(
    reference.linkedObjectKey,
    "audit:audit-1|source:canonical-source",
  );
});

test("generated Reference resolves a selected source by physical filename", () => {
  const objects = buildCanonicalAuditObjects({
    id: "audit-1",
    sources: [
      {
        sourceKey: "canonical-source",
        sourceFile: "Physical Source.csv",
        alias: "Worker Source",
      },
    ],
    steps: [
      {
        id: "reference-1",
        type: "reference",
        autoGeneratedReference: true,
        sourceFile: "Physical Source.csv",
      },
    ],
  });
  const reference = objects.find((item) => item.itemType === "logic-reference");
  assert.equal(reference.isDirect, false);
  assert.equal(
    reference.linkedObjectKey,
    "audit:audit-1|source:canonical-source",
  );
});

test("ambiguous alternate source identity fails closed", () => {
  assert.throws(
    () =>
      buildCanonicalAuditObjects({
        id: "audit-1",
        sources: [
          { sourceKey: "source-one", alias: "Shared alias" },
          { sourceKey: "source-two", alias: "Shared alias" },
        ],
      }),
    /Ambiguous canonical source identity/,
  );
});

test("generated Reference with no selected-source match still fails closed", () => {
  assert.throws(
    () =>
      buildCanonicalAuditObjects({
        id: "audit-1",
        sources: [{ sourceKey: "selected-source" }],
        steps: [
          {
            id: "reference-1",
            type: "reference",
            autoGeneratedReference: true,
            source: "missing-source",
          },
        ],
      }),
    /cannot be linked to a canonical source/,
  );
});
