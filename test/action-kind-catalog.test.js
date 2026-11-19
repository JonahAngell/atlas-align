/**
 * Action kind catalog (Phase 10, issue 5048 of the Dynamic Step Type Builder
 * plan): each THEN / ELSE action kind is a definition with kind "action" in
 * catalogs/step-types/actions/, and a step type includes the chosen kind's
 * partials with {{action "part"}}.
 *
 * The kinds' partials were moved out of if_then v4 and else v4 without
 * changing their text, so for every step of the condition and action matrix
 * {{action ...}} must render what the step type's own partials render today.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";
import { matrixGroups } from "./fixtures/condition-action-matrix/cases.js";

const read = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const run = (context, code) => vm.runInContext(code, context);
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

// In Action Type picker order.
const KINDS = [
  "freeform",
  "set_column_value",
  "set_column_string_transform",
  "set_column_calculation",
  "display_text",
  "display",
  "do_not_display",
];
const DIALECTS = ["excel", "sql", "python"];
// The step types as they were before {{action}}: if_then v4 and else v4.
const V4 = (id) => read(`test/fixtures/step-types-pinned/${id}.v4.json`);
const QTEST = V4("if_then").export.qtest.action;

/** The part of else v4's formula (or note) that picks the action's frame. */
function elseInner(template) {
  const start = template.indexOf(
    '{{#if (in (default param.then_action_type "freeform") "display" "do_not_display")}}',
  );
  assert.ok(start > 0, "else v4 picks the frame by action kind");
  return [template.slice(0, start), template.slice(start, -"{{/if}}".length)];
}

/**
 * if_then v4 and else v4 with probe partials: each pair renders one part
 * the old way (the step type's own partials) and the new way ({{action}}).
 * The probed v4 stands in for the bundled latest version.
 */
function probed(definition) {
  const copy = structuredClone(definition);
  const probes = {};
  const pair = (name, old, now) => {
    probes[`old_${name}`] = old;
    probes[`new_${name}`] = now;
  };
  pair("shape", "", '{{action "shape"}}');
  [
    "actionTarget",
    "actionValue",
    "actionExpression",
    "unmatched",
    "matchedLines",
    "unmatchedLines",
  ].forEach((name) =>
    pair(name, `{{include "${name}"}}`, `{{action "${name}"}}`),
  );
  if (copy.id === "if_then") {
    pair("english", '{{include "thenAction"}}', '{{action "english"}}');
    pair("formula", '{{include "formula"}}', '{{action "formula"}}');
    pair(
      "formulaNote",
      '{{include "formulaNote"}}',
      '{{action "formulaNote"}}',
    );
  } else {
    pair("english", '{{include "elseAction"}}', '{{action "elseEnglish"}}');
    ["formula", "formulaNote"].forEach((name) => {
      const own = copy.partials[name];
      const forms = typeof own === "string" ? { default: own } : own;
      const next = Object.fromEntries(
        Object.entries(forms).map(([form, template]) => {
          const [guard] = elseInner(template);
          const part = name === "formula" ? "elseFormula" : "elseFormulaNote";
          return [form, `${guard}{{action "${part}"}}{{/if}}`];
        }),
      );
      pair(
        name,
        `{{include "${name}"}}`,
        typeof own === "string" ? next.default : next,
      );
    });
  }
  probes.elseKind =
    '{{#if elseStep}}{{default elseStep.param.then_action_type "freeform"}}{{/if}}';
  Object.entries(QTEST).forEach(([part, template]) =>
    pair(`qtest_${part}`, template, `{{action "qtest" part="${part}"}}`),
  );
  copy.partials = { ...copy.partials, ...probes };
  return copy;
}

async function app() {
  const context = await loadApp();
  context.__probed = ["if_then", "else"].map((id) => probed(V4(id)));
  run(
    context,
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      const byId = Object.fromEntries(__probed.map((d) => [d.id, d]));
      ATLASStepTypeRuntime.loadBundled({
        ...bundled,
        definitions: bundled.definitions.map((d) => byId[d.id] || d),
      });
    })()`,
  );
  assert.deepEqual(
    plain(run(context, "ATLASStepTypeRuntime.registry().rejected()")),
    [],
  );
  return context;
}

/** One probe for the step in `format`, trimmed as partial() returns it. */
function probe(context, step, name, format) {
  context.__step = step;
  context.__name = name;
  context.__format = format;
  return run(
    context,
    "ATLASStepTypeRuntime.partial(__step.step_type, __name, __step, __format)",
  );
}

/** The qTest outcome a step's parts describe, as qtestAction builds it. */
function qtestOutcome(render) {
  const kind = render("kind").trim();
  if (kind === "display_text")
    return {
      kind,
      message: render("message"),
      outputColumn: render("outputColumn"),
    };
  if (kind === "set_column")
    return {
      kind,
      targetColumn: render("targetColumn"),
      valueField: render("valueField"),
      calculated: render("calculated").trim() === "true",
    };
  if (kind === "freeform") return { kind, text: render("text") };
  return { kind };
}

test("{{action}} renders what if_then v4 and else v4 render, across the matrix", async () => {
  const context = await app();
  const differences = [];
  let checked = 0;
  let filled = 0;
  for (const { cases } of matrixGroups())
    for (const document of cases) {
      context.__document = structuredClone(document);
      run(
        context,
        `state.audit = normalizeLoadedAudit(__document, "repo");
         state.auditSelected = true;`,
      );
      const steps = run(context, "state.audit.steps").filter((step) =>
        ["if_then", "else"].includes(step.step_type),
      );
      for (const step of steps) {
        const kind = step.params?.then_action_type || "freeform";
        const compare = (name, format) => {
          checked += 1;
          const old = probe(context, step, `old_${name}`, format);
          const now = probe(context, step, `new_${name}`, format);
          if (old) filled += 1;
          if (old !== now)
            differences.push({
              case: document.id,
              step: step.id,
              kind,
              part: name,
              format,
              old,
              now,
            });
        };
        const shape = probe(context, step, "new_shape", "english");
        compare("english", "english");
        compare("actionTarget", "english");
        compare("actionTarget", "excel");
        if (shape === "value") {
          DIALECTS.forEach((format) => compare("actionValue", format));
          compare("actionValue", "english");
          ["excel", "sql"].forEach((format) => {
            compare("actionExpression", format);
            compare("unmatched", format);
          });
          compare("matchedLines", "python");
          compare("unmatchedLines", "python");
        }
        const elseKind = probe(context, step, "elseKind", "english") || null;
        // if_then v4's column-value frame includes the ELSE's expression by
        // name, so it picks the ELSE's kind itself only when they match.
        if (step.step_type === "else" || elseKind === null || elseKind === kind)
          DIALECTS.forEach((format) => compare("formula", format));
        compare("formulaNote", "english");
        const outcome = (prefix) =>
          qtestOutcome((part) =>
            probe(context, step, `${prefix}_qtest_${part}`, "plain"),
          );
        checked += 1;
        const old = outcome("old");
        const now = outcome("new");
        if (JSON.stringify(old) !== JSON.stringify(now))
          differences.push({
            case: document.id,
            step: step.id,
            kind,
            part: "qtest",
            old,
            now,
          });
      }
    }
  assert.ok(checked > 500, `only ${checked} parts were compared`);
  assert.ok(
    filled > checked / 2,
    `only ${filled} of ${checked} parts had text`,
  );
  assert.deepEqual(differences.slice(0, 5), []);
});

test("every action kind is a definition in catalogs/step-types/actions/", async () => {
  const files = readdirSync(
    new URL("../catalogs/step-types/actions/", import.meta.url),
  )
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual(files, KINDS.map((kind) => `action_${kind}.json`).sort());
  const manifest = read("catalogs/step-types/manifest.json");
  KINDS.forEach((kind) =>
    assert.ok(
      manifest.definitions.some(
        (entry) =>
          entry.id === `action_${kind}` &&
          entry.file === `actions/action_${kind}.json`,
      ),
      `the manifest lists action_${kind}`,
    ),
  );
  const context = await loadApp();
  assert.deepEqual(
    plain(
      run(context, "ATLASStepTypeRuntime.actionKinds().map((d) => d.name)"),
    ),
    KINDS,
  );
  assert.deepEqual(
    plain(run(context, "ATLASStepTypeRuntime.registry().rejected()")),
    [],
  );
});

test("the action composite's features are the registered kinds", async () => {
  const controls = read("catalogs/step-types/controls.json");
  const action = controls.controls.find((control) => control.name === "action");
  const context = await loadApp();
  const kinds = plain(
    run(context, "ATLASStepTypeRuntime.actionKinds().map((d) => d.name)"),
  );
  // The kinds are in picker order; controls.json lists them by topic.
  assert.deepEqual(
    action.features.map((feature) => feature.name).sort(),
    [...kinds].sort(),
    "controls.json lists one feature per action kind",
  );
});

test("action kinds are not step types", async () => {
  const context = await loadApp();
  const ids = plain(
    run(
      context,
      "ATLASStepTypeRuntime.registry().list({ includeLegacy: true }).map((d) => d.id)",
    ),
  );
  assert.ok(ids.includes("if_then"));
  assert.ok(!ids.some((id) => id.startsWith("action_")), ids.join(", "));
  assert.equal(
    run(context, 'ATLASStepTypeRuntime.registry().resolve("action_display")'),
    null,
  );
  assert.equal(
    run(
      context,
      'ATLASStepTypeRuntime.definitionFor({ step_type: "action_display" })',
    ),
    null,
  );
  const options = plain(
    run(context, "ATLASStepTypeRuntime.typeOptions().map((o) => o.value)"),
  );
  assert.ok(
    !options.some((value) => String(value).startsWith("action_")),
    options.join(", "),
  );
});

test("a blank or unknown then_action_type renders the freeform kind", async () => {
  const context = await loadApp();
  const kind = (value) =>
    run(
      context,
      `ATLASStepTypeRuntime.actionKind(${JSON.stringify(value)})?.id`,
    );
  assert.equal(kind("display_text"), "action_display_text");
  assert.equal(kind(""), "action_freeform");
  assert.equal(kind(undefined), "action_freeform");
  assert.equal(kind("no_such_kind"), "action_freeform");
  assert.equal(kind("../if_then"), "action_freeform");
});

test("a pinned publication renders the action kind version it was published with", async () => {
  const context = await loadApp();
  const display = read("catalogs/step-types/actions/action_display.json");
  const next = structuredClone(display);
  next.version = 2;
  next.partials.english = "Show every record.";
  context.__extra = [next];
  run(
    context,
    `ATLASStepTypeRuntime.loadBundled({
      ...ATLASStepTypes.bundled,
      definitions: [...ATLASStepTypes.bundled.definitions, ...__extra],
    })`,
  );
  context.__step = {
    id: "s1",
    step_type: "if_then",
    params: { then_action_type: "display", conditions_json: "[]" },
  };
  // A probe that renders the kind's english through {{action}}.
  const english = () =>
    run(
      context,
      `ATLASStepTypes.templates.render('{{action "english"}}', { param: __step.params }, {
        helpers: ATLASStepTypeRuntime.TEMPLATE_HELPERS,
        format: "english",
      })`,
    );
  assert.equal(english(), "Show every record.");
  run(
    context,
    "ATLASStepTypeRuntime.usePinnedVersions({ if_then: 4, action_display: 1 })",
  );
  assert.notEqual(english(), "Show every record.");
  assert.equal(
    english(),
    run(context, 'renderCatalogPhrase("analyst_logic.if_then.then_display")'),
  );
  run(context, "ATLASStepTypeRuntime.usePinnedVersions(null)");
  assert.equal(english(), "Show every record.");
});

test("action kind definitions are checked for the keys a kind needs", async () => {
  const context = await loadApp();
  const check = (definition) => {
    context.__definition = definition;
    return plain(
      run(
        context,
        `ATLASStepTypes.definitions.validate(__definition, {
          schema: ATLASStepTypes.bundled.schema,
          helpers: [...ATLASStepTypeRuntime.HELPER_NAMES],
        }).errors.map((e) => e.path + " " + e.message)`,
      ),
    );
  };
  const display = read("catalogs/step-types/actions/action_display.json");
  assert.deepEqual(check(display), []);
  assert.deepEqual(check({ ...display, id: "action_other" }), [
    "/id must be action_display",
  ]);
  const noEnglish = structuredClone(display);
  delete noEnglish.partials.english;
  assert.deepEqual(check(noEnglish), ["/partials/english is required"]);
  assert.deepEqual(check({ ...display, branches: ["then"] }), [
    "/branches is only for a step type",
  ]);
  assert.deepEqual(
    check({ ...display, export: { fileUtility: { compiler: "if_then" } } }),
    [
      "/export/fileUtility/compiler is only for a step type; an action kind names an action",
    ],
  );
  assert.deepEqual(
    check({
      ...display,
      fields: [
        {
          param: "conditions_json",
          control: "condition_group",
          label: "Conditions",
        },
      ],
    }),
    ["/fields/0/control an action kind can't place condition_group"],
  );
  const step = read("catalogs/step-types/sort_records.json");
  const noFormulas = structuredClone(step);
  delete noFormulas.formulas;
  assert.deepEqual(check(noFormulas), ["/formulas is required"]);
  assert.deepEqual(check({ ...step, name: "sort" }), [
    "/name is only for an action kind",
  ]);
});

test("the Action Type picker lists the action kinds by their picker labels", async () => {
  const context = await loadApp();
  const choices = (current, options) => {
    context.__options = options;
    return plain(
      run(
        context,
        `atlasThenActionTypeChoices(${JSON.stringify(current)}, __options).map(([value, label]) => value + ": " + label)`,
      ),
    );
  };
  const structured = [
    "set_column_value: Set Column Value from Field",
    "set_column_string_transform: Set Column to String Transformation",
    "set_column_calculation: Set Column to Calculated Value",
    "display_text: Display Text Response in Column",
    "display: Display / Do Not Display",
  ];
  // Freeform is legacy: offered only to a step that uses it.
  assert.deepEqual(choices("display"), structured);
  assert.deepEqual(choices("freeform"), [
    "freeform: Freeform Text (legacy)",
    ...structured,
  ]);
  assert.deepEqual(choices("freeform", { freeform: false }), structured);
  // Do Not Display shows under the Display choice.
  assert.equal(
    run(context, 'atlasActionChoiceValue("do_not_display")'),
    "display",
  );
  assert.equal(
    run(context, 'atlasActionChoiceValue("display_text")'),
    "display_text",
  );
});

test("the Action editor draws the selected kind's fields", async () => {
  const context = await loadApp();
  const editor = (params, branch = "THEN") => {
    context.__params = params;
    return run(
      context,
      `atlasActionEditorHtml(__params, ${JSON.stringify(branch)})`,
    );
  };
  // Freeform is a plain textarea field.
  assert.match(
    editor({ then_action_type: "freeform", then_action: "a <b>" }),
    /<label class="full">Action<textarea data-param="then_action" placeholder="e\.g\., display records in the audit">a &lt;b&gt;<\/textarea><\/label>/,
  );
  // The other kinds place their form as an editor block.
  assert.match(
    editor({ then_action_type: "display_text" }, "ELSE"),
    /display-text-preview[^>]*><strong>Preview:<\/strong> ELSE /,
  );
  assert.match(
    editor({ then_action_type: "do_not_display" }),
    /data-param="then_exclude_scope"/,
  );
  // A kind's editor frame: String Transformation has its own heading.
  assert.match(
    editor({ then_action_type: "set_column_string_transform" }, "ELSE"),
    /^<div class="then-action-builder string-transform-builder"><h4> ELSE Action <\/h4>/,
  );
  // Any kind's fields go through the field renderer.
  const html = run(
    context,
    `ATLASStepTypeRuntime.actionEditorHtml(
      { fields: [{ param: "then_text", control: "text", label: "Message" }] },
      { then_text: "Check" },
    )`,
  );
  assert.match(html, /Message/);
  assert.match(html, /data-param="then_text"/);
  assert.match(html, /value="Check"/);
});

test("if_then v5 and else v5 read the action from its kind", () => {
  const moved = [
    "actionTarget",
    "actionValue",
    "actionExpression",
    "unmatched",
    "matchedLines",
    "unmatchedLines",
    "separatorClause",
    "excludeKeyColumn",
    "groupExclude",
  ];
  for (const id of ["if_then", "else"]) {
    const definition = read(`catalogs/step-types/${id}.json`);
    assert.equal(definition.version, 5, id);
    moved.forEach((name) =>
      assert.equal(definition.partials[name], undefined, `${id} ${name}`),
    );
    const qtest = definition.export.qtest.action;
    Object.entries(qtest).forEach(([part, template]) =>
      assert.equal(template, `{{action "qtest" part="${part}"}}`, id),
    );
  }
  const ifThen = read("catalogs/step-types/if_then.json");
  assert.deepEqual(ifThen.branches, ["then", "else"]);
  assert.equal(ifThen.inverse, true);
  assert.equal(ifThen.referenceChild, true);
  // The replaced actionText helper (if_then v1 and v2 pins) renders these.
  assert.equal(ifThen.partials.thenAction, '{{action "english"}}');
  assert.equal(
    read("catalogs/step-types/else.json").partials.elseAction,
    '{{action "elseEnglish"}}',
  );
});

test("a kind's complete list says whether a step has its own action", async () => {
  const context = await loadApp();
  const complete = (type, params) => {
    context.__params = params;
    return run(
      context,
      `ATLASStepTypeRuntime.actionComplete(${JSON.stringify(type)}, __params)`,
    );
  };
  assert.equal(complete("display", {}), true);
  assert.equal(complete("do_not_display", {}), true);
  assert.equal(complete("display_text", { then_text: "Check" }), false);
  assert.equal(
    complete("display_text", {
      then_text: "Check",
      then_output_column: "Error Message",
    }),
    true,
  );
  assert.equal(
    complete("set_column_value", {
      then_target_column: "A",
      then_value_field: " ",
    }),
    false,
  );
  assert.equal(complete("freeform", { then_action: "flag it" }), true);
  // No kind: blank or unknown types have no action of their own.
  assert.equal(complete("", { then_action: "flag it" }), null);
  assert.equal(complete("other", {}), null);
});
