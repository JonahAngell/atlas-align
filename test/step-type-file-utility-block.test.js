/**
 * Phase 9: a definition's export.fileUtility block says how File Utility runs
 * the step type. Every bundled type has one that matches contract version 2,
 * and the engine refuses a block File Utility couldn't follow when the caller
 * passes the contract's compiler names (the builder does).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadStepTypeEngine } from "../src/step-type-engine.js";

const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

const schema = read("catalogs/step-types/schema.json");
const contract = read("catalogs/file-utility/executable-steps.json");
const manifest = read("catalogs/step-types/manifest.json");
const bundled = manifest.definitions.map((entry) =>
  read(`catalogs/step-types/${entry.file}`),
);
const compilers = Object.keys(contract.compilers);

function errorsFor(definition, extra = { fileUtilityCompilers: compilers }) {
  const { engine, options } = loadStepTypeEngine();
  const result = engine.definitions.validate(definition, {
    ...options,
    schema,
    ...extra,
  });
  // The engine runs in its own vm context, so copy into this realm's arrays.
  return Array.from(result.errors || [], (error) =>
    String(`${error.path} ${error.message}`),
  );
}

const withBlock = (id, block) => {
  const definition = structuredClone(bundled.find((item) => item.id === id));
  definition.export.fileUtility = block;
  return definition;
};

test("every bundled step type names a File Utility compiler", () => {
  for (const definition of bundled) {
    assert.ok(definition.export.fileUtility, `${definition.id} has a block`);
    assert.deepEqual(errorsFor(definition), [], definition.id);
  }
});

test("the blocks give the answers of the version 1 step type list", () => {
  for (const definition of bundled) {
    const block = definition.export.fileUtility;
    const legacy = contract.legacyStepTypes[definition.id];
    assert.ok(legacy, `${definition.id} is in legacyStepTypes`);
    assert.equal(block.status || "supported", legacy.status, definition.id);
  }
  assert.deepEqual(
    bundled
      .filter((definition) =>
        ["filter_rows", "flag_records"].includes(definition.id),
      )
      .map((definition) => definition.export.fileUtility.compiler),
    ["legacy_condition", "legacy_condition"],
  );
});

test("an unknown compiler is refused when the contract is passed", () => {
  const definition = withBlock("sort_records", { compiler: "pivot" });
  assert.deepEqual(errorsFor(definition), [
    '/export/fileUtility/compiler File Utility has no "pivot" compiler',
  ]);
  assert.deepEqual(errorsFor(definition, {}), [], "no contract, no check");
});

test("a partial step type must say when it runs", () => {
  assert.deepEqual(
    errorsFor(
      withBlock("sort_records", {
        compiler: "sort_records",
        status: "partial",
      }),
    ),
    [
      "/export/fileUtility/when a partial step type needs when: the cases it runs in",
    ],
  );
});

test("a param map must point at the step type's own params", () => {
  assert.deepEqual(
    errorsFor(
      withBlock("sort_records", {
        compiler: "sort_records",
        params: { sort_fields_json: "missing_param" },
      }),
    ),
    [
      '/export/fileUtility/params/sort_fields_json "missing_param" is not a field of this step type',
    ],
  );
  const field = bundled.find((item) => item.id === "sort_records").fields[0]
    .param;
  assert.deepEqual(
    errorsFor(
      withBlock("sort_records", {
        compiler: "sort_records",
        params: { sort_fields_json: field },
      }),
    ),
    [],
  );
});

test("the schema refuses an unknown key in the block", () => {
  const errors = errorsFor(
    withBlock("sort_records", { compiler: "sort_records", changesRows: true }),
  );
  assert.ok(errors.length > 0);
});
