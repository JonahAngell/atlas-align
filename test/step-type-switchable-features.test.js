/**
 * Switchable composite features: `features: {nesting: false}` on a
 * condition_group field and `features: {freeform: false}` on an action field.
 * The palette accepts only those two switches, the runtime passes them to the
 * app editors, new edits lose the switched-off part, and a saved step that
 * uses it still shows it and validates as before.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadStepTypeEngine } from "../src/step-type-engine.js";
import { loadApp } from "./support/step-type-harness.js";

const readJson = (file) =>
  JSON.parse(
    readFileSync(new URL(`../catalogs/step-types/${file}`, import.meta.url)),
  );

const palette = readJson("controls.json");
const schema = readJson("schema.json");

function errorsFor(definition) {
  const { engine, options } = loadStepTypeEngine();
  const result = engine.definitions.validate(definition, {
    ...options,
    schema,
  });
  return (result.errors || [])
    .map((error) => `${error.path} ${error.message}`)
    .join("\n");
}

function withFeatures(file, control, features) {
  const definition = structuredClone(readJson(file));
  definition.fields.find((field) => field.control === control).features =
    features;
  return definition;
}

test("the palette marks the switchable and planned features", () => {
  const featuresOf = (name) =>
    palette.controls.find((control) => control.name === name).features;
  const switchable = palette.controls.flatMap((control) =>
    control.features
      .filter((feature) => feature.switchable === true)
      .map((feature) => `${control.name}.${feature.name}`),
  );
  assert.deepEqual(switchable, ["condition_group.nesting", "action.freeform"]);
  const planned = featuresOf("condition_group")
    .filter((feature) => feature.status === "planned")
    .map((feature) => feature.name);
  assert.deepEqual(planned, ["firstAvailable", "groupChecks"]);
});

test("palette check accepts nesting and freeform switches", () => {
  assert.equal(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { nesting: false }),
    ),
    "",
  );
  assert.equal(
    errorsFor(withFeatures("if_then.json", "action", { freeform: false })),
    "",
  );
  assert.equal(
    errorsFor(withFeatures("else.json", "action", { freeform: false })),
    "",
  );
  assert.equal(
    errorsFor(withFeatures("if_then.json", "condition_group", { nesting: true })),
    "",
  );
});

test("palette check refuses features that cannot be switched", () => {
  assert.match(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { firstAvailable: true }),
    ),
    /"firstAvailable" is planned and not built yet/,
  );
  assert.match(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { groupChecks: false }),
    ),
    /"groupChecks" is planned and not built yet/,
  );
  assert.match(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { valueList: false }),
    ),
    /"valueList" cannot be switched off yet/,
  );
  assert.match(
    errorsFor(withFeatures("if_then.json", "action", { display_text: false })),
    /"display_text" cannot be switched off yet/,
  );
  assert.match(
    errorsFor(withFeatures("if_then.json", "action", { nesting: false })),
    /the action control has no feature "nesting"/,
  );
  assert.match(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { freeform: false }),
    ),
    /the condition_group control has no feature "freeform"/,
  );
  assert.match(
    errorsFor(
      withFeatures("if_then.json", "condition_group", { nesting: "no" }),
    ),
    /features/,
  );
});

/** The app with if_then and else switched as `features` says. */
async function appWith(features) {
  const context = await loadApp();
  context.__features = features;
  vm.runInContext(
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      const definitions = bundled.definitions.map((definition) => {
        if (!["if_then", "else"].includes(definition.id)) return definition;
        const copy = structuredClone(definition);
        copy.fields.forEach((field) => {
          const switched = __features[field.control];
          if (switched) field.features = { ...switched };
        });
        return copy;
      });
      ATLASStepTypeRuntime.loadBundled({ ...bundled, definitions });
    })()`,
    context,
  );
  const step = (stepType, params) => {
    context.__step = { id: "s1", step_type: stepType, params };
    return vm.runInContext("normalizeCatalogStep(__step)", context);
  };
  const runtime = context.ATLASStepTypeRuntime;
  return {
    context,
    run: (code) => vm.runInContext(code, context),
    editor: (stepType, params) => runtime.renderEditor(step(stepType, params)),
    validate: (stepType, params) =>
      JSON.stringify(runtime.validate(step(stepType, params))),
    english: (stepType, params) => runtime.english(step(stepType, params)),
  };
}

const OFF = {
  condition_group: { nesting: false },
  action: { freeform: false },
};

const leaf = (id, fieldName, value, connector = "IF") => ({
  id,
  connector,
  sourceFile: "PA",
  fieldName,
  operator: "is equal to",
  valueMode: "values",
  compareValue: value,
});

const GROUPED = {
  conditions_json: JSON.stringify([
    leaf("c1", "Status", "A"),
    {
      id: "g1",
      conditionType: "group",
      connector: "AND",
      groupConnector: "OR",
      items: [leaf("c2", "Code", "X"), leaf("c3", "Code", "Y", "OR")],
    },
  ]),
  then_action_type: "display_text",
  then_text: "Check",
};

const FREEFORM = {
  conditions_json: JSON.stringify([leaf("c1", "Status", "A")]),
  then_action_type: "freeform",
  then_action: "display records in the audit",
};

test("the runtime passes each definition's features to the app editors", async () => {
  for (const [features, expected] of [
    [{}, { condition_group: {}, THEN: {}, ELSE: {} }],
    [
      OFF,
      {
        condition_group: { nesting: false },
        THEN: { freeform: false },
        ELSE: { freeform: false },
      },
    ],
  ]) {
    const { context, editor } = await appWith(features);
    vm.runInContext(
      `globalThis.__seen = {};
      const conditions = atlasConditionGroupEditorHtml;
      atlasConditionGroupEditorHtml = (step, features) => {
        __seen.condition_group = features;
        return conditions(step, features);
      };
      const action = atlasActionEditorHtml;
      atlasActionEditorHtml = (params, branch, features) => {
        __seen[branch] = features;
        return action(params, branch, features);
      };`,
      context,
    );
    editor("if_then", GROUPED);
    editor("else", FREEFORM);
    assert.deepEqual(JSON.parse(JSON.stringify(context.__seen)), expected);
  }
});

/**
 * One condition row drawn with a stand-in DOM, since the harness has none:
 * the actions the row ends up with, as markup.
 */
function conditionRowActions(run, nesting) {
  return run(`(() => {
    const original = { document: globalThis.document, row: renderConditionRow };
    const remove = { textContent: "", replaceWith(node) { row.actions = node; } };
    const row = {
      classList: { add() {} },
      dataset: { conditionId: "c1" },
      querySelector: (selector) =>
        selector === ".condition-row-header"
          ? { innerHTML: "", hidden: false }
          : remove,
    };
    globalThis.document = { createElement: (tag) =>
      tag === "template"
        ? {
            content: { querySelector: () => row },
            set innerHTML(_value) {},
            get innerHTML() {
              return row.actions ? row.actions.innerHTML : "";
            },
          }
        : { className: "", innerHTML: "", append() {} } };
    renderConditionRow = () => "";
    try {
      return atlasRenderConditionListRow({ id: "c1" }, 0, 0, "AND", {
        nesting: ${nesting},
      });
    } finally {
      globalThis.document = original.document;
      renderConditionRow = original.row;
    }
  })()`);
}

test("nesting false drops the Sub-condition button from condition rows", async () => {
  const { run } = await appWith({});
  assert.match(conditionRowActions(run, true), /data-guided-add-sub="c1"/);
  assert.doesNotMatch(conditionRowActions(run, false), /data-guided-add-sub/);
});

test("a saved step keeps its nested groups with nesting false", async () => {
  const on = await appWith({});
  const off = await appWith(OFF);
  const markup = off.editor("if_then", GROUPED);
  assert.match(markup, /class="guided-condition-group"/);
  assert.match(markup, /data-group-id="g1"/);
  assert.match(markup, /aria-label="Sub-conditions: 2 joined by OR"/);
  assert.equal(
    markup.replace(/atlas-choice-popover-\d+/g, ""),
    on.editor("if_then", GROUPED).replace(/atlas-choice-popover-\d+/g, ""),
  );
  assert.equal(off.english("if_then", GROUPED), on.english("if_then", GROUPED));
  assert.equal(
    off.validate("if_then", GROUPED),
    on.validate("if_then", GROUPED),
  );
});

test("freeform false drops the freeform action choice", async () => {
  const { run } = await appWith({});
  for (const branch of ["THEN", "ELSE"]) {
    const on = run(`atlasActionEditorHtml({}, "${branch}", {})`);
    assert.match(on, /data-choice-value="freeform"/, branch);
    assert.match(on, /<textarea data-param="then_action"/, branch);
    const off = run(
      `atlasActionEditorHtml({}, "${branch}", { freeform: false })`,
    );
    assert.match(off, /data-param="then_action_type"/, branch);
    assert.doesNotMatch(off, /data-choice-value="freeform"/, branch);
    assert.doesNotMatch(off, /Freeform Text/, branch);
    assert.doesNotMatch(off, /<textarea data-param="then_action"/, branch);
    assert.match(off, /data-choice-value="set_column_value"/, branch);
    assert.match(off, /data-choice-value="set_column_calculation"/, branch);
    assert.match(
      off,
      /data-choice-value="set_column_string_transform"/,
      branch,
    );
    assert.match(off, /Choose an action type\./, branch);
  }
  // The flag never outlives one editor.
  assert.match(run(`atlasActionEditorHtml({}, "THEN")`), /Freeform Text/);
});

test("a saved freeform step keeps the freeform choice with freeform false", async () => {
  const on = await appWith({});
  const off = await appWith(OFF);
  for (const stepType of ["if_then", "else"]) {
    const markup = off.editor(stepType, FREEFORM);
    assert.match(markup, /data-choice-value="freeform"/, stepType);
    assert.match(markup, /display records in the audit/, stepType);
    assert.equal(
      markup.replace(/atlas-choice-popover-\d+/g, ""),
      on.editor(stepType, FREEFORM).replace(/atlas-choice-popover-\d+/g, ""),
      stepType,
    );
    assert.equal(
      off.english(stepType, FREEFORM),
      on.english(stepType, FREEFORM),
      stepType,
    );
    assert.equal(
      off.validate(stepType, FREEFORM),
      on.validate(stepType, FREEFORM),
      stepType,
    );
  }
  // A step saved before action types: no type, words in then_action.
  assert.match(
    off.run(
      `atlasActionEditorHtml({ then_action: "display records" }, "THEN", { freeform: false })`,
    ),
    /data-choice-value="freeform"/,
  );
});
