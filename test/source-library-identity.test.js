import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parse } from "csv-parse/sync";
import { sourceLibraryFromRows } from "../src/source-library.js";

const csvPath = new URL("../docs/ATLAS Field Library.csv", import.meta.url);
const records = parse(readFileSync(csvPath), {
  columns: true,
  bom: true,
  skip_empty_lines: true,
});
const sources = sourceLibraryFromRows(records);

function loadIdentityHelpers(sourceFiles) {
  const source = readFileSync(
    new URL("../js/10-field-picker.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function atlasNormalizeSourceToken(");
  const end = source.indexOf("function selectedSourceDetail(");
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const sandbox = {
    repoLibraryState: { sourceFiles },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source.slice(start, end)}\nthis.helpers = {
    atlasCatalogSourcesForSelection,
    atlasSourceDisambiguatedLabel,
    atlasStableSourceKey,
    atlasDisplayNameCollision,
  };`,
    sandbox,
  );
  return sandbox.helpers;
}

test("Field Library keeps sources that share a display name distinct", () => {
  const titled = new Map();
  for (const source of sources) {
    const list = titled.get(source.sourceFile) || [];
    list.push(source);
    titled.set(source.sourceFile, list);
    assert.equal(source.sourceKey, source.alias);
    assert.ok(source.sourceKey);
    for (const field of source.fields)
      assert.equal(field.sourceKey, source.sourceKey);
  }

  const hi = titled.get("HI0256");
  assert.ok(hi);
  assert.deepEqual(hi.map((source) => source.sourceKey).sort(), [
    "sap.hi0256",
    "wb.hi0256can",
  ]);

  const sap = hi.find((source) => source.sourceKey === "sap.hi0256");
  const canada = hi.find((source) => source.sourceKey === "wb.hi0256can");
  const sapFields = new Set(sap.fields.map((field) => field.fieldName));
  const sapIds = new Set(sap.fields.map((field) => field.id));
  assert.deepEqual(canada.fields.map((field) => field.fieldName).sort(), [
    "action_reason_number",
    "action_reason_text",
    "action_type",
    "action_type_text",
    "persno",
  ]);
  for (const field of canada.fields) {
    assert.equal(sapIds.has(field.id), false);
    assert.equal(sapFields.has(field.fieldName), false);
  }

  for (const [title, list] of titled) {
    if (list.length < 2) continue;
    const keys = new Set(list.map((source) => source.sourceKey));
    assert.equal(keys.size, list.length, title);
    for (const source of list) assert.notEqual(source.sourceKey, title);
  }
});

test("selecting one shared-name source does not include the other source's fields", () => {
  const helpers = loadIdentityHelpers(sources);
  const hi = sources.filter((source) => source.sourceFile === "HI0256");
  const sap = hi.find((source) => source.sourceKey === "sap.hi0256");
  const canada = hi.find((source) => source.sourceKey === "wb.hi0256can");
  assert.equal(helpers.atlasDisplayNameCollision("HI0256"), true);
  assert.equal(
    helpers.atlasSourceDisambiguatedLabel(sap),
    "HI0256 — sap.hi0256",
  );
  assert.equal(
    helpers.atlasSourceDisambiguatedLabel(canada),
    "HI0256 — wb.hi0256can",
  );

  const selected = helpers.atlasCatalogSourcesForSelection(sources, [
    {
      sourceKey: "sap.hi0256",
      sourceFile: "HI0256",
      alias: "sap.hi0256",
      name: "sap.hi0256",
    },
  ]);
  assert.deepEqual(
    selected.map((source) => source.sourceKey),
    ["sap.hi0256"],
  );
  const names = new Set(
    selected.flatMap((source) => source.fields.map((field) => field.fieldName)),
  );
  assert.equal(names.has("persno"), false);
  assert.equal(names.has("PA0002-NACHN"), true);

  const both = helpers.atlasCatalogSourcesForSelection(sources, [
    { sourceKey: "sap.hi0256", sourceFile: "HI0256", alias: "sap.hi0256" },
    { sourceKey: "wb.hi0256can", sourceFile: "HI0256", alias: "wb.hi0256can" },
  ]);
  assert.deepEqual(both.map((source) => source.sourceKey).sort(), [
    "sap.hi0256",
    "wb.hi0256can",
  ]);
  const lookedUp = helpers.atlasCatalogSourcesForSelection(
    sources,
    both,
    "wb.hi0256can",
  );
  assert.deepEqual(
    lookedUp.map((source) => source.sourceKey),
    ["wb.hi0256can"],
  );
  assert.equal(
    helpers.atlasCatalogSourcesForSelection(sources, both, "HI0256").length,
    0,
  );
  const legacyTitle = helpers.atlasCatalogSourcesForSelection(
    sources,
    [
      {
        sourceKey: "sap.hi0256",
        sourceFile: "HI0256",
        alias: "sap.hi0256",
      },
    ],
    "HI0256",
  );
  assert.deepEqual(
    legacyTitle.map((source) => source.sourceKey),
    ["sap.hi0256"],
  );
  assert.equal(
    legacyTitle.some((source) =>
      source.fields.some((field) => field.fieldName === "persno"),
    ),
    false,
  );
});
