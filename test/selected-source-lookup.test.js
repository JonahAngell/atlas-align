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

const editor = fs.readFileSync(
  new URL("../js/15e-logic-step-editor.js", import.meta.url),
  "utf8",
);

function loadLookup() {
  const catalog = [];
  const context = {
    state: {
      audit: {
        sources: [
          { name: "Source One", sourceKey: "one", alias: "S1", fields: [] },
        ],
        fields: [],
      },
    },
    builds: 0,
    atlasSourceDerivedVersion: 0,
    atlasDisplayDocument: () => null,
    sourceCatalogEntries: () => catalog,
  };
  context.atlasSelectedSourceLookupState = {
    uncached: () => {
      context.builds += 1;
      return context.state.audit.sources.map((source) => ({ ...source }));
    },
    snapshot: null,
    lookup: null,
  };
  vm.createContext(context);
  vm.runInContext(
    [
      "atlasSelectedSourceSnapshot",
      "atlasSelectedSourceSnapshotMatches",
      "atlasSelectedSourceLookup",
      "atlasSourceLookupKey",
    ]
      .map((name) => functionSource(editor, name))
      .join("\n"),
    context,
  );
  return context;
}

test("selected sources are resolved once while their inputs are unchanged", () => {
  const context = loadLookup();
  const first = context.atlasSelectedSourceLookup();
  assert.equal(context.atlasSelectedSourceLookup(), first);
  assert.equal(context.builds, 1);
});

test("source, field, catalog, and version changes rebuild the lookup", () => {
  const context = loadLookup();
  const { audit } = context.state;
  const changes = [
    () => (audit.sources[0].alias = "Renamed"),
    () => (audit.sources[0].color = "#123456"),
    () => audit.sources[0].fields.push({ fieldName: "Added" }),
    () => (audit.sources[0].fields = [{ fieldName: "Replaced" }]),
    () => audit.sources.push({ name: "Source Two", fields: [] }),
    () => (audit.sources = [...audit.sources]),
    () => audit.fields.push({ fieldName: "Calc", calculated: true }),
    () => (context.atlasSourceDerivedVersion += 1),
  ];
  changes.forEach((change, index) => {
    context.atlasSelectedSourceLookup();
    const before = context.builds;
    change();
    context.atlasSelectedSourceLookup();
    assert.equal(context.builds, before + 1, `change ${index} rebuilds`);
  });
  const settled = context.builds;
  audit.fields.push({ fieldName: "Plain display field" });
  context.atlasSelectedSourceLookup();
  assert.equal(context.builds, settled + 1, "field list length is tracked");
});

test("source lookup keys cover every identity property that is read", () => {
  const context = loadLookup();
  const key = context.atlasSourceLookupKey;
  assert.notEqual(key("Source One"), key({ name: "Source One" }));
  [
    "sourceReferenceId",
    "sourceKey",
    "baseSourceKey",
    "id",
    "name",
    "sourceFile",
    "alias",
  ].forEach((property) =>
    assert.notEqual(key({}), key({ [property]: "x" }), property),
  );
  assert.equal(key(null), key({}));
});
