/**
 * Field controls: the palette in catalogs/step-types/controls.json, the
 * schema's control list and the runtime's FIELD_CONTROLS agree, the palette
 * check rejects what a control does not read, and the field-based Format
 * Field and Split Field definitions read as the block editors did.
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

function fieldControlEnum() {
  const field = schema.$defs?.field || schema.definitions?.field;
  const found = JSON.stringify(field || schema).match(
    /"control":\{[^}]*"enum":(\[[^\]]*\])/,
  );
  assert.ok(found, "schema lists the field controls");
  return JSON.parse(found[1]);
}

test("palette, schema and runtime list the same controls", () => {
  const { options } = loadStepTypeEngine();
  const names = palette.controls.map((control) => control.name);
  assert.equal(new Set(names).size, names.length, "control names are unique");
  assert.deepEqual([...fieldControlEnum()].sort(), [...names].sort());
  const available = palette.controls
    .filter((control) => control.status === "available")
    .map((control) => control.name);
  assert.deepEqual([...options.controls].sort(), [...available].sort());
});

test("every bundled definition passes the palette check", () => {
  const { engine, options } = loadStepTypeEngine();
  for (const file of ["format_field.json", "split_field.json"]) {
    const result = engine.definitions.validate(readJson(file), {
      ...options,
      schema,
    });
    assert.equal(JSON.stringify(result.errors || []), "[]", file);
  }
});

function withField(field) {
  const definition = structuredClone(readJson("format_field.json"));
  definition.fields.push(field);
  return definition;
}

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

test("palette check rejects properties, features and options a control does not read", () => {
  assert.match(
    errorsFor(
      withField({ param: "extra", control: "toggle", label: "X", min: 1 }),
    ),
    /does not read "min"/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "extra",
        control: "choice",
        label: "X",
        options: [{ value: "a", label: "A", colour: "red" }],
      }),
    ),
    /colour/,
  );
  assert.match(
    errorsFor(
      withField({
        param: "extra",
        control: "text",
        label: "X",
        features: { nesting: false },
      }),
    ),
    /features|nesting/,
  );
});

test("palette check rejects a planned control the runtime cannot render", () => {
  assert.match(
    errorsFor(
      withField({ param: "conditions_json", control: "condition_group" }),
    ),
    /condition_group/,
  );
});

test("template render escapes text and values separately", () => {
  const { engine } = loadStepTypeEngine();
  const out = engine.templates.render(
    'Say "{{param.x}}" <b>',
    { param: { x: `<a href="y">'` } },
    {
      escapeText: (text) => text.replace(/</g, "&lt;"),
      escapeValue: (value) => String(value).replace(/["'<]/g, "_"),
    },
  );
  assert.equal(out, 'Say "_a href=_y_>_" &lt;b>');
});

async function app() {
  const context = await loadApp();
  return {
    context,
    step(stepType, params) {
      context.__step = { id: "s1", step_type: stepType, params };
      return vm.runInContext("normalizeCatalogStep(__step)", context);
    },
    run(code, step) {
      context.__step = step;
      return vm.runInContext(code, context);
    },
  };
}

test("split field reads in analyst and developer logic", async () => {
  const { step, run } = await app();
  const width = step("split_field", {
    source_file: "PA",
    field_name: "Code",
    split_by: "width",
    split_mode: "part",
    split_width: "3",
    split_part: "2",
    output_column: "Mid",
  });
  assert.match(
    run("analystLogic(__step)", width),
    /pieces of 3 characters and display part 2 in column/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", width).sql,
    /SUBSTRING\(.*, 4, 3\)/,
  );
  const explode = step("split_field", {
    source_file: "PA",
    field_name: "Code",
    split_by: "delimiter",
    split_mode: "explode",
    split_delimiter: "comma",
  });
  assert.match(
    run("analystLogic(__step)", explode),
    /on the comma and make one record for each part/,
  );
  assert.match(
    run("atlasDeveloperFormulas(__step)", explode).python,
    /df\.explode/,
  );
});

test("a hidden option is kept for a saved step that uses it", async () => {
  const { context, step } = await app();
  vm.runInContext(
    `(() => {
      const bundled = ATLASStepTypes.bundled;
      const definitions = bundled.definitions.map((definition) => {
        if (definition.id !== "split_field") return definition;
        const copy = structuredClone(definition);
        copy.fields
          .find((field) => field.param === "split_mode")
          .options.find((option) => option.value === "explode").hidden = true;
        return copy;
      });
      ATLASStepTypeRuntime.loadBundled({ ...bundled, definitions });
    })()`,
    context,
  );
  const editor = (mode) =>
    context.ATLASStepTypeRuntime.renderEditor(
      step("split_field", {
        source_file: "PA",
        field_name: "Code",
        split_by: "delimiter",
        split_mode: mode,
        split_delimiter: "comma",
      }),
    );
  assert.doesNotMatch(editor("part"), /value="explode"/);
  assert.match(editor("explode"), /value="explode"/);
});

test("the editor redraws on params that decide what it shows", async () => {
  const { context } = await app();
  const params = context.ATLASStepTypeRuntime.rerenderParams();
  for (const param of ["format_kind", "split_by", "split_mode"])
    assert.ok(params.includes(param), param);
});

test("an unknown format shows an escaped callout and no format choice", async () => {
  const { step, run } = await app();
  const html = run(
    "renderGuidedBuilder(__step)",
    step("format_field", {
      source_file: "PA",
      field_name: "Code",
      format: `<b>&"'x`,
    }),
  );
  assert.match(
    html,
    /role="note">This step's format is written as "&lt;b&gt;&amp;&quot;&#39;x", which is not a known format\./,
  );
});
