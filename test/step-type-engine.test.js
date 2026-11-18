/**
 * Step type engine (js/step-types/): template language, schema validator,
 * definition checks, migrations, registry and repository loading.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { buildManifest } from "../tools/build-step-type-manifest.mjs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const engineManifest = JSON.parse(read("js/step-types/engine-manifest.json"));
const schema = JSON.parse(read("catalogs/step-types/schema.json"));

function loadEngine() {
  const context = vm.createContext({ console });
  for (const file of engineManifest.scripts)
    vm.runInContext(read(file), context, { filename: file });
  return context.ATLASStepTypes;
}

const engine = loadEngine();
const { templates, definitions, migrations, registry } = engine;
const plain = (value) => JSON.parse(JSON.stringify(value));
const render = (source, data = {}, options = {}) =>
  templates.render(source, data, options);

/** A small, valid definition that tests extend. */
function formatField(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "format_field",
    version: 1,
    label: "Format Field",
    order: 50,
    status: "active",
    legacyType: "transform",
    subtypes: {
      param: "format",
      label: "Format",
      control: "cards",
      options: [
        { value: "text", label: "Text" },
        { value: "number", label: "Number" },
      ],
    },
    fields: [
      { param: "source_file", control: "source_picker", label: "Source" },
      {
        param: "field_name",
        control: "field_picker",
        label: "Field",
        sourceParam: "source_file",
        required: true,
      },
    ],
    english: { default: "Format {{param.field_name}} as {{param.format}}." },
    formulas: {
      shape: "assignment",
      target: "{{param.field_name}}",
      default: { excel: "{{param.field_name}}" },
      bySubtype: {
        text: { sql: "CAST([{{param.field_name}}] AS NVARCHAR(4000))" },
        number: { sql: "TRY_CAST([{{param.field_name}}] AS DECIMAL(38, 10))" },
      },
    },
    export: {
      scriptRole: "column",
      qtest: { section: "D", testType: "Data Validation" },
    },
    validation: [
      {
        when: "always",
        require: "field_name",
        severity: "critical",
        message: "Choose the field.",
      },
    ],
    ...overrides,
  };
}

const validate = (definition, options = {}) =>
  plain(definitions.validate(definition, { schema, ...options }));

// -----------------------------------------------------------------------------
// Template language
// -----------------------------------------------------------------------------

test("templates: values, nested paths and missing values", () => {
  const data = {
    param: { field: "Pernr", nested: { name: "x" } },
    stepNumber: 3,
  };
  assert.equal(
    render("Step {{stepNumber}}: {{param.field}}", data),
    "Step 3: Pernr",
  );
  assert.equal(render("{{param.nested.name}}", data), "x");
  assert.equal(render("[{{param.missing}}][{{nothing.at.all}}]", data), "[][]");
  assert.equal(
    render("{{param.nested}}", data),
    "",
    "objects print as nothing",
  );
  assert.equal(render("{{list}}", { list: ["a", "", "b"] }), "a, b");
  assert.equal(render("{{flag}} {{n}}", { flag: false, n: 0 }), "false 0");
});

test("templates: literals, helpers, options and sub-expressions", () => {
  assert.equal(render('{{"quoted \\"text\\""}}'), 'quoted "text"');
  assert.equal(render("{{upper (concat 'a' \"b\" 1)}}"), "AB1");
  assert.equal(
    render("{{default param.a param.b 'none'}}", { param: { b: "B" } }),
    "B",
  );
  assert.equal(
    render("{{join list separator=' | '}}", { list: [1, 2] }),
    "1 | 2",
  );
  assert.equal(render("{{replace 'a-b-c' '-' '+'}}"), "a+b+c");
  assert.equal(render("{{count list}}", { list: [1, 2, 3] }), "3");
  assert.equal(
    render(
      "{{shout param.x punctuation='!'}}",
      { param: { x: "hi" } },
      {
        helpers: {
          shout: (args, hash, info) =>
            `${args[0].toUpperCase()}${hash.punctuation}${info.format}`,
        },
        format: "sql",
      },
    ),
    "HI!sql",
  );
  assert.equal(
    render(
      "{{formatSuffix}}",
      {},
      { helpers: { formatSuffix: () => " (suffix)" } },
    ),
    " (suffix)",
    "a lone helper name calls the helper",
  );
});

test("templates: if, else if, else and unless", () => {
  const source =
    "{{#if (eq param.mode 'a')}}A{{else if (in param.mode 'b' 'c')}}BC{{else}}other{{/if}}";
  assert.equal(render(source, { param: { mode: "a" } }), "A");
  assert.equal(render(source, { param: { mode: "c" } }), "BC");
  assert.equal(render(source, { param: { mode: "z" } }), "other");
  assert.equal(
    render("{{#unless param.x}}empty{{else}}set{{/unless}}", {
      param: { x: " " },
    }),
    "empty",
  );
  assert.equal(
    render("{{#unless param.x}}empty{{else}}set{{/unless}}", {
      param: { x: "1" },
    }),
    "set",
  );
  assert.equal(
    render("{{#if (and a (or b c) (not d))}}yes{{/if}}", { a: 1, c: "x" }),
    "yes",
  );
  assert.equal(
    render("{{#if (gt n 2)}}big{{/if}}{{#if (lt n 2)}}small{{/if}}", { n: 5 }),
    "big",
  );
  assert.equal(
    render("{{#if list}}has{{else}}none{{/if}}", { list: [] }),
    "none",
  );
  assert.equal(
    render("{{#if zero}}0 is truthy{{/if}}", { zero: 0 }),
    "0 is truthy",
  );
});

test("templates: each with separators, loop variables and empty lists", () => {
  const keys = [{ field: "A" }, { field: "B" }, { field: "C" }];
  const sentence =
    "{{#each keys separator=', ' lastSeparator=', and ' pairSeparator=' and '}}{{field}}{{/each}}";
  assert.equal(render(sentence, { keys }), "A, B, and C");
  assert.equal(render(sentence, { keys: keys.slice(0, 2) }), "A and B");
  assert.equal(render(sentence, { keys: keys.slice(0, 1) }), "A");
  assert.equal(
    render(
      "{{#each keys}}{{@number}}/{{@count}}:{{this.field}}{{#if @first}}^{{/if}}{{#if @last}}${{/if}} {{/each}}",
      { keys },
    ),
    "1/3:A^ 2/3:B 3/3:C$ ",
  );
  assert.equal(
    render("{{#each list}}{{this}}{{@index}}{{/each}}", { list: ["x", "y"] }),
    "x0y1",
  );
  assert.equal(
    render("{{#each keys}}{{@root.prefix}}{{field}}{{/each}}", {
      keys,
      prefix: "#",
    }),
    "#A#B#C",
  );
  assert.equal(
    render("{{#each keys}}{{label}}{{/each}}", { keys: [{}], label: "root" }),
    "root",
    "a name the item lacks falls back to the root",
  );
  assert.equal(
    render("{{#each missing}}x{{else}}nothing{{/each}}", {}),
    "nothing",
  );
  assert.equal(render("{{#each text}}x{{/each}}", { text: "not a list" }), "");
});

test("templates: switch with multi-value cases and default", () => {
  const source = `{{#switch subtype}}
    {{#case "text" "string"}}T{{/case}}
    {{#case 2}}two{{/case}}
    {{#default}}D{{/default}}
  {{/switch}}`;
  assert.equal(render(source, { subtype: "string" }), "T");
  assert.equal(
    render(source, { subtype: "2" }),
    "two",
    "values compare as text",
  );
  assert.equal(render(source, { subtype: "other" }), "D");
});

test("templates: comments, whitespace control and escaped braces", () => {
  assert.equal(render("a{{! ignored }}b"), "ab");
  assert.equal(render("a   {{~ 'b' ~}}   c"), "abc");
  assert.equal(
    render("{{#each list~}}\n  {{this}}\n{{~/each}}", { list: [1, 2] }),
    "12",
  );
  assert.equal(render("\\{{not a tag}}"), "{{not a tag}}");
});

test("templates: syntax errors name the problem and its position", () => {
  const cases = [
    ["{{param.x", /Unclosed \{\{/],
    ["{{#if a}}x", /\{\{#if\}\} is never closed/],
    ["{{#if a}}x{{/each}}", /Expected \{\{\/if\}\} but found \{\{\/each\}\}/],
    ["x{{/if}}", /has no matching opening block/],
    ["{{#loop a}}{{/loop}}", /Unknown block/],
    ["{{#if}}{{/if}}", /needs a value/],
    ["{{#if a}}{{else}}{{else}}{{/if}}", /\{\{else\}\} after \{\{else\}\}/],
    ["{{else}}", /must be inside/],
    ["{{#each a}}{{else if b}}{{/each}}", /only allowed inside \{\{#if\}\}/],
    ["{{#switch a}}text{{/switch}}", /Only \{\{#case\}\}/],
    ["{{#case 'a'}}{{/case}}", /must be inside \{\{#switch\}\}/],
    [
      "{{#switch a}}{{#default}}{{/default}}{{#default}}{{/default}}{{/switch}}",
      /more than one/,
    ],
    ["{{#each a b}}{{/each}}", /takes one list/],
    ["{{#each a limit=2}}{{/each}}", /has no option "limit"/],
    ["{{constructor}}", /not allowed/],
    ["{{param.__proto__}}", /not allowed/],
    ["{{@weird}}", /Unknown variable/],
    ["{{'open}}", /Unclosed string/],
    ["{{lower (}}", /Unclosed \(/],
    ["{{lower x=1 y}}", /must come after/],
    ["{{}}", /Empty/],
  ];
  for (const [source, pattern] of cases)
    assert.throws(() => templates.parse(source), pattern, source);
  try {
    templates.parse("line one\n  {{#if a}}");
    assert.fail("expected an error");
  } catch (error) {
    assert.equal(error.name, "TemplateError");
    assert.equal(error.line, 2);
    assert.equal(error.column, 3);
  }
});

test("templates: unknown helpers fail at render; strict mode flags missing values", () => {
  assert.throws(() => render("{{nope 1}}"), /Unknown helper "nope"/);
  assert.equal(render("{{missing}}"), "");
  assert.throws(
    () => render("{{missing}}", {}, { strict: true }),
    /Unknown value "missing"/,
  );
});

test("templates: limits stop runaway output and loops", () => {
  assert.throws(
    () => templates.parse("x".repeat(templates.LIMITS.templateLength + 1)),
    /longer than/,
  );
  const big = Array.from(
    { length: templates.LIMITS.iterations + 1 },
    (_, index) => index,
  );
  assert.throws(
    () => render("{{#each list}}.{{/each}}", { list: big }),
    /Loops ran more than/,
  );
  const nested = `${"{{#if a}}".repeat(40)}${"{{/if}}".repeat(40)}`;
  assert.throws(() => templates.parse(nested), /nested too deeply/);
});

test("templates: lookups read own properties only", () => {
  const data = Object.create({ inherited: "leak" });
  data.param = {};
  assert.equal(
    render("{{inherited}}{{param.toString}}{{param.hasOwnProperty}}", data),
    "",
  );
});

test("templates: check() reports syntax, unknown helpers and unknown roots", () => {
  assert.deepEqual(
    plain(
      templates.check("Format {{param.x}} {{ref param.x}}", {
        helpers: ["ref"],
        roots: ["param"],
      }),
    ),
    [],
  );
  const problems = plain(
    templates.check(
      "{{ref param.x}} {{other.y}} {{#each param.list}}{{field}}{{/each}} {{@index}}",
      { roots: ["param"] },
    ),
  ).map((problem) => problem.message);
  assert.deepEqual(problems, [
    'Unknown helper "ref"',
    'Unknown value "other"',
    "@index is only available inside {{#each}}",
  ]);
  const [syntax] = plain(templates.check("{{#if a}}"));
  assert.match(syntax.message, /never closed/);
  assert.equal(syntax.line, 1);
});

test("templates: references() lists every value path a template reads", () => {
  assert.deepEqual(
    plain(
      templates.references(
        "{{param.a}} {{#if (eq subtype 'x')}}{{@root.param.b}}{{/if}} {{#each param.list}}{{field}}{{/each}}",
      ),
    ).sort(),
    ["field", "param.a", "param.b", "param.list", "subtype"],
  );
});

// -----------------------------------------------------------------------------
// Schema validator
// -----------------------------------------------------------------------------

test("schema: the definition schema uses only supported keywords", () => {
  assert.doesNotThrow(() => engine.schema.assertSupported(schema));
  assert.throws(
    () => engine.schema.assertSupported({ type: "object", if: {} }),
    /Schema keyword "if" at # is not supported/,
  );
  assert.throws(
    () => engine.schema.validate({ $ref: "#/$defs/missing" }, 1),
    /cannot be resolved/,
  );
});

test("schema: errors give a JSON pointer and a readable message", () => {
  const check = (value) => plain(engine.schema.validate(schema, value));
  assert.deepEqual(check(formatField()), []);
  const errors = check(
    formatField({
      id: "Format Field",
      version: 0,
      status: "maybe",
      extra: true,
      fields: [{ param: "x", control: "slider" }, { control: "text" }],
    }),
  );
  assert.deepEqual(errors, [
    { path: "/id", message: "must match ^[a-z][a-z0-9_]*$" },
    { path: "/version", message: "must be at least 1" },
    { path: "/status", message: 'must be one of "active", "legacy"' },
    { path: "/fields/0/control", message: errors[3].message },
    { path: "/fields/1/param", message: "is required" },
    { path: "/extra", message: "is not a known property" },
  ]);
  assert.match(errors[3].message, /^must be one of "source_picker"/);
  assert.deepEqual(check({ ...formatField(), english: {} }), [
    { path: "/english", message: "must have at least 1 entry" },
  ]);
  assert.deepEqual(check({ ...formatField(), subtypes: "text" }), [
    { path: "/subtypes", message: "must be null or a subtype list" },
  ]);
  assert.deepEqual(check({ ...formatField(), schemaVersion: 2 }), [
    { path: "/schemaVersion", message: "must be 1" },
  ]);
  const { fields, ...withoutFields } = formatField();
  assert.ok(fields.length);
  assert.deepEqual(check(withoutFields), [
    { path: "/fields", message: "is required" },
  ]);
});

test("schema: generic keywords behave like JSON Schema", () => {
  const check = (keywords, value) =>
    plain(engine.schema.validate(keywords, value));
  assert.deepEqual(check({ type: "array", uniqueItems: true }, [1, 1]), [
    { path: "/1", message: "is a duplicate" },
  ]);
  assert.deepEqual(check({ type: "string", minLength: 1 }, ""), [
    { path: "/", message: "must not be empty" },
  ]);
  assert.deepEqual(check({ type: "string", maxLength: 2 }, "abc"), [
    { path: "/", message: "must be at most 2 characters" },
  ]);
  assert.deepEqual(check({ type: "number", maximum: 2 }, 3), [
    { path: "/", message: "must be at most 2" },
  ]);
  assert.deepEqual(check({ type: "integer" }, 1.5), [
    { path: "/", message: "must be integer" },
  ]);
  assert.deepEqual(check({ type: "number" }, 2), []);
  assert.deepEqual(check({ type: "array", maxItems: 1 }, [1, 2]), [
    { path: "/", message: "must have at most 1 item(s)" },
  ]);
  assert.deepEqual(
    check({ oneOf: [{ type: "string" }, { type: "string" }] }, "x"),
    [{ path: "/", message: "matches more than one allowed shape" }],
  );
  assert.deepEqual(check({ not: { const: 1 } }, 1), [
    { path: "/", message: "is not allowed here" },
  ]);
  assert.deepEqual(check({ propertyNames: { pattern: "^a" } }, { b: 1 }), [
    { path: "/b", message: "must match ^a" },
  ]);
  assert.deepEqual(
    check({ properties: { "a/b": { type: "string" } } }, { "a/b": 1 }),
    [{ path: "/a~1b", message: "must be string" }],
  );
});

// -----------------------------------------------------------------------------
// Definitions
// -----------------------------------------------------------------------------

test("definitions: a valid definition passes", () => {
  assert.deepEqual(validate(formatField()), { ok: true, errors: [] });
});

test("definitions: newer schema versions are reported, not loaded", () => {
  const result = validate(formatField({ schemaVersion: 2 }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "unsupported_schema_version");
  assert.match(result.errors[0].message, /needs a newer ATLAS Align/);
});

test("definitions: cross-reference checks catch what the schema cannot", () => {
  const definition = formatField({
    subtypes: {
      param: "format",
      default: "date",
      hidden: ["gone"],
      options: [
        {
          value: "text",
          label: "Text",
          fields: [{ param: "field_name", control: "text" }],
        },
        { value: "text", label: "Text again" },
      ],
    },
    fields: [
      { param: "source_file", control: "source_picker" },
      { param: "field_name", control: "field_picker", sourceParam: "nowhere" },
      {
        param: "field_name",
        control: "text",
        visibleWhen: { param: "ghost", equals: "x" },
      },
      { param: "pick", control: "choice" },
      { param: "widget", control: "block" },
      { param: "count", control: "whole_number", min: 5, max: 1 },
      {
        param: "shown",
        control: "text",
        enabledWhen: { param: "pick", equals: "a", blank: true },
      },
    ],
    english: { bySubtype: { text: "x", other: "y" } },
    formulas: { shape: "expression", bySubtype: { nope: { sql: "1" } } },
    validation: [
      { require: "absent", severity: "warning", message: "m" },
      { severity: "warning", message: "no require" },
    ],
    export: {
      scriptRole: "column",
      rules: [
        { when: { param: "ghost2", notBlank: true }, scriptRole: "filter" },
      ],
    },
    migrations: [
      { op: "default", param: "format" },
      { op: "default", param: "format", value: "a", template: "b" },
      { op: "rename", from: "a" },
      { op: "setStepType", to: "format_field" },
      { op: "handler", name: "unknown_handler" },
    ],
    aliases: { step_type: ["format_field"] },
  });
  const messages = validate(definition, { handlers: ["known"] }).errors.map(
    (error) => `${error.path} ${error.message}`,
  );
  assert.deepEqual(messages, [
    '/subtypes/options/1/value "text" is listed twice',
    '/subtypes/default "date" is not one of the options',
    '/subtypes/hidden/0 "gone" is not one of the options',
    '/fields/2/param "field_name" is used by two fields',
    "/fields/3 a choice field needs options or optionsFrom",
    "/fields/4/block a block field needs a block name",
    "/fields/5/min min is larger than max",
    '/subtypes/options/0/fields "field_name" is already a base field',
    '/fields/1/sourceParam "nowhere" is not a field of this step type',
    '/fields/2/visibleWhen "ghost" is not a field of this step type',
    "/fields/6/enabledWhen needs exactly one of equals, notEquals, in, blank, notBlank or positiveWholeNumber",
    '/validation/0/require "absent" is not a field of this step type',
    "/validation/1 a rule needs require, check or builtIn",
    '/export/rules/0/when "ghost2" is not a field of this step type',
    '/english/bySubtype/other "other" is not a subtype',
    '/formulas/bySubtype/nope "nope" is not a subtype',
    "/migrations/0 needs exactly one of value, valueFrom or template",
    "/migrations/1 needs exactly one of value, valueFrom or template",
    "/migrations/2/to is required",
    "/migrations/3/to points at this same step type",
    '/migrations/4/name unknown migration handler "unknown_handler"',
    "/aliases/step_type lists the step type's own id",
  ]);
});

test("definitions: block names are checked when the caller lists them", () => {
  const definition = formatField({
    fields: [
      ...formatField().fields,
      { param: "tree", control: "block", block: "condition_tree" },
    ],
  });
  assert.equal(validate(definition).ok, true);
  assert.deepEqual(
    validate(definition, { blocks: ["math"] }).errors.map(
      (error) => error.message,
    ),
    ['unknown block "condition_tree"'],
  );
});

test("definitions: every template is parsed and checked against known helpers", () => {
  const definition = formatField({
    english: {
      default:
        "Format {{tableColumn param.source_file param.field_name}} as {{#if}}",
    },
    formulas: {
      shape: "assignment",
      default: { sql: "{{ref param.field_name}} {{unknown.root}}" },
    },
    autoNotes: { default: "{{#each param.list}}{{this}}{{/each}}" },
  });
  const errors = validate(definition, { helpers: ["ref"] }).errors;
  assert.deepEqual(
    errors.map((error) => [
      error.path,
      error.code,
      error.message.replace(/ \(line.*$/, ""),
    ]),
    [
      ["/english/default", "template", "{{#if}} needs a value"],
      ["/formulas/default/sql", "template", 'Unknown value "unknown"'],
    ],
  );
  assert.equal(errors[0].line, 1);
  assert.ok(errors[0].column > 1);
  assert.deepEqual(
    validate(
      formatField({ english: { default: "{{tableColumn param.a}}" } }),
    ).errors.map((error) => error.message.replace(/ \(line.*$/, "")),
    ['Unknown helper "tableColumn"'],
  );
});

test("definitions: English needs a default or one template per subtype", () => {
  const perSubtype = formatField({
    english: { bySubtype: { text: "T", number: "N" } },
  });
  assert.equal(validate(perSubtype).ok, true);
  const missing = formatField({ english: { bySubtype: { text: "T" } } });
  assert.deepEqual(
    validate(missing).errors.map((error) => error.message),
    ['no English for subtype "number" and no default'],
  );
});

test("definitions: conditions match params and step fields", () => {
  const step = { source: "sap.a", params: { mode: "b", empty: "  ", n: 2 } };
  const cases = [
    [{ param: "mode", equals: "b" }, true],
    [{ param: "mode", notEquals: "b" }, false],
    [{ param: "mode", in: ["a", "b"] }, true],
    [{ param: "n", equals: "2" }, true],
    [{ param: "empty", blank: true }, true],
    [{ param: "missing", blank: true }, true],
    [{ param: "mode", notBlank: true }, true],
    [{ stepField: "source", equals: "sap.a" }, true],
    [
      {
        all: [
          { param: "mode", equals: "b" },
          { param: "n", equals: 3 },
        ],
      },
      false,
    ],
    [
      {
        any: [
          { param: "mode", equals: "x" },
          { param: "n", equals: 2 },
        ],
      },
      true,
    ],
    [{ not: { param: "mode", equals: "b" } }, false],
    ["always", true],
    [undefined, true],
  ];
  for (const [condition, expected] of cases)
    assert.equal(
      definitions.matches(condition, step),
      expected,
      JSON.stringify(condition),
    );
});

test("definitions: accessors pick subtype templates, formulas, fields and export", () => {
  const definition = formatField({
    english: { default: "default", bySubtype: { number: "number english" } },
    subtypes: {
      ...formatField().subtypes,
      default: "number",
      options: [
        {
          value: "text",
          label: "Text",
          export: { qtest: { testType: "Text Check" } },
        },
        {
          value: "number",
          label: "Number",
          fields: [{ param: "decimals", control: "whole_number" }],
        },
      ],
    },
    export: {
      scriptRole: "column",
      qtest: { section: "D", testType: "Data Validation" },
      rules: [
        { when: { param: "filter_only", equals: "yes" }, scriptRole: "filter" },
      ],
    },
  });
  assert.equal(definitions.subtypeOf(definition, { params: {} }), "number");
  assert.equal(
    definitions.subtypeOf(definition, { params: { format: "text" } }),
    "text",
  );
  assert.equal(
    definitions.template(definition, "english", "number"),
    "number english",
  );
  assert.equal(definitions.template(definition, "english", "text"), "default");
  assert.equal(definitions.template(definition, "autoNotes", "text"), null);
  assert.deepEqual(plain(definitions.formulas(definition, "text")), {
    excel: "{{param.field_name}}",
    sql: "CAST([{{param.field_name}}] AS NVARCHAR(4000))",
  });
  assert.deepEqual(
    plain(definitions.fields(definition, "number")).map((field) => field.param),
    ["source_file", "field_name", "decimals"],
  );
  assert.deepEqual(
    plain(definitions.exportFor(definition, { params: { format: "text" } })),
    {
      scriptRole: "column",
      qtest: { section: "D", testType: "Text Check" },
    },
  );
  assert.equal(
    definitions.exportFor(definition, {
      params: { format: "number", filter_only: "yes" },
    }).scriptRole,
    "filter",
  );
  assert.deepEqual(
    plain(definitions.templates(definition)).map((entry) => entry.path),
    [
      "/english/default",
      "/english/bySubtype/number",
      "/formulas/target",
      "/formulas/default/excel",
      "/formulas/bySubtype/text/sql",
      "/formulas/bySubtype/number/sql",
    ],
  );
});

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

function joinDefinition(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "join",
    version: 1,
    label: "Join / Union Sources",
    order: 40,
    status: "active",
    legacyType: "join",
    aliases: { type: ["join"] },
    subtypes: {
      param: "join_type",
      options: [
        { value: "INNER JOIN", label: "Inner" },
        { value: "UNION", label: "Union" },
      ],
    },
    fields: [
      { param: "left_source", control: "source_picker" },
      { param: "right_source", control: "source_picker" },
    ],
    english: {
      default: "Join {{param.left_source}} to {{param.right_source}}.",
    },
    formulas: { shape: "frame" },
    export: {
      scriptRole: "join",
      rules: [
        { when: { param: "join_type", equals: "UNION" }, scriptRole: "union" },
      ],
    },
    migrations: [{ op: "default", param: "join_type", value: "INNER JOIN" }],
    ...overrides,
  };
}

function unionSources() {
  return {
    schemaVersion: 1,
    id: "union_sources",
    version: 1,
    label: "Union Sources",
    status: "legacy",
    legacyType: "join",
    fields: [],
    english: { default: "Union." },
    formulas: { shape: "none" },
    export: { scriptRole: "union" },
    migrations: [
      { op: "rename", from: "union_left_source", to: "left_source" },
      { op: "rename", from: "union_right_source", to: "right_source" },
      {
        op: "default",
        param: "output_source",
        valueFrom: ["param.output_source", "step.source"],
      },
      { op: "set", param: "join_type", value: "UNION" },
      { op: "set", param: "left_field", value: "" },
      { op: "remove", param: "join_keys_json" },
      { op: "setStepType", to: "join" },
    ],
  };
}

test("registry: adds, versions, lists and resolves aliases", () => {
  const types = registry.createRegistry({ schema });
  assert.equal(types.add(formatField()).ok, true);
  assert.equal(
    types.add(formatField({ version: 2, label: "Format Field v2" })).ok,
    true,
  );
  assert.equal(types.add(joinDefinition()).ok, true);
  assert.equal(types.add(unionSources()).ok, true);
  assert.equal(types.size, 3);
  assert.deepEqual(plain(types.versions("format_field")), [1, 2]);
  assert.equal(types.get("format_field").label, "Format Field v2");
  assert.equal(types.get("format_field", 1).label, "Format Field");
  assert.equal(types.get("format_field", 9), null);
  assert.equal(types.resolve("format_field", "", 1).version, 1);
  assert.equal(types.resolve("", "join").id, "join", "legacy type alias");
  assert.equal(
    types.resolve("", "format_field").id,
    "format_field",
    "legacy type that is an id",
  );
  assert.equal(types.resolve("nothing"), null);
  assert.equal(types.resolve(""), null);
  assert.deepEqual(
    plain(types.list()).map((definition) => definition.id),
    ["join", "format_field"],
  );
  assert.deepEqual(
    plain(types.list({ includeLegacy: true })).map(
      (definition) => definition.id,
    ),
    ["join", "format_field", "union_sources"],
    "types without an order sort last",
  );
  assert.ok(
    Object.isFrozen(types.get("join").fields),
    "stored definitions are immutable",
  );
});

test("registry: same version with different content is rejected, never overwritten", () => {
  const types = registry.createRegistry({ schema });
  types.add(formatField());
  assert.equal(
    types.add(formatField()).ok,
    true,
    "identical content is accepted again",
  );
  const changed = types.add(formatField({ label: "Changed" }));
  assert.equal(changed.ok, false);
  assert.equal(changed.errors[0].code, "version_conflict");
  assert.equal(types.get("format_field").label, "Format Field");
  assert.deepEqual(
    plain(types.rejected()).map((entry) => [
      entry.id,
      entry.version,
      entry.errors[0].code,
    ]),
    [["format_field", 1, "version_conflict"]],
  );
});

test("registry: invalid definitions and alias collisions are rejected with reasons", () => {
  const types = registry.createRegistry({ schema });
  types.add(joinDefinition());
  const invalid = types.add(
    { ...formatField(), id: "Bad" },
    { origin: "builder" },
  );
  assert.equal(invalid.ok, false);
  const clash = types.add(
    formatField({ aliases: { type: ["join"], step_type: ["join"] } }),
  );
  assert.deepEqual(
    plain(clash.errors).map((error) => error.message),
    [
      'step_type alias "join" is the id of another step type',
      'type alias "join" already belongs to "join"',
    ],
  );
  const newer = types.add(formatField({ schemaVersion: 7 }));
  assert.equal(newer.errors[0].code, "unsupported_schema_version");
  assert.deepEqual(
    plain(types.rejected()).map((entry) => [entry.id, entry.origin]),
    [
      ["Bad", "builder"],
      ["format_field", "repository"],
      ["format_field", "repository"],
    ],
  );
  assert.equal(types.size, 1);
  assert.throws(
    () => registry.createRegistry({}),
    /needs the definition schema/,
  );
});

test("registry: loads repository definitions and reports the ones it cannot use", async () => {
  const files = {
    "schema.json": schema,
    "manifest.json": {
      schemaVersion: 1,
      definitions: [
        { id: "format_field", version: 1, file: "format_field.json" },
        { id: "join", version: 1, file: "join.json" },
        { id: "missing", version: 1, file: "missing.json" },
        { id: "evil", version: 1, file: "../secrets.json" },
        { id: "union_sources", version: 1, file: "union_sources.json" },
      ],
    },
    "format_field.json": formatField(),
    "join.json": joinDefinition({ version: 2 }),
    "union_sources.json": { ...unionSources(), id: "Union" },
  };
  const requested = [];
  const fetch = async (url) => {
    requested.push(url);
    const name = url.replace("./catalogs/step-types/", "");
    return files[name]
      ? { ok: true, status: 200, json: async () => plain(files[name]) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  const types = await registry.loadFromRepository({ fetch });
  assert.deepEqual(
    plain(types.list()).map((definition) => definition.id),
    ["format_field"],
  );
  assert.deepEqual(
    plain(types.rejected()).map((entry) => [entry.id, entry.errors[0].code]),
    [
      ["join", "manifest_mismatch"],
      ["missing", "load"],
      ["evil", "load"],
      ["union_sources", "manifest_mismatch"],
    ],
  );
  assert.ok(
    !requested.some((url) => url.includes("..")),
    "never fetches outside the folder",
  );
  await assert.rejects(
    registry.loadFromRepository({
      fetch: async () => ({ ok: false, status: 500 }),
    }),
    /returned HTTP 500/,
  );
});

// -----------------------------------------------------------------------------
// Migrations
// -----------------------------------------------------------------------------

function migrationRegistry() {
  const types = registry.createRegistry({ schema, helpers: ["alias"] });
  types.add(
    formatField({
      aliases: { step_type: ["format"], type: ["transform"] },
      migrations: [
        { op: "default", param: "format", value: "text" },
        {
          op: "default",
          param: "source_file",
          valueFrom: ["param.source", "step.source"],
        },
        { op: "default", param: "field_name", valueFrom: ["step.field"] },
        {
          op: "mapValue",
          param: "format",
          map: { string: "text", numeric: "number" },
        },
        {
          op: "default",
          param: "label",
          template: "{{upper param.field_name}} from {{alias step.source}}",
        },
        {
          op: "remove",
          param: "obsolete",
          when: { param: "format", equals: "number" },
        },
        { op: "handler", name: "touch" },
      ],
    }),
  );
  types.add(joinDefinition());
  types.add(unionSources());
  return types;
}

const migrationOptions = {
  helpers: {
    alias: (args) =>
      String(args[0] || "")
        .split(".")
        .pop(),
  },
  handlers: {
    touch: (step) => {
      step.params.touched = "yes";
    },
  },
};

test("migrations: fill defaults, copy values, map values and run handlers", () => {
  const saved = {
    type: "x",
    step_type: "format",
    source: "sap.hi0256",
    field: "Pernr",
    params: { format: "numeric", obsolete: 1 },
  };
  const before = JSON.stringify(saved);
  const result = plain(
    migrations.migrateStep(saved, migrationRegistry(), migrationOptions),
  );
  assert.equal(
    JSON.stringify(saved),
    before,
    "the input step is never changed",
  );
  assert.equal(result.known, true);
  assert.equal(result.definition.id, "format_field");
  assert.deepEqual(result.step, {
    type: "transform",
    step_type: "format_field",
    source: "sap.hi0256",
    field: "Pernr",
    params: {
      format: "number",
      source_file: "sap.hi0256",
      field_name: "Pernr",
      label: "PERNR from hi0256",
      touched: "yes",
    },
  });
  assert.deepEqual(
    result.changes.map((change) => change.op),
    ["alias", "default", "default", "mapValue", "default", "remove", "handler"],
  );
  assert.deepEqual(result.errors, []);
});

test("migrations: existing values win over defaults and conditions gate rules", () => {
  const result = plain(
    migrations.migrateStep(
      {
        step_type: "format_field",
        params: {
          format: "text",
          source_file: "wd.a",
          field_name: "F",
          label: "keep",
          obsolete: 1,
        },
      },
      migrationRegistry(),
      migrationOptions,
    ),
  );
  assert.deepEqual(result.step.params, {
    format: "text",
    source_file: "wd.a",
    field_name: "F",
    label: "keep",
    obsolete: 1,
    touched: "yes",
  });
  assert.deepEqual(
    result.changes.map((change) => change.op),
    ["handler"],
  );
});

test("migrations: setStepType moves union_sources into join and continues there", () => {
  const result = plain(
    migrations.migrateStep(
      {
        step_type: "union_sources",
        source: "out.table",
        params: {
          union_left_source: "wd.a",
          union_right_source: "sap.b",
          left_source: "",
          join_keys_json: "[]",
        },
      },
      migrationRegistry(),
    ),
  );
  assert.equal(result.definition.id, "join");
  assert.deepEqual(result.step, {
    step_type: "join",
    source: "out.table",
    type: "join",
    params: {
      left_source: "wd.a",
      right_source: "sap.b",
      output_source: "out.table",
      join_type: "UNION",
      left_field: "",
    },
  });
  assert.deepEqual(
    result.changes.map((change) => change.op),
    ["rename", "rename", "default", "set", "set", "remove", "setStepType"],
    "join's own default does not overwrite UNION",
  );
});

test("migrations: unknown steps, fallbacks, missing handlers and loops", () => {
  const types = migrationRegistry();
  const unknown = plain(
    migrations.migrateStep({ step_type: "pivot", params: null }, types),
  );
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.step, { step_type: "pivot", params: {} });

  const fallback = plain(
    migrations.migrateStep({}, types, { fallbackStepType: "join" }),
  );
  assert.equal(fallback.step.step_type, "join");
  assert.equal(fallback.step.params.join_type, "INNER JOIN");

  const viaType = plain(
    migrations.migrateStep(
      { type: "transform", params: {} },
      types,
      migrationOptions,
    ),
  );
  assert.equal(viaType.step.step_type, "format_field");

  const noHandler = plain(
    migrations.migrateStep({ step_type: "format_field", params: {} }, types, {
      helpers: migrationOptions.helpers,
    }),
  );
  assert.deepEqual(noHandler.errors, [
    { op: "handler", message: 'migration handler "touch" is not registered' },
  ]);

  const noHelper = plain(
    migrations.migrateStep({ step_type: "format_field", params: {} }, types, {
      handlers: migrationOptions.handlers,
    }),
  );
  assert.equal(
    noHelper.step.params.label,
    undefined,
    "a failed template writes nothing",
  );
  assert.match(noHelper.errors[0].message, /Unknown helper "alias"/);
  assert.equal(noHelper.step.params.touched, "yes", "later rules still run");

  const keepType = plain(
    migrations.migrateStep(
      { step_type: "join", type: "legacy", params: {} },
      types,
      { syncLegacyType: false },
    ),
  );
  assert.equal(keepType.step.type, "legacy");

  const looping = registry.createRegistry({ schema });
  const hop = (id, to) => ({
    ...unionSources(),
    id,
    label: id,
    migrations: [{ op: "setStepType", to }],
  });
  looping.add(hop("type_a", "type_b"));
  looping.add(hop("type_b", "type_a"));
  const loop = plain(
    migrations.migrateStep({ step_type: "type_a", params: {} }, looping),
  );
  assert.match(loop.errors[0].message, /loop at "type_a"/);
  const dangling = registry.createRegistry({ schema });
  dangling.add(hop("type_a", "type_z"));
  assert.match(
    plain(migrations.migrateStep({ step_type: "type_a" }, dangling)).errors[0]
      .message,
    /"type_z" is not registered/,
  );
});

// -----------------------------------------------------------------------------
// Packaging: engine manifest, index.html order and the definitions manifest
// -----------------------------------------------------------------------------

test("engine manifest lists existing files that index.html loads in the same order", () => {
  for (const file of [...engineManifest.scripts, ...engineManifest.catalogs])
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), file);
  assert.match(engineManifest.engineVersion, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(engineManifest.schemaVersions, [
    ...definitions.SUPPORTED_SCHEMA_VERSIONS,
  ]);
  const loaded = [
    ...read("index.html").matchAll(/src="\.\/(js\/step-types\/[^"]+\.js)"/g),
  ].map((match) => match[1]);
  // The bundled repository definitions load right after the engine.
  assert.deepEqual(loaded, [
    ...engineManifest.scripts,
    "js/step-types/definitions.generated.js",
  ]);
  const all = [
    ...read("index.html").matchAll(/src="\.\/(js\/[^"]+\.js)"/g),
  ].map((match) => match[1]);
  assert.ok(
    all.indexOf(engineManifest.scripts.at(-1)) <
      all.indexOf("js/01-state-dom.js"),
    "the engine loads before the app scripts that will read it",
  );
});

test("engine files are self-contained: no DOM, app state or code execution", () => {
  for (const file of engineManifest.scripts) {
    const source = read(file);
    assert.doesNotMatch(source, /\b(document|state|localStorage)\./, file);
    assert.doesNotMatch(source, /\beval\(|new Function\(|innerHTML/, file);
  }
});

test("catalogs/step-types/manifest.json matches the definition files", () => {
  assert.deepEqual(
    JSON.parse(read("catalogs/step-types/manifest.json")),
    buildManifest(),
  );
});
