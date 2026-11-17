import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(read("../js/22a-file-utility-readiness.js"), context);
const contract = JSON.parse(
  read("../catalogs/file-utility/executable-steps.json"),
);

// A plain-object copy, so assertions don't trip on the sandbox's prototypes.
const check = (document) =>
  JSON.parse(
    JSON.stringify(context.FileUtilityReadiness.check(document, contract)),
  );

const step = (id, stepType, params = {}, extra = {}) => ({
  id,
  step_type: stepType,
  title: `Step ${id}`,
  params,
  sortOrder: 1,
  ...extra,
});
const condition = (extra = {}) =>
  JSON.stringify([
    {
      connector: "IF",
      sourceAlias: "a",
      fieldName: "F",
      operator: "is equal to",
      valueMode: "values",
      compareValue: "x",
      ...extra,
    },
  ]);
const ifStep = (id, params = {}, extra = {}) =>
  step(
    id,
    "if_then",
    {
      conditions_json: condition(),
      then_action_type: "do_not_display",
      ...params,
    },
    extra,
  );
const audit = (...steps) => ({ sources: [], steps });
const messages = (result) => result.blockers.map((b) => b.message);

// File Utility's own verdicts for the same 19 audits (its compile report).
const verdicts = JSON.parse(
  read("./fixtures/file-utility-compile-verdicts.json"),
);

test("sample audits get File Utility's verdict and blocker step numbers", () => {
  const files = readdirSync(new URL("../audits/", import.meta.url))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(files, Object.keys(verdicts).sort());
  for (const file of files) {
    const result = check(JSON.parse(read(`../audits/${file}`)));
    assert.equal(result.runnable, verdicts[file].runnable, `${file} verdict`);
    assert.deepEqual(
      result.blockers.map((b) => b.stepNumber),
      verdicts[file].blockerSteps,
      `${file} blocker steps`,
    );
  }
});

test("an audit with no steps is not runnable", () => {
  const result = check({ steps: [] });
  assert.equal(result.runnable, false);
  assert.equal(result.blockers[0].stepNumber, "");
});

test("a runnable audit has no blockers", () => {
  const result = check(audit(ifStep("1")));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.runnable, true);
});

test("step numbers follow parentId, sortOrder and ELSE attachment", () => {
  const result = check(
    audit(
      step("b", "reference_source", {}, { sortOrder: 2 }),
      ifStep("a", {}, { sortOrder: 1 }),
      step("c", "create_column", {}, { parentId: "a", sortOrder: 1 }),
      step(
        "e",
        "else",
        { parent_if_step_id: "a", then_action_type: "set_column_value" },
        { parentId: "a", branchType: "else", sortOrder: 2 },
      ),
    ),
  );
  const byId = Object.fromEntries(result.blockers.map((b) => [b.stepId, b]));
  assert.equal(byId.b.stepNumber, "2");
  assert.equal(byId.c.stepNumber, "1.1");
  assert.equal(byId.e.stepNumber, "1.2");
  assert.equal(byId.b.title, "Step b");
});

test("unknown step types, operators, value modes, actions, modes and formats block", () => {
  const cases = [
    [step("1", "mystery_step"), /step type 'mystery_step'/],
    [
      ifStep("1", { conditions_json: condition({ operator: "sounds like" }) }),
      /operator 'sounds like' is not known/,
    ],
    [
      ifStep("1", { conditions_json: condition({ valueMode: "magic" }) }),
      /value mode 'magic'/,
    ],
    [ifStep("1", { then_action_type: "explode" }), /action 'explode'/],
    [
      step("1", "create_column", { column_name: "C", value_mode: "Telepathy" }),
      /value mode 'Telepathy'/,
    ],
    [
      step("1", "format_field", { field_name: "F", format: "roman numerals" }),
      /format 'roman numerals'/,
    ],
  ];
  for (const [input, pattern] of cases) {
    const result = check(audit(input));
    assert.equal(result.runnable, false);
    assert.match(result.blockers[0].message, pattern);
  }
});

test("accepted operators, formats and create-column modes pass", () => {
  const result = check(
    audit(
      ifStep("1", {
        conditions_json: condition({
          operator: "Is Not Blank/Null",
          valueMode: "values",
        }),
      }),
      step("2", "format_field", {
        field_name: "F",
        format: "5 digits with leading zeros",
      }),
      step("3", "format_field", { field_name: "F", format: "MM/DD/YYYY" }),
      step("4", "create_column", {
        column_name: "C",
        value_mode: "Static value",
      }),
    ),
  );
  assert.deepEqual(result.blockers, []);
});

test("blocked operators and free-text expressions block; run-date tokens pass", () => {
  assert.match(
    messages(
      check(
        audit(
          ifStep("1", {
            conditions_json: condition({ operator: "matches expression" }),
          }),
        ),
      ),
    )[0],
    /can't run yet/,
  );
  const free = check(
    audit(
      ifStep("1", {
        conditions_json: condition({
          valueMode: "expression",
          expression: "LEN(A)>3",
        }),
      }),
    ),
  );
  assert.match(free.blockers[0].message, /free-text expression/);
  for (const token of ["Today", "the run date", "report date", "run_date"]) {
    const ok = check(
      audit(
        ifStep("1", {
          conditions_json: condition({
            operator: "is less than",
            valueMode: "expression",
            expression: token,
          }),
        }),
      ),
    );
    assert.deepEqual(ok.blockers, [], token);
  }
});

test("free-form actions pass only as a container or in the two accepted patterns", () => {
  const free = (text, extra) =>
    ifStep("1", { then_action_type: "freeform", then_action: text }, extra);
  assert.match(
    messages(check(audit(free("send an email"))))[0],
    /free-form action/,
  );
  assert.equal(
    check(audit(free('DISPLAY "bad" in column "Msg"'))).runnable,
    true,
  );
  assert.equal(check(audit(free("Do Not Display"))).runnable, true);
  const container = check(audit(free("anything")));
  assert.equal(container.runnable, false);
  const withChild = check(
    audit(
      free("anything"),
      step("2", "create_column", { column_name: "C" }, { parentId: "1" }),
    ),
  );
  assert.equal(withChild.runnable, true);
  assert.ok(withChild.warnings.some((w) => /not run/.test(w.message)));
});

test("splits need a delimiter", () => {
  const split = (params) =>
    check(
      audit(
        step("1", "split_field", {
          field_name: "F",
          output_column: "O",
          ...params,
        }),
      ),
    );
  assert.match(messages(split({ split_on: "" }))[0], /no delimiter/);
  assert.equal(split({ split_on: "comma" }).runnable, true);
  assert.equal(split({ split_on: "|" }).runnable, true);
});

test("row-changing steps inside an IF branch block", () => {
  const result = check(
    audit(
      ifStep("1"),
      step(
        "2",
        "sort_records",
        { sort_fields_json: '[{"fieldName":"F"}]' },
        { parentId: "1" },
      ),
    ),
  );
  assert.deepEqual(
    result.blockers.map((b) => b.stepNumber),
    ["1.1"],
  );
  assert.match(result.blockers[0].message, /inside an IF branch/);
  assert.equal(
    check(
      audit(
        step("1", "sort_records", { sort_fields_json: '[{"fieldName":"F"}]' }),
      ),
    ).runnable,
    true,
  );
});

test("a union of a source with itself blocks", () => {
  const union = (right) =>
    check(
      audit(
        step("1", "union_sources", {
          union_left_alias: "a",
          union_right_alias: right,
          output_alias: "out",
        }),
      ),
    );
  assert.match(messages(union("a"))[0], /with itself/);
  assert.equal(union("b").runnable, true);
});

test("a blocked IF does not report its children", () => {
  const result = check(
    audit(
      ifStep("1", { then_action_type: "explode" }),
      step("2", "mystery_step", {}, { parentId: "1" }),
    ),
  );
  assert.deepEqual(
    result.blockers.map((b) => b.stepNumber),
    ["1"],
  );
});

test("disabled steps are not checked", () => {
  const result = check(
    audit(step("1", "mystery_step", {}, { enabled: false }), ifStep("2")),
  );
  assert.equal(result.runnable, true);
});

test("messages never contain condition values", () => {
  const result = check(
    audit(
      ifStep("1", {
        conditions_json: condition({
          operator: "is greater than",
          compareValue: "SECRET-1\nSECRET-2",
        }),
      }),
      ifStep("2", {
        conditions_json: condition({ compareValue: "SECRET-3, SECRET-4" }),
      }),
    ),
  );
  assert.ok(result.blockers.length + result.warnings.length > 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
