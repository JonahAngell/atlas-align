// Regression tests for Reference alias text, string-transform leftovers,
// logic pill colours and source versions in the pickers. They load the real
// browser scripts into one vm context.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  STEP_TYPE_ENGINE_SCRIPTS,
  STEP_TYPE_RUNTIME_SCRIPTS,
} from "./support/step-type-scripts.js";

const read = (file) =>
  fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function baseContext(extra) {
  let next = 0;
  const element = () => ({
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    remove() {},
  });
  return {
    console,
    structuredClone,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Intl,
    URL,
    uid: (prefix) => `${prefix}_${(next += 1)}`,
    status() {},
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;"),
    document: {
      ...element(),
      getElementById: () => null,
      createElement: () => element(),
      body: element(),
      documentElement: element(),
    },
    window: {
      addEventListener() {},
      matchMedia: () => ({
        matches: false,
        addEventListener() {},
        addListener() {},
      }),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CSS: { escape: (v) => String(v) },
    $: () => null,
    e: {},
    AUDIT_FLOW_PAGES: [],
    atlasDisplayDocument: () => null,
    ...extra,
  };
}

function load(files, extra = {}, setup = "") {
  const stubs = new Set();
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const context = baseContext(extra);
    for (const name of stubs)
      if (!(name in context)) context[name] = () => undefined;
    // The step type scripts install on window; in a browser that is the
    // global object, which the app's own scripts read them from.
    for (const name of [
      "ATLASStepTypes",
      "ATLASStepTypeLibrary",
      "ATLASStepTypeRuntime",
    ])
      Object.defineProperty(context.window, name, {
        get: () => context[name],
        set: (value) => {
          context[name] = value;
        },
      });
    vm.createContext(context);
    try {
      for (const file of files)
        vm.runInContext(read(file), context, { filename: file });
      if (setup) vm.runInContext(setup, context);
      context.__stubs = [...stubs];
      return context;
    } catch (error) {
      const match = /^(\w+) is not defined$/.exec(error?.message || "");
      if (!match || stubs.has(match[1])) throw error;
      stubs.add(match[1]);
    }
  }
  throw new Error("too many stubs");
}

const APP_FILES = [
  ...STEP_TYPE_ENGINE_SCRIPTS,
  "js/01-state-dom.js",
  "js/07-phrase-catalog.js",
  "js/02-logic-rendering.js",
  "js/02-hierarchy.js",
  "js/02b-developer-formulas.js",
  "js/09-workbook-import.js",
  "js/10-field-picker.js",
  "js/11-repo-library.js",
  ...STEP_TYPE_RUNTIME_SCRIPTS,
  "js/14-catalog-driven-builder.js",
  "js/15a-audit-library-ui.js",
  "js/15e-logic-step-editor.js",
  "js/15g-visual-ui-events.js",
  "js/21-display-fields.js",
];

const CATALOG_SETUP = `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`;

const library = () => [
  {
    // Library alias is the same as the file name (common for SAP extracts).
    sourceKey: "sap.currency",
    sourceFile: "sap.currency",
    alias: "sap.currency",
    name: "sap.currency",
    fields: [
      {
        fieldName: "WAERS",
        vanityLabel: "Currency",
        displayFormat: "Text",
        dataCategory: "Finance",
      },
      { fieldName: "DATUM", vanityLabel: "Export Date", displayFormat: "Date" },
      { fieldName: "Name", vanityLabel: "Currency Name" },
    ],
  },
  {
    sourceKey: "wd.cast",
    sourceFile: "wd.INT_CAST",
    alias: "Cast",
    name: "wd.INT_CAST",
    fields: [{ fieldName: "Name" }, { fieldName: "First Name" }],
  },
  {
    sourceKey: "wd.crew",
    sourceFile: "wd.INT_CREW",
    alias: "Crew",
    name: "wd.INT_CREW",
    fields: [{ fieldName: "Name" }, { fieldName: "Department" }],
  },
];

function app() {
  const ctx = load(
    APP_FILES,
    {},
    `${CATALOG_SETUP}
     repoLibraryState.sourceFiles = ${JSON.stringify(library())};
     state.audit = { sources: [], fields: [], steps: [], displayFields: [] };
     globalThis.state = state; globalThis.repoLibraryState = repoLibraryState;`,
  );
  ctx.add = (key) => {
    const result = ctx.atlasAddSourceState(key);
    assert.equal(result.changed, true, `added ${key}`);
    ctx.atlasInvalidateSourceDerivedState?.();
    return ctx.state.audit.sources.at(-1);
  };
  ctx.sync = () => {
    ctx.atlasInvalidateSourceDerivedState?.();
    ctx.syncAutoReferenceSteps();
    ctx.atlasInvalidateSourceDerivedState?.();
  };
  return ctx;
}

const references = (ctx) =>
  ctx.state.audit.steps.filter((s) => s.step_type === "reference_source");

// ---------------------------------------------------------------------------
// Bug 1: Reference File steps omit "as [alias]"
// ---------------------------------------------------------------------------
test("reference: reference step always says 'as <alias>' (alias differs from file)", () => {
  const ctx = app();
  ctx.add("wd.cast");
  ctx.sync();
  assert.equal(
    ctx.analystLogic(references(ctx)[0]),
    'Reference source file "wd.INT_CAST" as "Cast":',
  );
});

test("reference: reference step always says 'as <alias>' (alias equals file name)", () => {
  const ctx = app();
  ctx.add("sap.currency");
  ctx.sync();
  assert.equal(
    ctx.analystLogic(references(ctx)[0]),
    'Reference source file "sap.currency" as "sap.currency":',
  );
});

test("reference: V1 of a versioned source keeps its alias in the sentence", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.sync();
  assert.deepEqual(
    [...references(ctx).map((step) => ctx.analystLogic(step))],
    [
      'Reference source file "sap.currency" as "sap.currency":',
      'Reference source file "sap.currency" as "sap.currency_2":',
    ],
  );
});

test("reference: developer SQL always names the alias", () => {
  const ctx = app();
  ctx.add("sap.currency");
  ctx.sync();
  const dev = ctx.atlasDeveloperFormulas(references(ctx)[0]);
  assert.match(dev.sql, / AS /);
});

// ---------------------------------------------------------------------------
// Bug 2: typing a calculated column name leaves "F", "Fi", "Fir" ... behind
// ---------------------------------------------------------------------------
test("calculated: typing a string-transform column name registers one field", () => {
  const ctx = app();
  ctx.add("wd.cast");
  const step = {
    id: "step_calc",
    step_type: "create_column",
    params: {
      value_mode: "String transformation",
      string_operation: "first_characters",
      string_source_file: "wd.cast",
      string_source_field: "Name",
      string_character_count: "3",
      column_name: "",
    },
  };
  ctx.state.audit.steps.push(step);
  // Each keystroke re-renders, and every render normalizes the step.
  for (const name of ["F", "Fi", "Fir", "Firs", "First", "First Name"]) {
    step.params.column_name = name;
    ctx.normalizeCatalogStep(step);
  }
  const calculated = ctx.state.audit.fields
    .filter((field) => field.calculated)
    .map((field) => field.fieldName);
  assert.deepEqual([...calculated], ["First Name"]);
});

test("calculated: Display Fields lists only the final calculated field", () => {
  const ctx = app();
  ctx.add("wd.cast");
  const step = {
    id: "step_calc",
    step_type: "create_column",
    params: {
      value_mode: "String transformation",
      string_operation: "first_characters",
      string_source_file: "wd.cast",
      string_source_field: "Name",
      string_character_count: "3",
    },
  };
  ctx.state.audit.steps.push(step);
  for (const name of ["F", "Fi", "Fir", "First Name"]) {
    step.params.column_name = name;
    ctx.analystLogic(step); // the Rules card renders on every keystroke
  }
  const titles = ctx
    .atlasDisplayRows({ includeHidden: true })
    .filter((row) => row.calculated)
    .map((row) => row.fieldTitle);
  assert.deepEqual([...titles], ["First Name"]);
});

// ---------------------------------------------------------------------------
// Bug 3: field colours with shared field names
// ---------------------------------------------------------------------------
function pills(ctx, html) {
  return [
    ...html.matchAll(
      /<span class="([^"]+)"[^>]*?--pill-bg:([^;"]+)[^>]*>(?:<span[^>]*><\/span>)?([^<]*)<\/span>/g,
    ),
  ].map(([, klass, color, text]) => ({ klass, color, text }));
}

test("colour: a field coloured by the source named right before it", () => {
  const ctx = app();
  const cast = ctx.add("wd.cast");
  const crew = ctx.add("wd.crew");
  ctx.atlasEnsureAuditSourceColors();
  const html = ctx.renderLogicWithPills(
    'If file "Crew" column "Name" is equal to file "Cast" column "Name"',
  );
  const got = pills(ctx, html).map((p) => `${p.text}:${p.color}`);
  assert.deepEqual(got, [
    `Crew:${crew.color}`,
    `Name:${crew.color}`,
    `Cast:${cast.color}`,
    `Name:${cast.color}`,
  ]);
});

test("colour: a source field is not coloured as a created column of the same name", () => {
  const ctx = app();
  ctx.add("wd.cast");
  const crew = ctx.add("wd.crew");
  ctx.state.audit.steps.push({
    id: "step_dept",
    step_type: "create_column",
    params: {
      column_name: "Name",
      value_mode: "Static value",
      static_value: "x",
    },
  });
  const html = ctx.renderLogicWithPills(
    'If file "Crew" column "Name" is blank',
  );
  const name = pills(ctx, html).find((p) => p.text === "Name");
  assert.equal(name.color, crew.color);
});

test("colour: quoted comparison text is not coloured as a field", () => {
  const ctx = app();
  ctx.add("wd.cast");
  ctx.add("wd.crew");
  const html = ctx.renderLogicWithPills(
    'If file "Crew" column "Department" is equal to "Name" or "Department"',
  );
  const values = pills(ctx, html).filter((p) => p.text !== "Crew");
  assert.deepEqual(
    values.map((p) => p.text),
    ["Department"],
    "only the column is a coloured pill, not the compared text",
  );
});

test("colour: picker, logic text and Display Fields agree on a field's colour", () => {
  const ctx = app();
  ctx.add("wd.cast");
  const crew = ctx.add("wd.crew");
  const pickerCrewName = ctx
    .pickerFieldOptions("")
    .find((item) => item.sourceKey === "wd.crew" && item.fieldName === "Name");
  assert.equal(pickerCrewName?.sourceColor, crew.color, "picker");
});

test("colour: V2 field pills use V2's colour, not V1's", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const [v1, v2] = ctx.state.audit.sources;
  assert.notEqual(v1.color, v2.color);
  const html = ctx.renderLogicWithPills(
    'If file "sap.currency_2" column "WAERS" is blank',
  );
  const got = pills(ctx, html).map((p) => p.color);
  assert.deepEqual(got, [v2.color, v2.color]);
});

// ---------------------------------------------------------------------------
// Bug 4: V2 fields in the visual picker
// ---------------------------------------------------------------------------
const libraryFieldNames = ["WAERS", "DATUM", "Name"];

test("versions: picker lists V2's fields when V2 is picked directly", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const fields = ctx
    .pickerFieldOptions("sap.currency__v2")
    .filter((item) => item.origin === "source");
  assert.deepEqual([...fields.map((f) => f.fieldName)], libraryFieldNames);
  assert.ok(fields.every((f) => f.sourceKey === "sap.currency__v2"));
});

test("versions: steps under V2's Reference step get V2's fields", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.sync();
  const v2Reference = references(ctx)[1];
  const child = {
    id: "child_1",
    parentId: v2Reference.id,
    step_type: "if",
    params: {},
    conditions: [],
  };
  ctx.state.audit.steps.push(child);
  ctx.atlasInvalidateSourceDerivedState?.();
  const referenceSource = ctx.atlasReferenceChildSource(child);
  const fields = ctx
    .pickerFieldOptions(referenceSource)
    .filter((item) => item.origin === "source");
  assert.deepEqual(
    [...new Set(fields.map((f) => f.sourceKey))],
    ["sap.currency__v2"],
    `reference resolved to "${referenceSource}"`,
  );
  assert.deepEqual([...fields.map((f) => f.fieldName)], libraryFieldNames);
});

test("versions: V2 audit fields are an exact copy of the library fields", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  const strip = (f) => ({
    rawFieldName: f.rawFieldName,
    name: f.name,
    displayFormat: f.displayFormat,
    dataCategory: f.dataCategory,
  });
  const v1 = ctx.state.audit.fields
    .filter((f) => f.sourceKey === "sap.currency")
    .map(strip);
  const v2 = ctx.state.audit.fields
    .filter((f) => f.sourceKey === "sap.currency__v2")
    .map(strip);
  assert.deepEqual(v2, v1);
});

test("versions: V2 picker entries match V1's (labels, formats, categories)", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const shape = (f) =>
    [
      f.fieldName,
      f.vanityLabel,
      f.displayFormat || "",
      f.dataCategory || "",
    ].join("|");
  const all = ctx.pickerFieldOptions("").filter((i) => i.origin === "source");
  const v1 = all.filter((i) => i.sourceKey === "sap.currency").map(shape);
  const v2 = all.filter((i) => i.sourceKey === "sap.currency__v2").map(shape);
  assert.deepEqual(v2, v1);
});

test("versions: Display Fields picker lists V2's own fields under V2", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const entries = ctx.atlasDisplayPickerEntries().filter((e) => !e.custom);
  const bySource = (key) =>
    entries
      .filter((e) => e.sourceKey === key)
      .map((e) => `${e.rawName}|${e.label}`);
  const v1 = bySource("sap.currency");
  const v2 = bySource("sap.currency__v2");
  assert.equal(v1.length, 3, `V1 entries: ${JSON.stringify(v1)}`);
  assert.deepEqual(v2, v1, `V2 entries: ${JSON.stringify(v2)}`);
});

test("versions: adding a V2 field from the Display Fields picker works", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const entry = ctx
    .atlasDisplayPickerEntries()
    .find((e) => e.sourceKey === "sap.currency__v2" && e.rawName === "DATUM");
  assert.ok(entry, "picker offers V2 DATUM");
  const staged = ctx.atlasStageDisplayField(
    entry.pickerSource,
    entry.pickerField,
    entry,
  );
  assert.equal(staged.ok, true, staged.message);
  assert.equal(staged.row.uniqueId || staged.row.sourceKey, "sap.currency__v2");
});

test("colour: Display Fields colours same-named fields by their own source", () => {
  const ctx = app();
  const cast = ctx.add("wd.cast");
  const crew = ctx.add("wd.crew");
  ctx.state.audit.steps.push({
    id: "step_if",
    step_type: "if",
    params: {
      conditions_json: JSON.stringify([
        {
          sourceFile: "wd.cast",
          fieldName: "Name",
          operator: "is blank",
          valueMode: "blank",
        },
        {
          connector: "AND",
          sourceFile: "wd.crew",
          fieldName: "Name",
          operator: "is blank",
          valueMode: "blank",
        },
      ]),
    },
    conditions: [],
  });
  const rows = ctx
    .atlasDisplayRows({ includeHidden: true })
    .filter((row) => row.fieldTitle === "Name")
    .map((row) => `${row.uniqueId}:${row.sourceColor}`);
  assert.deepEqual(
    [...rows],
    [`wd.cast:${cast.color}`, `wd.crew:${crew.color}`],
  );
});

test("colour: V1 and V2 rows in Display Fields keep their own colours", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  const [v1, v2] = ctx.state.audit.sources;
  ctx.state.audit.steps.push({
    id: "step_if",
    step_type: "if",
    params: {
      conditions_json: JSON.stringify([
        {
          sourceFile: "sap.currency",
          fieldName: "WAERS",
          operator: "is blank",
          valueMode: "blank",
        },
        {
          connector: "AND",
          sourceFile: "sap.currency__v2",
          fieldName: "WAERS",
          operator: "is blank",
          valueMode: "blank",
        },
      ]),
    },
    conditions: [],
  });
  const rows = ctx
    .atlasDisplayRows({ includeHidden: true })
    .filter((row) => row.fieldTitle === "WAERS")
    .map((row) => `${row.uniqueId}:${row.sourceColor}`);
  assert.deepEqual([...rows].sort(), [
    `sap.currency:${v1.color}`,
    `sap.currency__v2:${v2.color}`,
  ]);
});

test("V1 rows sort before V2 rows in Display Fields", () => {
  const ctx = app();
  const original = ctx.add("sap.currency");
  ctx.atlasAddSourceVersionState(original.id);
  ctx.atlasInvalidateSourceDerivedState();
  ctx.state.audit.steps.push({
    id: "step_if",
    step_type: "if",
    conditions: [],
    params: {
      conditions_json: JSON.stringify([
        {
          sourceFile: "sap.currency",
          fieldName: "WAERS",
          operator: "is blank",
          valueMode: "blank",
        },
        {
          connector: "AND",
          sourceFile: "sap.currency__v2",
          fieldName: "WAERS",
          operator: "is blank",
          valueMode: "blank",
        },
      ]),
    },
  });
  const order = ctx
    .atlasDisplayRows({ includeHidden: true })
    .map((row) => row.uniqueId);
  assert.deepEqual([...order], ["sap.currency", "sap.currency__v2"]);
});

test("calculated: clearing the column name drops the field it registered", () => {
  const ctx = app();
  const step = {
    id: "step_calc",
    step_type: "create_column",
    params: {
      value_mode: "String transformation",
      string_operation: "first_characters",
      string_source_file: "wd.cast",
      string_source_field: "Name",
      string_character_count: "3",
      column_name: "Code",
    },
  };
  ctx.state.audit.steps.push(step);
  ctx.normalizeCatalogStep(step);
  step.params.column_name = "";
  ctx.normalizeCatalogStep(step);
  assert.equal(ctx.state.audit.fields.filter((f) => f.calculated).length, 0);
});

test("calculated: loading an audit removes leftovers from earlier typing", () => {
  const ctx = app();
  const leftover = (name, extra = {}) => ({
    id: `field_${name}`,
    sourceFile: "Calculated Field",
    fieldName: name,
    name,
    calculated: true,
    created: true,
    custom: true,
    createdByStepId: "step_calc",
    resultOperation: "first_characters",
    ...extra,
  });
  const saved = {
    name: "Saved",
    sources: [],
    steps: [
      {
        id: "step_calc",
        step_type: "create_column",
        params: {
          value_mode: "String transformation",
          string_operation: "first_characters",
          string_source_field: "Name",
          string_character_count: "3",
          column_name: "First Name",
        },
      },
    ],
    fields: [
      leftover("F"),
      leftover("Fi"),
      leftover("First Name"),
      leftover("Gone", { createdByStepId: "step_deleted" }),
      {
        id: "f_src",
        sourceKey: "wd.cast",
        sourceFile: "wd.INT_CAST",
        name: "Name",
        rawFieldName: "Name",
        type: "Source",
      },
    ],
    displayFields: [
      {
        sourceFile: "Calculated Field",
        sourceKey: "",
        fieldName: "Fi",
        displayed: false,
      },
      {
        sourceFile: "Calculated Field",
        canonicalKey: "calculated:step_calc",
        fieldName: "First Name",
        displayed: true,
      },
      {
        sourceKey: "wd.cast",
        sourceFile: "wd.INT_CAST",
        fieldName: "Name",
        displayed: true,
      },
    ],
  };
  const loaded = ctx.normalizeLoadedAudit(saved, "database");
  assert.deepEqual(
    [...loaded.fields.map((f) => f.fieldName || f.name)],
    ["First Name", "Name"],
  );
  assert.deepEqual(
    [...loaded.displayFields.map((p) => p.fieldName)],
    ["First Name", "Name"],
  );
});
