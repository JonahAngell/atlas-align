/**
 * Step type runtime: every step type owner asks the registry first.
 *
 * The repository definitions in catalogs/step-types/ load with the app (the
 * snapshots in step-type-snapshots.test.js prove their output is unchanged).
 * These tests load the whole app, register a sample type that no code knows
 * about next to them, and check that it reaches every output: English,
 * notes, Developer Logic, the editor, the picker, text import, the SQL and
 * Python scripts, qTest and Audit Issues.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp, recordAudit } from "./support/step-type-harness.js";
import { SNAPSHOT_DIR, snapshotCorpus } from "./support/step-type-corpus.js";

const SCHEMA = JSON.parse(
  readFileSync(
    new URL("../catalogs/step-types/schema.json", import.meta.url),
    "utf8",
  ),
);

const REPLACE_TEXT = {
  schemaVersion: 1,
  id: "replace_text",
  version: 1,
  label: "Replace Text",
  description: "Copy a field into a new column with some text replaced.",
  category: "transform",
  order: 45,
  status: "active",
  legacyType: "transform",
  aliases: { step_type: ["text_replace"] },
  migrations: [
    { op: "rename", from: "old_find", to: "find_text" },
    { op: "default", param: "replace_with", value: "" },
  ],
  subtypes: null,
  fields: [
    {
      param: "source_file",
      control: "source_picker",
      label: "Source file",
      required: true,
    },
    {
      param: "field_name",
      control: "field_picker",
      label: "Field",
      sourceParam: "source_file",
      required: true,
    },
    { param: "find_text", control: "text", label: "Find" },
    { param: "replace_with", control: "text", label: "Replace with" },
    {
      param: "column_name",
      control: "text",
      label: "New column",
      required: true,
    },
  ],
  outputs: { creates: ["{{param.column_name}}"] },
  english: {
    default:
      "Replace {{quote param.find_text}} with {{quote param.replace_with}} in {{field param.source_file param.field_name}} into new column {{quote param.column_name}}.",
  },
  autoNotes: { default: "Replaces every {{quote param.find_text}}." },
  formulas: {
    shape: "assignment",
    target: "{{param.column_name}}",
    default: {
      excel:
        "SUBSTITUTE({{field param.source_file param.field_name}}, {{quote param.find_text}}, {{quote param.replace_with}})",
      sql: "REPLACE({{field param.source_file param.field_name}}, {{quote param.find_text}}, {{quote param.replace_with}})",
      python:
        "{{field param.source_file param.field_name}}.astype(str).str.replace({{quote param.find_text}}, {{quote param.replace_with}}, regex=False)",
    },
  },
  export: {
    scriptRole: "column",
    qtest: { section: "D", testType: "Data Validation" },
  },
  validation: [
    {
      id: "find_required",
      when: "always",
      require: "find_text",
      severity: "critical",
      message: "Replace Text needs the text to find. Enter it on the step.",
    },
  ],
  textImport: { fromEnglish: true },
};

const KEEP_ROWS = {
  schemaVersion: 1,
  id: "keep_rows",
  version: 1,
  label: "Keep Rows",
  status: "active",
  subtypes: {
    param: "keep_mode",
    options: [
      { value: "equals", label: "Equals" },
      {
        value: "blank",
        label: "Is blank",
        export: { qtest: { testType: "Negative" } },
      },
    ],
  },
  fields: [
    { param: "source_file", control: "source_picker" },
    {
      param: "field_name",
      control: "field_picker",
      sourceParam: "source_file",
    },
    {
      param: "keep_value",
      control: "text",
      visibleWhen: { param: "keep_mode", equals: "equals" },
    },
  ],
  english: {
    bySubtype: {
      equals:
        "Keep rows where {{field param.source_file param.field_name}} equals {{quote param.keep_value}}.",
      blank:
        "Keep rows where {{field param.source_file param.field_name}} is blank.",
    },
  },
  formulas: {
    shape: "filter",
    bySubtype: {
      equals: {
        excel:
          "{{field param.source_file param.field_name}}={{quote param.keep_value}}",
        sql: "{{field param.source_file param.field_name}} = {{quote param.keep_value}}",
        python:
          "{{field param.source_file param.field_name}} == {{quote param.keep_value}}",
      },
      blank: {
        sql: "{{field param.source_file param.field_name}} IS NULL",
      },
    },
    fallback: { notes: ["Excel and Python need a hand-written blank test."] },
  },
  export: {
    scriptRole: "filter",
    qtest: { section: "B", testType: "Data Validation" },
  },
};

const SOURCES = [
  {
    id: "source_wd",
    name: "WD_Workers",
    sourceFile: "WD_Workers",
    alias: "wd",
    color: "#b3f5ff",
  },
];

function audit(steps) {
  return {
    schemaVersion: 1,
    sourceKind: "repo",
    id: "runtime-sample",
    name: "Runtime sample",
    purpose: "Sample new step types.",
    sources: SOURCES.map((item) => ({ ...item })),
    fields: [],
    steps: steps.map((step, index) => ({
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: index + 1,
      notes: "",
      conditions: [],
      ...step,
    })),
  };
}

const reference = {
  id: "s1",
  step_type: "reference_source",
  params: { source_file: "WD_Workers", source_alias: "wd" },
};
const replaceStep = (params = {}) => ({
  id: "s2",
  step_type: "replace_text",
  params: {
    source_file: "WD_Workers",
    field_name: "Name",
    find_text: "-",
    replace_with: "_",
    column_name: "Clean Name",
    ...params,
  },
});

async function appWith(definitions) {
  const context = await loadApp();
  context.__schema = SCHEMA;
  context.__definitions = definitions;
  const results = vm.runInContext(
    `(() => {
      const registry = ATLASStepTypes.registry.createRegistry({
        schema: __schema,
        helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
        blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
        handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
      });
      const results = [
        ...ATLASStepTypes.bundled.definitions,
        ...__definitions,
      ].map((definition) => registry.add(definition));
      ATLASStepTypeRuntime.useRegistry(registry);
      return results;
    })()`,
    context,
  );
  results.forEach((result) =>
    assert.equal(result.ok, true, JSON.stringify(result.errors)),
  );
  return context;
}

const run = (context, code) =>
  JSON.parse(JSON.stringify(vm.runInContext(code, context) ?? null));

const BUNDLED_IDS = [
  "create_column",
  "else",
  "filter_rows",
  "flag_records",
  "format_field",
  "if_then",
  "join",
  "reference_source",
  "remove_duplicates",
  "sort_records",
  "split_field",
  "union_sources",
];

test("the repository definitions load with the app", async () => {
  const context = await loadApp();
  assert.deepEqual(
    run(context, "ATLASStepTypeRuntime.registry().rejected()"),
    [],
  );
  assert.deepEqual(
    run(
      context,
      "ATLASStepTypeRuntime.registry().list({ includeLegacy: true }).map((d) => d.id).sort()",
    ),
    BUNDLED_IDS,
  );
  // Split Field is legacy: it keeps working but is not offered.
  assert.deepEqual(run(context, "STEP_TYPE_OPTIONS.map(([value]) => value)"), [
    "reference_source",
    "create_column",
    "if_then",
    "join",
    "format_field",
    "sort_records",
    "remove_duplicates",
  ]);
  assert.equal(run(context, "ATLAS_IMPORT_TITLES.split_field"), "Split Field");
  // Source steps come from importing a source, not from the Add Rule menu.
  assert.deepEqual(
    run(context, "atlasNewRuleTypeOptions().map(([value]) => value)"),
    [
      "create_column",
      "if_then",
      "join",
      "format_field",
      "sort_records",
      "remove_duplicates",
    ],
  );
  assert.equal(
    run(context, 'atlasRuleTypeDescription("sort_records")'),
    "Sort records by one or more fields.",
  );
  assert.equal(
    run(context, 'atlasRuleTypeDescription("join")'),
    "Combine sources with Join or Union logic.",
  );
  // Legacy types keep their import titles.
  assert.equal(run(context, "ATLAS_IMPORT_TITLES.else"), "ELSE");
  assert.equal(
    run(context, "ATLAS_IMPORT_TITLES.flag_records"),
    "Flag Records",
  );
});

test("an empty registry offers no step types", async () => {
  const context = await loadApp();
  vm.runInContext(
    `ATLASStepTypeRuntime.useRegistry(
      ATLASStepTypes.registry.createRegistry({ schema: ATLASStepTypes.bundled.schema }),
    )`,
    context,
  );
  assert.deepEqual(
    run(context, "STEP_TYPE_OPTIONS.map(([value]) => value)"),
    [],
  );
});

test("behavior blocks build the types that came with ATLAS Align", async () => {
  const context = await loadApp();
  context.__union = {
    id: "u1",
    step_type: "union_sources",
    source: "Combined",
    params: {
      union_left_source: "WD_Workers",
      union_right_source: "SAP_HI0256",
    },
  };
  // The legacy Union Sources step opens as a UNION Join.
  const union = run(context, "normalizeCatalogStep(__union)");
  assert.equal(union.step_type, "join");
  assert.equal(union.type, "join");
  assert.equal(union.params.join_type, "UNION");
  assert.equal(union.params.left_source, "WD_Workers");
  assert.equal(union.params.output_source, "Combined");
  assert.match(run(context, "renderGuidedBuilder(__union)"), /Union Sources/);

  // A step that names no type opens as IF / THEN.
  context.__blank = { id: "b1", params: {} };
  const blank = run(context, "normalizeCatalogStep(__blank)");
  assert.equal(blank.step_type, "if_then");
  assert.equal(blank.type, "if");
  assert.equal(blank.title, "IF / THEN");
  assert.ok(blank.params.conditions_json);

  // The legacy type name still finds its definition.
  context.__create = {
    id: "c1",
    type: "create",
    field: "Total",
    params: { value_mode: "Static value", static_value: "1" },
  };
  const created = run(context, "normalizeCatalogStep(__create)");
  assert.equal(created.step_type, "create_column");
  assert.equal(created.params.column_name, "Total");
  assert.deepEqual(run(context, "atlasCreatedColumnNames(__create)"), [
    "Total",
  ]);
  assert.match(run(context, "analystLogic(__create)"), /Total/);
  assert.equal(
    run(context, "ATLASStepTypeRuntime.scriptRole(__create)"),
    "column",
  );
  assert.match(
    run(context, "renderGuidedBuilder(__create)"),
    /^<div class="selected-source-only-builder"><div class="guided-builder"><h4>Create Column<\/h4>/,
  );

  // A new type can reuse a block under its own label and export.
  vm.runInContext(
    `(() => {
       const join = ATLASStepTypes.bundled.definitions.find((d) => d.id === "join");
       const registry = ATLASStepTypes.registry.createRegistry({
         schema: ATLASStepTypes.bundled.schema,
         helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
         blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
         handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
       });
       const added = registry.add({ ...join, id: "lookup_join", label: "Lookup Join", order: 45 });
       if (!added.ok) throw new Error(JSON.stringify(added.errors));
       ATLASStepTypeRuntime.useRegistry(registry);
     })()`,
    context,
  );
  context.__lookup = {
    id: "l1",
    step_type: "lookup_join",
    params: { left_source: "WD_Workers", right_source: "SAP_HI0256" },
  };
  run(context, "normalizeCatalogStep(__lookup)");
  assert.equal(context.__lookup.params.join_type, "INNER JOIN");
  assert.equal(context.__lookup.title, "Lookup Join");
  assert.match(run(context, "analystLogic(__lookup)"), /^Join /);
  // It also gets the join's Audit Issues check and qTest outcomes.
  assert.deepEqual(
    run(context, "ATLASStepTypeRuntime.builtInChecks(__lookup)"),
    ["join"],
  );
  assert.match(
    run(
      context,
      "ATLASStepTypeRuntime.qtestOutcomes(__lookup, { record: 'r' })[0]",
    ),
    /^Records are matched where .*; joined values display on the r\.$/,
  );
});

test("exports and Audit Issues checks come from the definitions", async () => {
  const context = await loadApp();
  const call = (expression, step) => {
    context.__step = step;
    return run(context, `ATLASStepTypeRuntime.${expression}`);
  };

  // Script roles place every type in the SQL and Python scripts.
  context.__roles = [
    "reference_source",
    "join",
    "create_column",
    "if_then",
    "else",
    "filter_rows",
    "flag_records",
    "sort_records",
    "remove_duplicates",
  ];
  assert.deepEqual(
    run(
      context,
      "__roles.map((step_type) => atlasCodeStepRole({ step_type, params: {} }))",
    ),
    [
      "source",
      "join",
      "column",
      "condition",
      "else",
      "filter",
      "flag",
      "sort",
      "dedupe",
    ],
  );
  assert.equal(
    run(context, "atlasCodeStepRole({ step_type: 'mystery' })"),
    "none",
  );

  // Template outcomes; the placement keeps only section and test type.
  const format = {
    step_type: "format_field",
    params: { source_file: "wd", field_name: "Pernr", format: "" },
  };
  assert.deepEqual(call("qtestOutcomes(__step)", format), [
    'file "wd" column "Pernr" displays in the designed format.',
    'The formatted file "wd" column "Pernr" value matches the underlying source value.',
  ]);
  assert.deepEqual(call("qtest(__step)", format), {
    section: "D",
    testType: "Data Validation",
  });
  assert.match(
    call("qtestOutcomes(__step)[0]", {
      step_type: "remove_duplicates",
      params: { duplicate_action: "Keep last record" },
    }),
    /^Duplicate records are removed, .*last record\.$/,
  );

  // Behavior blocks read the THEN action qTest tests.
  assert.deepEqual(
    call("qtestAction(__step)", {
      step_type: "flag_records",
      params: { flag_action: "do_not_display" },
    }),
    { kind: "do_not_display" },
  );
  assert.deepEqual(
    call("qtestAction(__step)", {
      step_type: "if_then",
      params: { then_action_type: "set_column_value", then_target_column: "X" },
    }),
    {
      kind: "set_column",
      targetColumn: "X",
      valueField: "",
      calculated: false,
    },
  );
  assert.equal(call("qtestAction(__step)", format), null);

  // builtIn rules turn on the Audit Issues checks, some only for a subtype.
  assert.deepEqual(
    call("builtInChecks(__step)", {
      step_type: "if_then",
      params: { then_action_type: "set_column_calculation" },
    }),
    ["conditions", "fieldRelationships", "action", "thenMath"],
  );
  assert.deepEqual(
    call("builtInChecks(__step)", {
      step_type: "create_column",
      params: { value_mode: "String transformation" },
    }),
    ["createdColumns", "stringTransform"],
  );
  assert.deepEqual(call("builtInChecks(__step)", format), []);
  assert.equal(call("builtInChecks(__step)", { step_type: "mystery" }), null);
  assert.equal(call("qtestOutcomes(__step)", { step_type: "mystery" }), null);
});

test("library blocks and handlers build the list editors", async () => {
  const context = await loadApp();
  context.__sort = {
    id: "s9",
    step_type: "sort_records",
    params: {
      source_file: "WD_Workers",
      field_name: "Name",
      sort_direction: "Descending",
    },
  };
  // The sync_sort_fields handler writes the list from the legacy params.
  const step = run(context, "normalizeCatalogStep(__sort)");
  assert.equal(step.params.sort_direction, "Descending");
  assert.match(step.params.sort_fields_json, /"fieldName":"Name"/);
  const html = run(context, "ATLASStepTypeRuntime.renderEditor(__sort)");
  assert.match(html, /<h4>Sort Records<\/h4>/);
  assert.equal(
    html.includes(run(context, "atlasSortFieldsEditorHtml(__sort.params)")),
    true,
  );
});

test("formula notes and value templates come from the definition", async () => {
  const context = await loadApp();
  context.__format = {
    id: "s9",
    step_type: "format_field",
    params: {
      source_file: "WD_Workers",
      source_alias: "",
      field_name: "Name",
      format: "upper case",
    },
  };
  const formulas = run(context, "atlasDeveloperFormulas(__format)");
  assert.deepEqual(formulas.notes, [
    'Note: Format "upper case" is not a standard option. Check the formulas before running.',
  ]);
  // The hidden alias shows the source's alias while the param is blank.
  const html = run(context, "ATLASStepTypeRuntime.renderEditor(__format)");
  assert.match(html, /data-param="source_alias" value="[^"]+"/);
});

test("a registered type reaches every output", async () => {
  const context = await appWith([REPLACE_TEXT]);
  const recorded = await recordAudit(
    context,
    audit([reference, replaceStep()]),
  );
  const step = recorded.steps.find((item) => item.id === "s2");
  const sentence =
    'Replace "-" with "_" in file "wd" column "Name" into new column "Clean Name".';
  assert.equal(step.english, sentence);
  assert.equal(step.autoNotes, 'Replaces every "-".');
  assert.deepEqual(step.formulas, {
    excel: '=SUBSTITUTE([@[Name]], "-", "_")',
    sql: "REPLACE([Name], '-', '_') AS [Clean Name]",
    python:
      'df["Clean Name"] = df["Name"].astype(str).str.replace("-", "_", regex=False)',
    notes: [],
  });
  assert.match(
    step.developer,
    /REPLACE\(\[Name\], '-', '_'\) AS \[Clean Name\]/,
  );
  assert.equal(step.normalizedStep.type, "transform");
  assert.equal(step.normalizedStep.title, "Replace Text");

  assert.match(step.editorHtml, /<h4>Replace Text<\/h4>/);
  assert.match(step.editorHtml, /data-param="find_text" value="-"/);
  assert.match(step.editorHtml, /data-param="column_name" value="Clean Name"/);

  assert.deepEqual(step.textImport, {
    ok: true,
    stepType: "replace_text",
    params: {
      find_text: "-",
      replace_with: "_",
      source_file: "wd",
      field_name: "Name",
      column_name: "Clean Name",
    },
  });

  assert.match(
    recorded.sqlScript,
    /REPLACE\(\[Name\], '-', '_'\) AS \[Clean Name\]/,
  );
  assert.doesNotMatch(recorded.sqlScript, /TODO \(skipped\) Step 2/);
  assert.match(
    recorded.pythonScript,
    /df\["Clean Name"\] = df\["Name"\]\.astype\(str\)/,
  );

  const sectionD = recorded.qtest.find((section) => section.code === "D");
  assert.ok(
    JSON.stringify(sectionD).includes(sentence.replace(/"/g, '\\"')),
    "the step is listed in qTest section D",
  );
  // Only audit setup issues remain: nothing about the steps.
  assert.deepEqual(
    recorded.issues.filter(
      (issue) => !issue.key.startsWith("audit.assignments."),
    ),
    [],
  );
});

test("picker lists, titles and created columns come from the registry", async () => {
  const context = await appWith([REPLACE_TEXT]);
  const options = run(context, "STEP_TYPE_OPTIONS");
  // Order 45 sits between Join (40) and Format Field (50).
  assert.deepEqual(
    options.map(([value]) => value),
    [
      "reference_source",
      "create_column",
      "if_then",
      "join",
      "replace_text",
      "format_field",
      "sort_records",
      "remove_duplicates",
    ],
  );
  assert.deepEqual(
    run(
      context,
      'atlasNewRuleTypeOptions().find(([value]) => value === "replace_text")',
    ),
    ["replace_text", "Replace Text"],
  );
  assert.equal(
    run(context, 'atlasRuleTypeDescription("replace_text")'),
    REPLACE_TEXT.description,
  );
  assert.equal(
    run(context, "ATLAS_IMPORT_TITLES.replace_text"),
    "Replace Text",
  );
  assert.equal(
    run(context, 'legacyTypeFromStepType("replace_text")'),
    "transform",
  );
  context.__step = replaceStep();
  assert.deepEqual(run(context, "atlasCreatedColumnNames(__step)"), [
    "Clean Name",
  ]);
  assert.equal(
    run(context, "atlasCreateRuleOfType('replace_text').step_type"),
    "replace_text",
  );
});

test("validation rules become Audit Issues with their own severity", async () => {
  const context = await appWith([REPLACE_TEXT]);
  await recordAudit(
    context,
    audit([reference, replaceStep({ find_text: "", column_name: "" })]),
  );
  const issues = run(
    context,
    `ATLASAuditIssues.current().issues
      .filter((issue) => issue.ruleId === "audit.logic.step-type-rules")
      .map(({ severity, title, summary, canFix }) => ({ severity, title, summary, canFix }))`,
  );
  assert.deepEqual(
    issues.sort((a, b) => a.summary.localeCompare(b.summary)),
    [
      {
        severity: "critical",
        title: "Replace Text step needs attention",
        summary: "Replace Text needs the text to find. Enter it on the step.",
        canFix: true,
      },
      {
        severity: "warning",
        title: "Replace Text step needs attention",
        summary:
          "Replace Text: New column is required. Fill it in on the step.",
        canFix: true,
      },
    ],
  );
});

test("aliases and migrations run when an audit loads", async () => {
  const context = await appWith([REPLACE_TEXT]);
  const recorded = await recordAudit(
    context,
    audit([
      reference,
      {
        id: "s2",
        step_type: "text_replace",
        params: {
          source_file: "WD_Workers",
          field_name: "Name",
          old_find: "x",
          column_name: "Out",
        },
      },
    ]),
  );
  const step = recorded.steps.find((item) => item.id === "s2");
  assert.equal(step.stepType, "replace_text");
  assert.equal(step.normalizedStep.params.find_text, "x");
  assert.equal(step.normalizedStep.params.replace_with, "");
  assert.equal("old_find" in step.normalizedStep.params, false);
});

test("filter shapes, subtypes and export rules", async () => {
  const context = await appWith([KEEP_ROWS]);
  const recorded = await recordAudit(
    context,
    audit([
      reference,
      {
        id: "s2",
        step_type: "keep_rows",
        params: {
          source_file: "WD_Workers",
          field_name: "Country",
          keep_value: "US",
        },
      },
      {
        id: "s3",
        step_type: "keep_rows",
        params: {
          keep_mode: "blank",
          source_file: "WD_Workers",
          field_name: "Country",
        },
      },
    ]),
  );
  const [equals, blank] = recorded.steps.slice(1);
  assert.equal(equals.normalizedStep.params.keep_mode, "equals");
  assert.equal(
    equals.english,
    'Keep rows where file "wd" column "Country" equals "US".',
  );
  assert.deepEqual(equals.formulas, {
    excel: '=[@[Country]]="US"',
    sql: "WHERE [Country] = 'US'",
    python: 'mask = df["Country"] == "US"\ndf = df[mask]',
    notes: [],
  });
  assert.deepEqual(blank.formulas, {
    sql: "WHERE [Country] IS NULL",
    notes: ["Excel and Python need a hand-written blank test."],
  });
  assert.match(equals.editorHtml, /data-param="keep_value"/);
  assert.doesNotMatch(blank.editorHtml, /data-param="keep_value"/);
  assert.match(recorded.sqlScript, /WHERE \[Country\] = 'US'/);
  assert.match(recorded.sqlScript, /WHERE \[Country\] IS NULL/);
  const testTypes = Object.fromEntries(
    recorded.qtest
      .flatMap((section) =>
        (section.rows || section.items || []).map((row) => [
          row.sourceRule,
          `${section.code}:${row.testType}`,
        ]),
      )
      .filter(([rule]) => /^Keep rows/.test(rule)),
  );
  assert.deepEqual(Object.values(testTypes).sort(), [
    "B:Data Validation",
    "B:Negative",
  ]);
});

test("a registered type leaves built-in step outputs unchanged", async () => {
  const context = await appWith([REPLACE_TEXT, KEEP_ROWS]);
  for (const { name, document } of snapshotCorpus().slice(0, 4)) {
    const expected = JSON.parse(
      readFileSync(new URL(`${name}.json`, SNAPSHOT_DIR), "utf8"),
    );
    const actual = JSON.parse(
      JSON.stringify(await recordAudit(context, document)),
    );
    assert.deepEqual(actual, expected, name);
  }
});
