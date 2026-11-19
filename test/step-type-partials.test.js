/**
 * Template partials, schema version 2, the condition engine file and the
 * condition roots (Phase 8, branch 5030 of the Dynamic Step Type Builder
 * plan). No repository definition uses partials yet; these tests use sample
 * definitions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { documentHash } from "../src/canonical-json.js";
import { checkStepTypeDefinitions } from "../src/step-type-engine.js";
import { importRepositoryStepTypes } from "../src/step-type-repository.js";
import { loadApp, recordAudit } from "./support/step-type-harness.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const engineManifest = JSON.parse(read("js/step-types/engine-manifest.json"));
const SCHEMA = JSON.parse(read("catalogs/step-types/schema.json"));

function loadEngine() {
  const context = vm.createContext({ console });
  for (const file of engineManifest.scripts)
    vm.runInContext(read(file), context, { filename: file });
  return context.ATLASStepTypes;
}
const { templates, definitions, registry, conditions } = loadEngine();
const plain = (value) => JSON.parse(JSON.stringify(value));
const render = (source, data = {}, options = {}) =>
  templates.render(source, data, options);
const errorOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  return null;
};

// -----------------------------------------------------------------------------
// Partials in the template language
// -----------------------------------------------------------------------------

test("partials: {{> name}} includes a partial with the caller's values", () => {
  const partials = { name: "{{param.first}} {{param.last}}" };
  assert.equal(
    render(
      "Hello {{> name}}.",
      { param: { first: "Ada", last: "Lovelace" } },
      { partials },
    ),
    "Hello Ada Lovelace.",
  );
});

test("partials: {{> name expr}} gives the partial a new context", () => {
  const partials = { item: "[{{this.label}}#{{@number}}]" };
  assert.equal(
    render(
      '{{#each list separator=", "}}{{> item this}}{{/each}}',
      { list: [{ label: "a" }, { label: "b" }] },
      { partials },
    ),
    "[a#1], [b#2]",
  );
  // An item property reads first, then the data, as in a loop.
  assert.equal(
    render(
      "{{> pair param.one}}",
      { param: { one: { x: 1 } }, y: 2 },
      {
        partials: { pair: "{{x}}/{{y}}" },
      },
    ),
    "1/2",
  );
});

test("partials: a format-keyed partial picks the current format", () => {
  const partials = {
    test: { english: "is {{v}}", sql: "= '{{v}}'", default: "={{v}}" },
  };
  const data = { v: "A" };
  assert.equal(
    render("{{> test}}", data, { partials, format: "english" }),
    "is A",
  );
  assert.equal(
    render("{{> test}}", data, { partials, format: "sql" }),
    "= 'A'",
  );
  assert.equal(render("{{> test}}", data, { partials, format: "excel" }), "=A");
  assert.match(
    errorOf(() =>
      render("{{> only}}", data, {
        partials: { only: { english: "x" } },
        format: "python",
      }),
    ),
    /^Partial "only" has no python form/,
  );
});

test("partials: unknown names, bad names and errors inside a partial", () => {
  assert.match(
    errorOf(() => render("a {{> nope}}", {})),
    /^Unknown partial "nope" \(line 1, column 3\)/,
  );
  assert.match(
    errorOf(() => render("{{>}}", {})),
    /^\{\{>\}\} needs a partial name/,
  );
  assert.match(
    errorOf(() => render("{{> 1x}}", {})),
    /^"1x" is not a partial name/,
  );
  assert.match(
    errorOf(() =>
      render("x\n{{> broken}}", {}, { partials: { broken: "ok {{#if}}" } }),
    ),
    /^In partial "broken" \(line 1, column 4\): \{\{#if\}\} needs a value \(line 2, column 1\)/,
  );
  assert.match(
    errorOf(() =>
      render(
        "{{> strict}}",
        {},
        { partials: { strict: "{{gone}}" }, strict: true },
      ),
    ),
    /^In partial "strict" .*Unknown value "gone"/,
  );
  assert.match(
    errorOf(() => render("{{> list}}", {}, { partials: { list: ["x"] } })),
    /^Partial "list" is not a template/,
  );
});

test("partials: recursion is bounded by the depth limit", () => {
  const partials = {
    tree: '{{this.name}}{{#if this.kids}}({{#each this.kids separator=","}}{{> tree this}}{{/each}}){{/if}}',
    forever: "{{> forever}}",
  };
  const data = {
    root: {
      name: "a",
      kids: [{ name: "b" }, { name: "c", kids: [{ name: "d" }] }],
    },
  };
  assert.equal(render("{{> tree root}}", data, { partials }), "a(b,c(d))");
  assert.match(
    errorOf(() => render("{{> forever}}", {}, { partials })),
    new RegExp(`Partials are nested more than ${templates.LIMITS.depth} deep`),
  );
});

test("partials: they share the output budget and the escapes", () => {
  const big = "x".repeat(1000);
  assert.match(
    errorOf(() =>
      render(
        "{{#each list}}{{> big}}{{/each}}",
        { list: Array.from({ length: 300 }, (_, i) => i) },
        { partials: { big } },
      ),
    ),
    /Output is longer than 200000 characters/,
  );
  const escapeValue = (value) => value.replace(/</g, "&lt;");
  assert.equal(
    render(
      "<b>{{> v}}</b>",
      { v: "<i>" },
      { partials: { v: "<{{v}}>" }, escapeValue },
    ),
    "<b><&lt;i>></b>",
  );
});

test("partials: helpers render one with partial(name, value) as plain text", () => {
  const helpers = {
    both: (args, _hash, { partial }) =>
      `${partial("p", args[0])}|${partial("p")}`,
  };
  const escapeValue = (value) => value.replace(/&/g, "&amp;");
  assert.equal(
    render(
      "{{both one}}",
      { one: { v: "&1" }, v: "&2" },
      {
        helpers,
        partials: { p: "&{{v}}" },
        escapeValue,
      },
    ),
    "&amp;&amp;1|&amp;&amp;2",
  );
});

test("partials: check() reports unknown partials and references() reads contexts", () => {
  const problems = templates.check(
    '{{> known param.a}} {{> missing}} {{tree x leaf="gone"}}',
    {
      helpers: ["tree"],
      partials: ["known"],
      partialHashes: { tree: "leaf" },
      roots: ["param"],
    },
  );
  assert.deepEqual(plain(problems.map((problem) => problem.message)), [
    'Unknown partial "missing"',
    'Unknown partial "gone"',
    'Unknown value "x"',
  ]);
  assert.deepEqual(plain(templates.check("{{> anything}}")), []);
  assert.deepEqual(plain(templates.references("{{> p param.field}}")), [
    "param.field",
  ]);
});

// -----------------------------------------------------------------------------
// Schema version 2 definitions
// -----------------------------------------------------------------------------

function withPartials(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "keep_matching",
    version: 1,
    label: "Keep Matching",
    order: 46,
    status: "active",
    legacyType: "filter",
    fields: [
      {
        param: "conditions_json",
        control: "condition_group",
        label: "Conditions",
      },
    ],
    partials: {
      leaf: {
        english:
          "{{field this.sourceFile this.fieldName alias=this.sourceAlias}} {{this.operator}} {{quote this.compareValue}}",
        default:
          "{{field this.sourceFile this.fieldName alias=this.sourceAlias}}={{quote this.compareValue}}",
      },
      suffix: ".",
    },
    english: {
      default:
        'Keep rows {{conditionTree conditions leaf="leaf"}}{{> suffix}}{{#if elseStep}} Otherwise see step {{elseStep.stepNumber}}.{{/if}}',
    },
    autoNotes: {
      default: '{{conditionTree conditions leaf="leaf" style="inline"}}',
    },
    formulas: {
      shape: "filter",
      default: {
        excel: '{{conditionTree conditions leaf="leaf" style="precedence"}}',
        sql: '{{conditionTree conditions leaf="leaf" style="precedence"}}',
        python: '{{conditionTree conditions leaf="leaf" style="precedence"}}',
      },
    },
    export: {
      scriptRole: "filter",
      qtest: { section: "B", testType: "Data Validation" },
    },
    ...overrides,
  };
}

const HELPERS = ["field", "quote", "conditionTree"];
const validate = (definition, options = {}) =>
  plain(
    definitions.validate(definition, {
      schema: SCHEMA,
      helpers: HELPERS,
      ...options,
    }),
  );

test("schema 2: a definition with partials is valid", () => {
  assert.deepEqual(validate(withPartials()), { ok: true, errors: [] });
  assert.deepEqual([...definitions.SUPPORTED_SCHEMA_VERSIONS], [1, 2]);
  assert.deepEqual(engineManifest.schemaVersions, [1, 2]);
  for (const root of ["conditions", "elseStep", "ifStep"])
    assert.ok(definitions.TEMPLATE_ROOTS.includes(root), root);
});

test("schema 2: partials need schemaVersion 2", () => {
  const result = validate(withPartials({ schemaVersion: 1 }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    {
      path: "/partials",
      message: "partials need schemaVersion 2",
      code: "schema",
    },
  ]);
  // Version 2 without partials is fine; version 1 stays the default.
  const { partials, ...rest } = withPartials();
  assert.ok(partials);
  assert.equal(
    validate({
      ...rest,
      english: { default: "Keep rows." },
      autoNotes: { default: "" },
      formulas: { shape: "filter", default: { sql: "1 = 1" } },
    }).ok,
    true,
  );
});

test("schema 2: partial names and forms are checked by the schema", () => {
  const badName = validate(withPartials({ partials: { "bad-name": "x" } }));
  assert.equal(badName.ok, false);
  assert.equal(badName.errors[0].path, "/partials/bad-name");
  const badForm = validate(
    withPartials({ partials: { leaf: { notes: "x" } } }),
  );
  assert.equal(badForm.ok, false);
  assert.equal(badForm.errors[0].path, "/partials/leaf");
});

test("schema 2: every partial is parsed and every include is checked", () => {
  const definition = withPartials();
  definition.partials.leaf.default = "{{nope this.x}}";
  definition.english.default =
    '{{> missing}} {{conditionTree conditions leaf="gone"}}';
  const result = validate(definition);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => [
      error.path,
      error.message.replace(/ \(line.*$/, ""),
    ]),
    [
      ["/partials/leaf/default", 'Unknown helper "nope"'],
      ["/english/default", 'Unknown partial "missing"'],
      ["/english/default", 'Unknown partial "gone"'],
    ],
  );
  // Partials are not checked against the roots: their context varies.
  assert.equal(
    validate(
      withPartials({ partials: { leaf: "{{anything.at.all}}", suffix: "." } }),
    ).ok,
    true,
  );
});

test("engine 1.10.0: a version 2 definition is reported, not loaded", () => {
  // 1.10.0 read only schema version 1; the check is the same code.
  const older = { supportedSchemaVersions: [1] };
  const result = validate(withPartials(), older);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "unsupported_schema_version");
  assert.match(
    result.errors[0].message,
    /schema version 2 needs a newer ATLAS Align \(this one reads 1\)/,
  );
  const olderRegistry = registry.createRegistry({
    schema: SCHEMA,
    helpers: HELPERS,
    ...older,
  });
  assert.equal(olderRegistry.add(withPartials()).ok, false);
  assert.equal(olderRegistry.get?.("keep_matching") ?? null, null);
});

/** A temporary catalogs/step-types/ holding `definitions`. */
function catalogWith(definitionList) {
  const dir = mkdtempSync(path.join(tmpdir(), "atlas-step-types-v2-"));
  const catalog = pathToFileURL(`${dir}/`);
  writeFileSync(
    new URL("schema.json", catalog),
    read("catalogs/step-types/schema.json"),
  );
  writeFileSync(
    new URL("manifest.json", catalog),
    JSON.stringify({
      schemaVersion: 1,
      definitions: definitionList.map((definition) => ({
        id: definition.id,
        version: definition.version,
        file: `${definition.id}.json`,
        hash: documentHash(definition),
      })),
    }),
  );
  definitionList.forEach((definition) =>
    writeFileSync(
      new URL(`${definition.id}.json`, catalog),
      JSON.stringify(definition),
    ),
  );
  return catalog;
}

function memoryPool() {
  const rows = [];
  return {
    rows,
    query: async (text, params = []) => {
      if (/INSERT INTO atlas_step_type_definitions/i.test(text)) {
        rows.push({ type_id: params[0], version: params[1] });
        return { rows: [{ inserted: true }] };
      }
      return { rows: [] };
    },
    connect: async function connect() {
      return { query: this.query, release() {} };
    },
  };
}

test("engine 1.10.0: the server import skips a version 2 file and logs it", async () => {
  const sortRecords = JSON.parse(read("catalogs/step-types/sort_records.json"));
  const catalog = catalogWith([sortRecords, withPartials()]);
  const lines = [];
  const logger = {
    info: (line) => lines.push(line),
    error: (line) => lines.push(line),
    warn() {},
  };
  const checked = checkStepTypeDefinitions(
    SCHEMA,
    [sortRecords, withPartials()],
    {
      supportedSchemaVersions: [1],
    },
  );
  assert.deepEqual(
    checked.accepted.map((item) => item.id),
    ["sort_records"],
  );
  assert.equal(
    checked.rejected[0].errors[0].code,
    "unsupported_schema_version",
  );

  const result = await importRepositoryStepTypes(memoryPool(), {
    catalog,
    logger,
    supportedSchemaVersions: [1],
  });
  assert.deepEqual(
    result.rejected.map((entry) => entry.id),
    ["keep_matching"],
  );
  assert.equal(result.rejected[0].errors[0].code, "unsupported_schema_version");
  assert.ok(JSON.stringify(lines).includes("step_type_definition_rejected"));
  // This engine reads version 2.
  assert.deepEqual(
    checkStepTypeDefinitions(SCHEMA, [withPartials()]).rejected,
    [],
  );
});

// -----------------------------------------------------------------------------
// js/step-types/05-conditions.js
// -----------------------------------------------------------------------------

const leaf = (id, fieldName, compareValue, connector = "AND", extra = {}) => ({
  id,
  connector,
  sourceFile: "WD_Workers",
  sourceAlias: "wd",
  fieldName,
  operator: "is equal to",
  valueMode: "values",
  compareValue,
  ...extra,
});
const group = (id, connector, groupConnector, items) => ({
  id,
  conditionType: "group",
  connector,
  groupConnector,
  items,
});
const TREE = [
  leaf("a", "Status", "A", "IF"),
  leaf("b", "Type", "X"),
  group("g", "OR", "AND", [leaf("c", "Grade", "1"), leaf("d", "Band", "2")]),
];
const name = (node) => node.fieldName;

test("conditions: the engine file is listed and loaded after the registry", () => {
  const file = "js/step-types/05-conditions.js";
  assert.ok(engineManifest.scripts.includes(file));
  assert.ok(engineManifest.preview.scripts.includes(file));
  const html = read("index.html");
  assert.ok(html.indexOf("04-registry.js") < html.indexOf(file.slice(3)));
  assert.deepEqual([...conditions.STYLES], ["bullets", "inline", "precedence"]);
});

test("conditions: the three layouts keep today's structure rules", () => {
  assert.equal(
    conditions.bullets(TREE, { leaf: name }),
    "IF Status AND Type OR:\n  • Grade AND\n  • Band",
  );
  assert.equal(
    conditions.bullets(
      [
        group("g", "IF", "OR", [
          leaf("a", "A", "1"),
          group("h", "OR", "AND", [leaf("b", "B", "1"), leaf("c", "C", "1")]),
        ]),
      ],
      { leaf: name },
    ),
    "IF:\n  • A OR:\n    • B AND\n    • C",
  );
  assert.equal(
    conditions.bullets(
      [
        leaf("a", "A", "1", "IF"),
        group("g", "AND", "OR", [
          group("h", "OR", "AND", [leaf("b", "B", "1"), leaf("c", "C", "1")]),
          leaf("d", "D", "1"),
        ]),
      ],
      { leaf: name, line: (connector, text) => `${connector} <${text}>` },
    ),
    "IF <A> AND:\n  • ALL OF:\n    • B AND\n    • C OR\n  • D",
  );
  assert.equal(
    conditions.inline(TREE, { leaf: name }),
    "IF Status AND Type OR (Grade AND Band)",
  );
  assert.equal(
    conditions.precedence(TREE, { leaf: name }),
    "Status AND Type OR Grade AND Band",
  );
  const combine = (items, connector) => {
    const list = items.filter(Boolean);
    return list.length > 1 ? `${connector}(${list.join(", ")})` : list[0] || "";
  };
  assert.equal(
    conditions.precedence(TREE, { leaf: name, combine }),
    "OR(AND(Status, Type), AND(Grade, Band))",
  );
  // A group of one reads as that item; an empty tree is blank.
  assert.equal(
    conditions.inline([group("g", "IF", "OR", [leaf("a", "Solo", "1")])], {
      leaf: name,
    }),
    "IF Solo",
  );
  assert.equal(conditions.precedence([], { leaf: name }), "");
});

test("conditions: parse reads conditions_json, then legacy conditions", () => {
  const json = { params: { conditions_json: JSON.stringify(TREE) } };
  assert.deepEqual(plain(conditions.parse(json)), TREE);
  const legacy = {
    source: "WD_Workers",
    params: { conditions_json: "not json" },
    conditions: [
      { field: "Status", value: "A" },
      { field: "Type", value: "X", connector: "OR" },
    ],
  };
  const parsed = conditions.parse(legacy, {
    uid: (prefix) => `${prefix}_1`,
    sourceAliasFor: () => "wd",
  });
  assert.deepEqual(
    plain(parsed).map((item) => [
      item.id,
      item.connector,
      item.sourceAlias,
      item.fieldName,
      item.compareValue,
    ]),
    [
      ["cond_1", "IF", "wd", "Status", "A"],
      ["cond_1", "OR", "wd", "Type", "X"],
    ],
  );
  assert.deepEqual(plain(conditions.parse({})), []);
});

test("conditions: normalizeLeaf keeps the run parameter and value list rules", () => {
  assert.deepEqual(
    plain(
      conditions.normalizeLeaf({
        valueMode: "parameter",
        operator: "is less than",
      }),
    ),
    {
      valueMode: "values",
      operator: "is less than",
      compareParameter: "runDate",
      compareValue: "run date",
    },
  );
  assert.equal(
    conditions.normalizeLeaf({ valueMode: "parameter", operator: "contains" })
      .compareValue,
    "",
  );
  assert.deepEqual(
    plain(
      conditions.normalizeLeaf({
        valueMode: "values",
        compareValue: " a \n\nb ",
      }),
    ),
    { valueMode: "values", compareValue: "a\nb", compareValues: ["a", "b"] },
  );
  const tree = conditions.normalizedTree({
    params: {
      conditions_json: JSON.stringify([
        group("g", "IF", "OR", [leaf("a", "A", "x\ny")]),
      ]),
    },
  });
  assert.deepEqual(plain(tree[0].items[0].compareValues), ["x", "y"]);
});

// -----------------------------------------------------------------------------
// The runtime: conditionTree and the condition roots
// -----------------------------------------------------------------------------

const SOURCES = [
  {
    id: "source_wd",
    name: "WD_Workers",
    sourceFile: "WD_Workers",
    alias: "wd",
    color: "#b3f5ff",
  },
];
const reference = {
  id: "s1",
  step_type: "reference_source",
  params: { source_file: "WD_Workers", source_alias: "wd" },
};

function audit(steps) {
  return {
    schemaVersion: 1,
    sourceKind: "repo",
    id: "partials-sample",
    name: "Partials sample",
    purpose: "Sample step types with partials.",
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

const READS_IF = {
  schemaVersion: 2,
  id: "after_keep",
  version: 1,
  label: "After Keep",
  order: 47,
  status: "active",
  legacyType: "transform",
  fields: [{ param: "parent_if_step_id", control: "hidden" }],
  partials: { leaf: "{{this.fieldName}}" },
  english: {
    default:
      'After step {{ifStep.stepNumber}} ({{ifStep.step_type}}): {{conditionTree ifStep.conditions leaf="leaf" style="inline"}}.',
  },
  formulas: { shape: "frame", default: { sql: "-- none" } },
  export: {
    scriptRole: "column",
    qtest: { section: "D", testType: "Data Validation" },
  },
};

async function appWith(definitionList) {
  const context = await loadApp();
  context.__schema = SCHEMA;
  context.__definitions = definitionList;
  const results = vm.runInContext(
    `(() => {
      const registry = ATLASStepTypes.registry.createRegistry({
        schema: __schema,
        helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
        blocks: [...ATLASStepTypeRuntime.BLOCK_NAMES],
        handlers: [...ATLASStepTypeRuntime.HANDLER_NAMES],
      });
      const results = [...ATLASStepTypes.bundled.definitions, ...__definitions]
        .map((definition) => registry.add(definition));
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

test("runtime: conditionTree renders each condition with the leaf partial", async () => {
  const context = await appWith([withPartials()]);
  const recorded = await recordAudit(
    context,
    audit([
      reference,
      {
        id: "s2",
        step_type: "keep_matching",
        params: { conditions_json: JSON.stringify(TREE) },
      },
    ]),
  );
  const step = recorded.steps.find((item) => item.id === "s2");
  const status = 'file "wd" column "Status" is equal to "A"';
  const type = 'file "wd" column "Type" is equal to "X"';
  const grade = 'file "wd" column "Grade" is equal to "1"';
  const band = 'file "wd" column "Band" is equal to "2"';
  assert.equal(
    step.english,
    `Keep rows IF ${status} AND ${type} OR:\n  • ${grade} AND\n  • ${band}.`,
  );
  assert.equal(
    step.autoNotes,
    `IF ${status} AND ${type} OR (${grade} AND ${band})`,
  );
  assert.equal(
    step.formulas.excel,
    '=OR(AND([@[Status]]="A", [@[Type]]="X"), AND([@[Grade]]="1", [@[Band]]="2"))',
  );
  assert.equal(
    step.formulas.sql,
    "WHERE ([Status]='A' AND [Type]='X') OR ([Grade]='1' AND [Band]='2')",
  );
  assert.match(
    step.formulas.python,
    /^mask = \(df\["Status"\]="A" & df\["Type"\]="X"\) \| \(/,
  );
});

test("runtime: elseStep and ifStep reach one step away", async () => {
  const context = await appWith([withPartials(), READS_IF]);
  const recorded = await recordAudit(
    context,
    audit([
      reference,
      {
        id: "s2",
        step_type: "keep_matching",
        params: { conditions_json: JSON.stringify(TREE) },
      },
      {
        id: "s3",
        step_type: "else",
        params: { parent_if_step_id: "s2" },
      },
      {
        id: "s4",
        step_type: "after_keep",
        params: { parent_if_step_id: "s2" },
      },
    ]),
  );
  const keep = recorded.steps.find((item) => item.id === "s2");
  assert.match(keep.english, / Otherwise see step 3\.$/);
  const after = recorded.steps.find((item) => item.id === "s4");
  assert.equal(
    after.english,
    "After step 2 (keep_matching): IF Status AND Type OR (Grade AND Band).",
  );
});
