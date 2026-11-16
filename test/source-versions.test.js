import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const picker = fs.readFileSync(
  new URL("../js/10-field-picker.js", import.meta.url),
  "utf8",
);
const repoLibrary = fs.readFileSync(
  new URL("../js/11-repo-library.js", import.meta.url),
  "utf8",
);
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

const librarySource = () => ({
  sourceKey: "sap.currency",
  sourceFile: "sap.currency",
  alias: "sap.currency",
  name: "sap.currency",
  fields: [
    { fieldName: "WAERS", vanityLabel: "Currency" },
    { fieldName: "DATUM", vanityLabel: "Export Date" },
  ],
});

function loadPicker() {
  let next = 0;
  const context = {
    state: { audit: { sources: [], fields: [], steps: [] } },
    repoLibraryState: {
      sourceFiles: [
        librarySource(),
        {
          sourceKey: "wd.int2128a",
          sourceFile: "wd.INT2128a",
          alias: "wd.INT2128a",
          fields: [{ fieldName: "EMPLID" }],
        },
      ],
    },
    uid: (prefix) => `${prefix}_${(next += 1)}`,
    status() {},
    esc: (value) => String(value),
    document: { addEventListener() {}, querySelector: () => null },
    window: {},
    atlasDisplayDocument: () => null,
  };
  vm.createContext(context);
  vm.runInContext(picker, context);
  vm.runInContext(
    ["sourceCatalogKey", "sourceCatalogDisplayName"]
      .map((name) => functionSource(repoLibrary, name))
      .join("\n"),
    context,
  );
  return context;
}

function addOriginal(context) {
  assert.equal(context.atlasAddSourceState("sap.currency").changed, true);
  return context.state.audit.sources[0];
}

test("adding a version gives it its own key, alias, colour and fields", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  const result = context.atlasAddSourceVersionState(original.id);
  assert.equal(result.changed, true);

  const [, version] = context.state.audit.sources;
  assert.equal(version.sourceKey, "sap.currency__v2");
  assert.equal(version.alias, "sap.currency_2");
  assert.equal(version.sourceFile, "sap.currency");
  assert.equal(version.versionOf, "sap.currency");
  assert.equal(version.versionLabel, "Version 2");
  assert.notEqual(version.color, original.color);

  const versionFields = context.state.audit.fields.filter(
    (field) => field.sourceKey === "sap.currency__v2",
  );
  assert.deepEqual(
    [...versionFields.map((field) => field.rawFieldName)],
    ["WAERS", "DATUM"],
  );
  assert.ok(
    versionFields.every((field) => field.sourceAlias === "sap.currency_2"),
  );
});

test("each version resolves to itself and the original keeps its key", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  context.atlasAddSourceVersionState(original.id);

  assert.equal(
    context.selectedSourceDetail("sap.currency").sourceKey,
    "sap.currency",
  );
  assert.equal(
    context.selectedSourceDetail("sap.currency__v2").sourceKey,
    "sap.currency__v2",
  );
  assert.equal(context.fieldsForSource("sap.currency__v2").length, 2);
  assert.equal(
    context.atlasResolveSourceIdentity("sap.currency").sourceKey,
    "sap.currency",
  );
  assert.equal(
    context.atlasResolveSourceIdentity({ sourceKey: "sap.currency__v2" }).alias,
    "sap.currency_2",
  );
  const catalogKeys = context
    .sourceCatalogEntries()
    .map((source) => source.sourceKey);
  assert.ok(catalogKeys.includes("sap.currency__v2"));
});

test("every version gets its own Reference step and label", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  context.atlasAddSourceVersionState(original.id);
  context.atlasAddSourceVersionState(original.id);
  context.syncAutoReferenceSteps();

  const references = context.state.audit.steps.filter(
    (step) => step.step_type === "reference_source",
  );
  assert.deepEqual(
    [...references.map((step) => step.title)],
    [
      "Reference sap.currency · Version 1",
      "Reference sap.currency · Version 2",
      "Reference sap.currency · Version 3",
    ],
  );
  assert.deepEqual(
    [...references.map((step) => step.params.source_alias)],
    ["sap.currency", "sap.currency_2", "sap.currency_3"],
  );
  assert.equal(new Set(references.map((step) => step.id)).size, 3);
});

test("renaming a version relabels its Reference step and picker label", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  context.atlasAddSourceVersionState(original.id);
  const version = context.state.audit.sources[1];
  context.atlasRenameSourceVersionState(version.id, "Oct 2026 export");
  context.syncAutoReferenceSteps();

  assert.equal(
    context.state.audit.steps[1].title,
    "Reference sap.currency · Oct 2026 export",
  );
  assert.equal(
    context.atlasSourceDisambiguatedLabel({
      sourceKey: version.sourceKey,
      sourceFile: "sap.currency",
    }),
    "sap.currency · Oct 2026 export",
  );

  context.atlasRenameSourceVersionState(version.id, "  ");
  assert.equal(version.versionLabel, "Version 2");
});

test("versions are inserted after their group and removed on their own", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  context.atlasAddSourceState("wd.int2128a");
  context.atlasAddSourceVersionState(original.id);
  assert.deepEqual(
    [...context.state.audit.sources.map((source) => source.sourceKey)],
    ["sap.currency", "sap.currency__v2", "wd.int2128a"],
  );
  context.syncAutoReferenceSteps();

  const result = context.atlasRemoveSourceState("sap.currency__v2");
  assert.equal(result.changed, true);
  assert.deepEqual(
    [...context.state.audit.sources.map((source) => source.sourceKey)],
    ["sap.currency", "wd.int2128a"],
  );
  assert.equal(
    context.state.audit.fields.some(
      (field) => field.sourceKey === "sap.currency__v2",
    ),
    false,
  );
  assert.equal(
    context.state.audit.fields.filter(
      (field) => field.sourceKey === "sap.currency",
    ).length,
    2,
  );
  // With one copy left, the source is no longer labelled as a version.
  context.syncAutoReferenceSteps();
  assert.equal(context.state.audit.steps[0].title, "Reference sap.currency");
});

test("version numbers skip keys that are already taken", () => {
  const context = loadPicker();
  const original = addOriginal(context);
  context.atlasAddSourceVersionState(original.id);
  context.atlasAddSourceVersionState(original.id);
  context.atlasRemoveSourceState("sap.currency__v2");
  context.atlasAddSourceVersionState(original.id);
  assert.deepEqual(
    [...context.state.audit.sources.map((source) => source.sourceKey)],
    ["sap.currency", "sap.currency__v3", "sap.currency__v4"],
  );
});
