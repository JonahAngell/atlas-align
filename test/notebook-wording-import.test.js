import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";
import {
  loadStepTypeScripts,
  STEP_TYPE_ENGINE_SCRIPTS,
} from "./support/step-type-scripts.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const sandbox = {};
vm.createContext(sandbox);
// The condition operators come from the step type engine.
loadStepTypeScripts(sandbox, STEP_TYPE_ENGINE_SCRIPTS);
vm.runInContext(read("js/15j-logic-text-import.js"), sandbox);
const parse = (text) => {
  const draft = sandbox.atlasParseImportedLogicText(text);
  assert.equal(draft.ok, true, `${text}: ${draft.message}`);
  return draft;
};

test("notebook reference, union and create column lines import", () => {
  const current = parse(
    '#Reference file "DIESI-SAPL Cast List" as "Cast List CURRENT"',
  );
  assert.equal(current.stepType, "reference_source");
  assert.equal(current.params.source_file, "DIESI-SAPL Cast List");
  assert.equal(current.params.source_alias, "Cast List CURRENT");

  const previous = parse(
    `#Reference previous week's "DIESI-SAPL Cast List" file as "Cast List PREVIOUS"`,
  );
  assert.equal(previous.params.source_alias, "Cast List PREVIOUS");

  const union = parse(
    '# UNION â€œCast List CURRENTâ€ AND â€œCast List PREVIOUSâ€ as "Cast List"',
  );
  assert.equal(union.params.join_type, "UNION");
  assert.deepEqual(
    [...union.references].map((reference) => reference.token),
    ["Cast List CURRENT", "Cast List PREVIOUS", "Cast List"],
  );

  const pull = parse(
    '# Create new column "Data_Pull" in table "Cast List CURRENT" and set value to "Current"',
  );
  assert.equal(pull.params.column_name, "Data_Pull");
  assert.equal(pull.params.static_value, "Current");

  const blank = parse('# Create new column titled "Error Message"');
  assert.equal(blank.params.column_name, "Error Message");
  assert.equal(blank.params.static_value, "");
});

test("notebook duplicate and join lines import", () => {
  const duplicates = parse(
    '# IF "Cast List" column "Pers.No." value appears more than once, drop all rows where it appears',
  );
  assert.equal(duplicates.stepType, "remove_duplicates");
  assert.equal(
    duplicates.params.duplicate_action,
    "Drop all duplicated records",
  );

  const join = parse('# JOIN "Cast List" AND "IT27" on column "Pers.No."');
  assert.equal(join.stepType, "join");
  assert.equal(join.params.join_type, "INNER JOIN");
  assert.deepEqual(
    [...join.references]
      .filter((reference) => reference.kind === "field")
      .map((reference) => reference.token),
    ["Pers.No.", "Pers.No."],
  );

  const outer = parse(
    'FULL OUTER JOIN "Cast List" AND "IT27" on column "Pers.No."',
  );
  assert.equal(outer.params.join_type, "FULL OUTER JOIN");
  assert.equal(
    outer.controls.find((control) => control.id === "join_type").value,
    "FULL OUTER JOIN",
  );
});

test("multi-line notebook IF comments with NULL and NOT EQUAL import", () => {
  const draft = parse(
    [
      "# 8.1 ----------------------------------------------------------",
      '# IF "IT27" column "S" is not NULL AND',
      '# â€œCast Listâ€ column "PA" is NOT EQUAL to "2540", "3110", "4014",',
      '# THEN display text response â€œResearch IT0027â€ in newly created column "Error Message"',
    ].join("\n"),
  );
  assert.equal(draft.stepType, "if_then");
  assert.equal(draft.conditions[0].sourceToken, "IT27");
  assert.equal(draft.conditions[0].operator, "is not blank/null");
  assert.equal(draft.conditions[1].sourceToken, "Cast List");
  assert.equal(draft.conditions[1].operator, "is not equal to");
  assert.equal(draft.conditions[1].compareValue, "2540\n3110\n4014");
  assert.equal(draft.params.then_text, "Research IT0027");
  assert.equal(draft.params.then_output_column, "Error Message");

  const missing = parse(
    '# IF "IT209" column "S" is NULL, THEN text response â€œMissing IT0209â€ in newly created column "Error Message"',
  );
  assert.equal(missing.conditions[0].operator, "is blank/null");
  assert.equal(missing.params.then_action_type, "display_text");
  assert.equal(missing.params.then_text, "Missing IT0209");

  const orEqual = parse(
    'IF file "a" column "n" is greater than or equal to "5" AND file "a" column "m" is not equal to "x" THEN do not display record.',
  );
  assert.equal(orEqual.conditions[0].operator, "is greater than or equal to");
  assert.equal(orEqual.conditions[1].operator, "is not equal to");
});

test("condition-only IF lines import as parent steps", () => {
  const parent = parse(
    '# IF â€œCast Listâ€ column "Data_Pull" equals "Previous":',
  );
  assert.equal(parent.stepType, "if_then");
  assert.equal(parent.conditions[0].operator, "is equal to");
  assert.equal(parent.conditions[0].compareValue, "Previous");
  assert.equal(parent.params.then_action_type, "freeform");
  assert.equal(parent.params.then_action, "");
});

test('"or is blank" repeats the column inside an OR group', () => {
  const draft = parse(
    '# IF "IT395" column "S" is not NULL AND\n# "IT395" column "End Date" EQUALS "12/31/9999" or is blank:',
  );
  assert.equal(draft.conditions.length, 3);
  assert.deepEqual(
    [...draft.conditions].map((condition) => [
      condition.fieldToken,
      condition.operator,
    ]),
    [
      ["S", "is not blank/null"],
      ["End Date", "is equal to"],
      ["End Date", "is blank/null"],
    ],
  );
  assert.equal(draft.conditionTree[1].conditionType, "group");
  assert.equal(draft.conditionTree[1].connector, "AND");
  assert.equal(draft.conditionTree[1].groupConnector, "OR");
});

test("notebook ELSE lines import, including a mis-encoded space", () => {
  const elseText = parse(
    '# ELSE DisplayÂ text response â€œMissing IT0027â€ in newly created column "Error Message"',
  );
  assert.equal(elseText.stepType, "else");
  assert.equal(elseText.params.then_text, "Missing IT0027");
  assert.equal(parse("# ELSE:").stepType, "else");
});

test("display text reads an appended-with-separator clause", () => {
  const draft = parse(
    'IF file "a" column "n" is blank/null THEN display text response "x" in new column "E", appended with separator "; ".',
  );
  assert.equal(draft.params.then_text_separator, "; ");
  const plain = parse(
    'IF file "a" column "n" is blank/null THEN display text response "x" in new column "E".',
  );
  assert.equal("then_text_separator" in plain.params, false);
});

test("display text sentences name only a non-default separator", async () => {
  const context = await loadApp();
  const english = (item) => {
    context.__step = item;
    return vm.runInContext("ATLASStepTypeRuntime.english(__step)", context);
  };
  const step = (separator) => ({
    step_type: "else",
    params: {
      then_action_type: "display_text",
      then_text: "Research IT0395",
      then_output_column: "Error Message",
      ...(separator === undefined ? {} : { then_text_separator: separator }),
    },
  });
  assert.equal(
    english(step()),
    'ELSE display text response "Research IT0395" in new column "Error Message".',
  );
  assert.equal(
    english(step("||")),
    english(step()),
  );
  const custom = english(step(" | "));
  assert.equal(
    custom,
    'ELSE display text response "Research IT0395" in new column "Error Message", appended with separator " | ".',
  );
  assert.equal(parse(custom).params.then_text_separator, " | ");
});
