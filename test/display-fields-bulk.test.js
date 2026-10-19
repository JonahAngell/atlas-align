import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const displaySource = read("../js/21-display-fields.js");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body is incomplete`);
}

function loadDisplayHelpers(context = {}) {
  const sandbox = vm.createContext({ Intl, ...context });
  vm.runInContext(
    [
      "let atlasDisplayRowCache = new Map();",
      'const atlasDisplayCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });',
      functionSource(displaySource, "atlasDisplaySortLabel"),
      functionSource(displaySource, "atlasSortedDisplayRows"),
      functionSource(displaySource, "atlasDisplayAllFields"),
      functionSource(displaySource, "atlasSortDisplayFields"),
      "this.api = { atlasSortedDisplayRows, atlasDisplayAllFields, atlasSortDisplayFields, setRows: (rows) => { atlasDisplayRowCache = new Map(rows.map((row) => [row.key, row])); } };",
    ].join("\n"),
    sandbox,
  );
  return sandbox.api;
}

const rows = () => [
  { key: "a", fieldTitle: "Zeta", sourceAlias: "Budget", displayed: true },
  { key: "b", fieldTitle: "alpha", sourceAlias: "Schedule", displayed: false },
  {
    key: "c",
    fieldTitle: "Total",
    sourceAlias: "Budget",
    calculated: true,
    displayed: false,
  },
  { key: "d", fieldTitle: "Beta", sourceAlias: "Budget", displayed: true },
  { key: "e", fieldTitle: "Item 10", sourceAlias: "", displayed: true },
  { key: "f", fieldTitle: "Item 9", sourceAlias: "", displayed: true },
];

function commitStubs(calls) {
  return {
    atlasIsReviewerMode: () => false,
    atlasCapturePageScroll: () => ({ y: 10 }),
    atlasRestorePageScroll: (point) => calls.push(["scroll", point.y]),
    atlasCommitDisplayFieldChange: (options) => calls.push(["commit", options]),
    atlasSetDisplayFieldsStatus: (message, kind, undo) => {
      calls.undo = undo;
      calls.push(["status", message, kind, typeof undo]);
    },
  };
}

test("A–Z sort orders by title case-insensitively with numeric collation", () => {
  const { atlasSortedDisplayRows } = loadDisplayHelpers();
  assert.deepEqual(
    Array.from(atlasSortedDisplayRows(rows(), "alpha"), (row) => row.key),
    ["b", "d", "f", "e", "c", "a"],
  );
});

test("source sort groups by source, puts calculated fields last and blank sources at the end", () => {
  const { atlasSortedDisplayRows } = loadDisplayHelpers();
  assert.deepEqual(
    Array.from(atlasSortedDisplayRows(rows(), "source"), (row) => row.key),
    ["d", "a", "c", "b", "f", "e"],
  );
});

test("source sort puts placeholder Calculated Field rows after real sources", () => {
  const { atlasSortedDisplayRows } = loadDisplayHelpers();
  const input = [
    {
      key: "calc",
      fieldTitle: "Margin",
      sourceAlias: "Calculated Field",
      uniqueId: "Calculated Field",
      calculated: true,
    },
    { key: "sap", fieldTitle: "Amount", sourceAlias: "SAP Currency" },
    { key: "bud", fieldTitle: "Cost", sourceAlias: "Budget" },
  ];
  assert.deepEqual(
    Array.from(atlasSortedDisplayRows(input, "source"), (row) => row.key),
    ["bud", "sap", "calc"],
  );
});

test("sorting does not mutate the input rows", () => {
  const { atlasSortedDisplayRows } = loadDisplayHelpers();
  const input = rows();
  atlasSortedDisplayRows(input, "alpha");
  assert.deepEqual(
    input.map((row) => row.key),
    ["a", "b", "c", "d", "e", "f"],
  );
});

test("display all saves every hidden row once, commits once, and undo re-hides them", () => {
  const calls = [];
  const saved = [];
  const api = loadDisplayHelpers({
    ...commitStubs(calls),
    atlasSaveDisplayField: (row, displayed) => saved.push([row.key, displayed]),
  });
  api.setRows(rows());
  assert.equal(api.atlasDisplayAllFields(), 2);
  assert.deepEqual(saved, [
    ["b", true],
    ["c", true],
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(calls.filter(([kind]) => kind === "commit"))),
    [["commit", { rerender: true }]],
  );
  assert.deepEqual(calls.at(-1), [
    "status",
    "2 fields set to Displayed.",
    "ok",
    "function",
  ]);
  saved.length = 0;
  assert.equal(calls.undo(), "2 fields hidden again.");
  assert.deepEqual(saved, [
    ["b", false],
    ["c", false],
  ]);
});

test("display all is a no-op when every field is displayed or in reviewer mode", () => {
  const calls = [];
  const api = loadDisplayHelpers({
    ...commitStubs(calls),
    atlasSaveDisplayField: () => assert.fail("should not save"),
  });
  api.setRows(rows().map((row) => ({ ...row, displayed: true })));
  assert.equal(api.atlasDisplayAllFields(), 0);
  assert.equal(calls.length, 0);

  const locked = loadDisplayHelpers({
    ...commitStubs(calls),
    atlasIsReviewerMode: () => true,
    atlasSaveDisplayField: () => assert.fail("should not save"),
  });
  locked.setRows(rows());
  assert.equal(locked.atlasDisplayAllFields(), 0);
});

test("sort persists the sorted order and undo restores the previous order", () => {
  const calls = [];
  const persisted = [];
  const api = loadDisplayHelpers({
    ...commitStubs(calls),
    atlasPersistDisplayFieldOrder: (ordered) =>
      persisted.push(Array.from(ordered, (row) => row.key)),
  });
  api.setRows(rows());
  assert.equal(api.atlasSortDisplayFields("alpha"), true);
  assert.deepEqual(persisted[0], ["b", "d", "f", "e", "c", "a"]);
  assert.deepEqual(calls.at(-1), [
    "status",
    "Sorted A–Z by field title.",
    "ok",
    "function",
  ]);
  assert.equal(calls.undo(), "Previous order restored.");
  assert.deepEqual(persisted[1], ["a", "b", "c", "d", "e", "f"]);
});

test("sort is skipped with fewer than two fields", () => {
  const api = loadDisplayHelpers({
    ...commitStubs([]),
    atlasPersistDisplayFieldOrder: () => assert.fail("should not persist"),
  });
  api.setRows(rows().slice(0, 1));
  assert.equal(api.atlasSortDisplayFields("source"), false);
});

test("display toggle handler uses the row cache and avoids synchronous preview renders", () => {
  const start = displaySource.indexOf(
    'if (!event.target.matches("[data-display-field-toggle]")) return;',
  );
  assert.notEqual(start, -1);
  const handler = displaySource.slice(start, start + 1500);
  assert.match(handler, /atlasDisplayCachedRow\(/);
  assert.doesNotMatch(handler, /requirementsFieldRows\(/);
  assert.doesNotMatch(handler, /renderRequirementsFieldsPreview\(/);
  assert.match(
    read("../js/06-events-bootstrap.js"),
    /"\[data-display-field-toggle\]"/,
  );
});

test("bulk Display Fields controls are covered by the publish lock", () => {
  const lock = read("../js/24-audit-workflow-ui.js");
  for (const selector of [
    "#displayAllFieldsBtn",
    "[data-display-fields-sort]",
    "[data-display-fields-undo]",
  ])
    assert.ok(lock.includes(`"${selector}"`), `${selector} not locked`);
});

test("visual picker select-all is opt-in and the Display Fields picker opts in", () => {
  const picker = read("../js/15h-visual-picker.js");
  assert.match(
    picker,
    /state\.multiple && state\.config\?\.selectAll === true/,
  );
  assert.match(picker, /filter\(\(entry\) => !entry\.disabled\)/);
  assert.match(
    functionSource(displaySource, "atlasOpenDisplayPicker"),
    /selectAll: true/,
  );
  assert.doesNotMatch(read("../js/15i-source-replace.js"), /selectAll/);
  assert.match(
    read("../sections/visual-picker.html"),
    /id="atlas-visual-picker-select-all"[\s\S]*?hidden/,
  );
});
