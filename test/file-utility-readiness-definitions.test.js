/**
 * Phase 9: File Utility readiness reads each step's definition. The
 * export.fileUtility block names the compiler and maps its params; a version
 * written before the block falls back to the contract's legacyStepTypes.
 * A builder type that names a compiler gets the same answers as the bundled
 * type that compiler belongs to.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(read(path));

const engineManifest = readJson("js/step-types/engine-manifest.json");
const contract = readJson("catalogs/file-utility/executable-steps.json");
const manifest = readJson("catalogs/step-types/manifest.json");
const bundled = Object.fromEntries(
  manifest.definitions.map((entry) => [
    entry.id,
    readJson(`catalogs/step-types/${entry.file}`),
  ]),
);
const pinnedVersion = (id, version) =>
  readJson(`test/fixtures/step-types-pinned/${id}.v${version}.json`);

const engineContext = vm.createContext({});
engineManifest.scripts.forEach((path) =>
  vm.runInContext(read(path), engineContext),
);
vm.runInContext(read("js/22a-file-utility-readiness.js"), engineContext);
// 22a on its own, as the plain readiness test loads it.
const plainContext = vm.createContext({});
vm.runInContext(read("js/22a-file-utility-readiness.js"), plainContext);

/**
 * Readiness for `document`, each step checked with `definitions[step_type]`
 * (the bundled definition when the map does not name the type).
 */
function check(document, definitions = {}, context = engineContext) {
  const lookup = { ...bundled, ...definitions };
  return JSON.parse(
    JSON.stringify(
      context.FileUtilityReadiness.check(document, contract, {
        definitionFor: (step) => lookup[step.step_type] || null,
      }),
    ),
  );
}
const plainCheck = (document) =>
  JSON.parse(
    JSON.stringify(plainContext.FileUtilityReadiness.check(document, contract)),
  );
const messages = (result) => result.blockers.map((blocker) => blocker.message);

const step = (id, stepType, params = {}, extra = {}) => ({
  id,
  step_type: stepType,
  title: `Step ${id}`,
  params,
  sortOrder: 1,
  ...extra,
});
const audit = (...steps) => ({ sources: [], steps });
const sortFields = JSON.stringify([{ fieldName: "Order Date" }]);

/** A builder-made type: a copy of `base` under a new id and block. */
function builderType(base, id, fileUtility) {
  const definition = structuredClone(bundled[base]);
  definition.id = id;
  definition.version = 1;
  delete definition.aliases;
  if (fileUtility === undefined) delete definition.export.fileUtility;
  else definition.export.fileUtility = fileUtility;
  return definition;
}

test("the engine reads the block, then legacyStepTypes, then gives up", () => {
  const fileUtilityFor = (definition) =>
    JSON.parse(
      JSON.stringify(
        engineContext.ATLASStepTypes.definitions.fileUtilityFor(
          definition,
          contract,
        ),
      ),
    );
  assert.deepEqual(fileUtilityFor(bundled.sort_records), {
    compiler: "sort_records",
    status: "supported",
    when: "not inside an IF branch",
    params: {},
    legacy: false,
  });
  assert.deepEqual(fileUtilityFor(pinnedVersion("filter_rows", 1)), {
    compiler: "legacy_condition",
    status: "supported",
    when: "",
    params: {},
    legacy: true,
  });
  assert.equal(
    fileUtilityFor(pinnedVersion("create_column", 1)).status,
    "partial",
  );
  assert.equal(fileUtilityFor({ id: "custom_type", export: {} }), null);
  // A version 1 contract still names its types in stepTypes.
  assert.equal(
    engineContext.ATLASStepTypes.definitions.fileUtilityFor(
      { id: "join" },
      { stepTypes: { join: { status: "supported" } } },
    ).compiler,
    "join",
  );
});

test("the engine and 22a on its own resolve every definition the same way", () => {
  const definitions = [
    ...Object.values(bundled),
    ...readdirSync(new URL("fixtures/step-types-pinned/", import.meta.url))
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson(`test/fixtures/step-types-pinned/${file}`)),
    { id: "custom_type", export: {} },
  ];
  for (const definition of definitions) {
    const engine = engineContext.FileUtilityReadiness.runFor(
      definition,
      contract,
    );
    const plain = plainContext.FileUtilityReadiness.runFor(
      definition,
      contract,
    );
    const key = (run) =>
      run ? JSON.stringify([run.compiler, run.params]) : "null";
    assert.equal(
      key(engine),
      key(plain),
      `${definition.id}@${definition.version}`,
    );
  }
});

test("sample audits give the same answers with and without definitions", () => {
  const files = readdirSync(new URL("../audits/", import.meta.url)).filter(
    (name) => name.endsWith(".json"),
  );
  assert.ok(files.length > 0);
  for (const file of files) {
    const document = readJson(`audits/${file}`);
    assert.deepEqual(check(document), plainCheck(document), file);
  }
});

test("old pinned versions run through legacyStepTypes", () => {
  const document = audit(
    step("1", "sort_records", { sort_fields_json: sortFields }),
    step("2", "filter_rows", {
      field_name: "Status",
      operator: "is equal to",
      compare_value: "A",
    }),
  );
  const result = check(document, {
    sort_records: pinnedVersion("sort_records", 1),
    filter_rows: pinnedVersion("filter_rows", 1),
  });
  assert.deepEqual(result, check(document));
  assert.equal(result.runnable, true);
});

test("a builder type that names a compiler gets that compiler's checks", () => {
  const orderBy = builderType("sort_records", "order_rows", {
    compiler: "sort_records",
  });
  for (const params of [{ sort_fields_json: sortFields }, {}]) {
    assert.deepEqual(
      messages(
        check(audit(step("1", "order_rows", params)), { order_rows: orderBy }),
      ),
      messages(check(audit(step("1", "sort_records", params)))),
      JSON.stringify(params),
    );
  }
});

test("a param map reads the builder type's own params", () => {
  const orderBy = builderType("sort_records", "order_rows", {
    compiler: "sort_records",
    params: { sort_fields_json: "order_columns_json" },
  });
  const definitions = { order_rows: orderBy };
  assert.deepEqual(
    check(
      audit(step("1", "order_rows", { order_columns_json: sortFields })),
      definitions,
    ).blockers,
    [],
  );
  // The handler's own name is not read once the map points elsewhere.
  assert.deepEqual(
    messages(
      check(
        audit(step("1", "order_rows", { sort_fields_json: sortFields })),
        definitions,
      ),
    ),
    ["no column is chosen."],
  );
});

test("a compiler that changes rows can't sit inside an IF branch", () => {
  const ifStep = step("a", "if_then", {
    conditions_json: JSON.stringify([
      { fieldName: "F", operator: "is equal to", compareValue: "x" },
    ]),
    then_action_type: "do_not_display",
  });
  const inside = (stepType) =>
    step(
      "b",
      stepType,
      { sort_fields_json: sortFields },
      { parentId: "a", branchType: "then" },
    );
  const orderBy = builderType("sort_records", "order_rows", {
    compiler: "sort_records",
  });
  assert.deepEqual(
    messages(
      check(audit(ifStep, inside("order_rows")), { order_rows: orderBy }),
    ),
    ["steps that add or remove rows can't be inside an IF branch."],
  );
  // The same type on a compiler that keeps rows is checked as that compiler.
  const keepsRows = builderType("sort_records", "order_rows", {
    compiler: "format_field",
  });
  assert.deepEqual(
    messages(
      check(audit(ifStep, inside("order_rows")), { order_rows: keepsRows }),
    ),
    ["no field is chosen."],
  );
});

test("a builder type with no block, or an unknown compiler, is a blocker", () => {
  assert.deepEqual(
    messages(
      check(audit(step("1", "order_rows")), {
        order_rows: builderType("sort_records", "order_rows"),
      }),
    ),
    ["the step type 'order_rows' can't run in File Utility."],
  );
  assert.deepEqual(
    messages(
      check(audit(step("1", "order_rows")), {
        order_rows: builderType("sort_records", "order_rows", {
          compiler: "pivot",
        }),
      }),
    ),
    [
      "the step type 'order_rows' names the File Utility compiler 'pivot', which File Utility doesn't have.",
    ],
  );
});

test("an ELSE attaches to a builder IF type by compiler", () => {
  const decide = builderType("if_then", "decide", { compiler: "if_then" });
  const document = audit(
    step("a", "decide", {
      conditions_json: JSON.stringify([
        { fieldName: "F", operator: "is equal to", compareValue: "x" },
      ]),
      then_action_type: "do_not_display",
    }),
    step(
      "e",
      "else",
      { parent_if_step_id: "a", then_action_type: "display" },
      { parentId: "a", branchType: "else", sortOrder: 2 },
    ),
  );
  const result = check(document, { decide });
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.warnings, []);
});
