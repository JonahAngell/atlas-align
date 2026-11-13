import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function loadPhraseCatalog() {
  let next = 0;
  const context = {
    state: { audit: { sources: [], steps: [] } },
    uid: (prefix) => `${prefix}_${++next}`,
    sourceAliasFor: (source) => source,
    console,
  };
  vm.createContext(context);
  vm.runInContext(read("js/07-phrase-catalog.js"), context);
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  return context;
}

const leaf = (id, field, value, connector = "AND") => ({
  id,
  connector,
  sourceFile: "sap",
  sourceAlias: "sap",
  fieldName: field,
  operator: "is equal to",
  valueMode: "values",
  compareValue: value,
});

// IF x = y AND: (z = q OR r = l OR ALL OF: (a = 1 AND b = 2))
const tree = () => [
  leaf("c1", "x", "y", "IF"),
  {
    id: "g1",
    conditionType: "group",
    connector: "AND",
    groupConnector: "OR",
    items: [
      leaf("c2", "z", "q", "OR"),
      leaf("c3", "r", "l", "OR"),
      {
        id: "g2",
        conditionType: "group",
        connector: "OR",
        groupConnector: "AND",
        items: [leaf("c4", "a", "1"), leaf("c5", "b", "2")],
      },
    ],
  },
];

const stepWith = (conditions) => ({
  step_type: "if_then",
  params: { conditions_json: JSON.stringify(conditions) },
});

test("leaves are listed depth first across nested groups", () => {
  const ctx = loadPhraseCatalog();
  const ids = [...ctx.atlasConditionLeaves(tree())].map((item) => item.id);
  assert.deepEqual(ids, ["c1", "c2", "c3", "c4", "c5"]);
  assert.equal(ctx.stepConditionLeaves(stepWith(tree())).length, 5);
});

test("leaf mapping keeps the group structure", () => {
  const ctx = loadPhraseCatalog();
  const mapped = ctx.atlasMapConditionLeaves(tree(), (item) => ({
    ...item,
    sourceFile: "wb",
  }));
  assert.equal(mapped[1].conditionType, "group");
  assert.equal(mapped[1].items[2].items[1].sourceFile, "wb");
  assert.equal(ctx.atlasFindConditionNode(mapped, "c5").depth, 2);
});

test("normalizing sets IF first, group connectors inside, and drops empty groups", () => {
  const ctx = loadPhraseCatalog();
  const input = tree();
  input[0].connector = "OR";
  input[1].items[0].connector = "AND";
  input.push({
    id: "g3",
    conditionType: "group",
    connector: "AND",
    groupConnector: "OR",
    items: [],
  });
  const normalized = ctx.atlasNormalizeConditionTree(input);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].connector, "IF");
  assert.equal(normalized[1].items[0].connector, "OR");
  assert.equal(normalized[1].items[2].items[0].connector, "AND");
});

test("analyst text lists groups as indented bullets", () => {
  const ctx = loadPhraseCatalog();
  const text = ctx.conditionGroupPlain(stepWith(tree()));
  assert.equal(
    text,
    [
      'IF file "sap" column "x" is equal to "y" AND:',
      '  • file "sap" column "z" is equal to "q" OR',
      '  • file "sap" column "r" is equal to "l" OR',
      "  • ALL OF:",
      '    • file "sap" column "a" is equal to "1" AND',
      '    • file "sap" column "b" is equal to "2"',
    ].join("\n"),
  );
});

test("flat conditions keep their single-line text", () => {
  const ctx = loadPhraseCatalog();
  const text = ctx.conditionGroupPlain(
    stepWith([leaf("c1", "x", "y", "IF"), leaf("c2", "z", "q", "AND")]),
  );
  assert.equal(
    text,
    'IF file "sap" column "x" is equal to "y" AND file "sap" column "z" is equal to "q"',
  );
});

test("expressions wrap groups in parentheses", () => {
  const ctx = loadPhraseCatalog();
  const text = ctx.conditionTreeExpression(tree(), (item) => item.fieldName);
  assert.equal(text, "IF x AND (z OR r OR (a AND b))");
});

test("inversion applies De Morgan at every level", () => {
  const ctx = loadPhraseCatalog();
  const inverted = ctx.invertedConditionsForStep(stepWith(tree()));
  assert.equal(inverted[0].connector, "IF");
  assert.equal(inverted[0].operator, "is not equal to");
  assert.equal(inverted[1].connector, "OR");
  assert.equal(inverted[1].groupConnector, "AND");
  assert.equal(inverted[1].items[1].connector, "AND");
  assert.equal(inverted[1].items[2].groupConnector, "OR");
  assert.equal(inverted[1].items[2].items[0].operator, "is not equal to");
});

function loadImport() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read("js/15j-logic-text-import.js"), sandbox);
  return sandbox;
}

const cond = (field, value) =>
  `file "sap" column "${field}" is equal to "${value}"`;

test("pasted bullet text imports as nested groups", () => {
  const { atlasParseImportedLogicText, atlasImportAssembleConditionTree } =
    loadImport();
  const text = [
    `IF ${cond("x", "y")} AND:`,
    `  • ${cond("z", "q")} OR`,
    `  • ${cond("r", "l")} OR`,
    "  • ALL OF:",
    `    • ${cond("a", "1")} AND`,
    `    • ${cond("b", "2")}`,
    "THEN do not display",
  ].join("\n");
  const result = atlasParseImportedLogicText(text);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.stepType, "if_then");
  assert.equal(result.conditions.length, 5);
  const built = atlasImportAssembleConditionTree(
    result.conditionTree,
    result.conditions,
  );
  assert.equal(built.length, 2);
  assert.equal(built[1].conditionType, "group");
  assert.equal(built[1].connector, "AND");
  assert.equal(built[1].groupConnector, "OR");
  assert.equal(built[1].items[2].groupConnector, "AND");
  assert.equal(built[1].items[2].items[1].fieldName, "b");
});

test("typed parentheses import as a group", () => {
  const { atlasParseImportedLogicText } = loadImport();
  const result = atlasParseImportedLogicText(
    `IF ${cond("x", "y")} AND (${cond("z", "q")} OR ${cond("r", "l")}) THEN do not display`,
  );
  assert.equal(result.ok, true, result.message);
  assert.equal(result.conditionTree[1].groupConnector, "OR");
  assert.equal(result.conditionTree[1].items.length, 2);
});

test("mixed connectors inside one group still fail with a message", () => {
  const { atlasParseImportedLogicText } = loadImport();
  const result = atlasParseImportedLogicText(
    `IF ${cond("x", "y")} AND (${cond("z", "q")} OR ${cond("r", "l")} AND ${cond("a", "1")}) THEN do not display`,
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /Mixed AND and OR/);
});

test("step-card split view leaves bullet connectors on their own line", () => {
  const source = read("js/02-logic-rendering.js");
  assert.match(
    source,
    /\[ \\\\t\]\+\\\\b\(\$\{ATLAS_LOGIC_LINE_BREAK_CONNECTORS/,
  );
});
