import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadStepTypeScripts } from "./support/step-type-scripts.js";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/** The string-transform config block of the builder, without its DOM wrappers. */
function stringTransformBlock() {
  const source = read("js/14-catalog-driven-builder.js");
  const start = source.indexOf("// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN");
  const end = source.indexOf("function atlasLogicFieldReferences", start);
  assert.ok(start >= 0 && end > start, "string transform block found");
  return source.slice(start, end);
}

function load() {
  const context = {
    state: { audit: { sources: [], steps: [], fields: [] } },
    uid: (prefix) => `${prefix}_1`,
    sourceAliasFor: (source) => source,
    fieldsForSource: () => [],
    normalizeCatalogStep: (step) => step,
    esc: (value) => String(value ?? ""),
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    console,
  };
  vm.createContext(context);
  for (const file of [
    "js/07-phrase-catalog.js",
    "js/02-logic-rendering.js",
    "js/02b-developer-formulas.js",
  ])
    vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(stringTransformBlock(), context, {
    filename: "js/14-catalog-driven-builder.js",
  });
  loadStepTypeScripts(context);
  vm.runInContext(read("js/15j-logic-text-import.js"), context, {
    filename: "js/15j-logic-text-import.js",
  });
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  return context;
}

const splitStep = (params = {}) => ({
  id: "split1",
  step_type: "create_column",
  params: {
    value_mode: "String transformation",
    string_operation: "split",
    string_source_file: "cast",
    string_source_alias: "sap.cast",
    string_source_field: "First Name Last Name",
    ...params,
  },
});

const firstSpace = splitStep({
  string_split_mode: "first",
  string_split_delimiter: "space",
  string_split_column_1: "First Name",
  string_split_column_2: "Last Name",
});

test("first-delimiter split names two columns", () => {
  const ctx = load();
  const config = ctx.atlasStringTransformConfig(firstSpace.params);
  assert.equal(config.delimiter, " ");
  assert.equal(config.columnCount, "2");
  assert.deepEqual([...config.outputColumns], ["First Name", "Last Name"]);
  assert.deepEqual(
    [...ctx.atlasCreatedColumnNames(firstSpace)],
    ["First Name", "Last Name"],
  );
  assert.deepEqual(
    [...ctx.atlasValidateStringTransform(firstSpace.params)],
    [],
  );
});

test("analyst sentence lists the columns and names the source", () => {
  const ctx = load();
  assert.equal(
    ctx.analystLogic(firstSpace),
    'Create new columns "First Name", "Last Name" by splitting file "sap.cast" column "First Name Last Name" on the first space.',
  );
  const custom = splitStep({
    string_split_mode: "every",
    string_split_delimiter: "custom",
    string_split_custom_delimiter: " - ",
    column_name: "Part",
  });
  assert.equal(
    ctx.analystLogic(custom),
    'Create new columns "Part_x" (one for each part) by splitting file "sap.cast" column "First Name Last Name" on each " - ".',
  );
});

test("analyst sentences import back into the same split", () => {
  const ctx = load();
  for (const step of [
    firstSpace,
    splitStep({
      string_split_mode: "last",
      string_split_delimiter: "comma",
      string_split_column_1: "Rest",
      string_split_column_2: "Suffix",
    }),
    splitStep({
      string_split_mode: "every",
      string_split_delimiter: "pipe",
      string_split_column_count: "3",
      string_split_column_1: "A",
      string_split_column_2: "B",
      string_split_column_3: "C",
    }),
    splitStep({
      string_split_mode: "every",
      string_split_delimiter: "custom",
      string_split_custom_delimiter: " - ",
      column_name: "Part",
    }),
  ]) {
    const sentence = ctx.analystLogic(step);
    const draft = ctx.atlasParseImportedLogicText(sentence);
    assert.equal(draft.ok, true, `${sentence}: ${draft.message}`);
    assert.equal(draft.stepType, "create_column");
    const roundTrip = {
      ...step,
      params: {
        ...draft.params,
        string_source_file: "cast",
        string_source_alias: "sap.cast",
        string_source_field: "First Name Last Name",
      },
    };
    assert.equal(ctx.analystLogic(roundTrip), sentence);
  }
});

test("first and last delimiter formulas leave a missing part blank", () => {
  const ctx = load();
  const first = ctx.atlasDeveloperFormulas(firstSpace);
  assert.equal(
    first.excel,
    [
      'First Name: =IFERROR(TEXTBEFORE([@[First Name Last Name]], " "), [@[First Name Last Name]])',
      'Last Name: =IFERROR(TEXTAFTER([@[First Name Last Name]], " "), "")',
    ].join("\n"),
  );
  assert.match(
    first.sql,
    /LEFT\(\[First Name Last Name\], CHARINDEX\(' ', \[First Name Last Name\] \+ ' '\) - 1\) AS \[First Name\],\n/,
  );
  assert.match(
    first.sql,
    /SUBSTRING\(\[First Name Last Name\], CHARINDEX\(' ', \[First Name Last Name\]\) \+ 1, 4000\) ELSE '' END AS \[Last Name\]$/,
  );
  assert.equal(
    first.python,
    [
      'df["First Name"] = df["First Name Last Name"].astype("string").str.split(" ", n=1, regex=False).str[0]',
      'df["Last Name"] = df["First Name Last Name"].astype("string").str.split(" ", n=1, regex=False).str[1].fillna("")',
    ].join("\n"),
  );
  const last = ctx.atlasDeveloperFormulas(
    splitStep({
      string_split_mode: "last",
      string_split_delimiter: "space",
      string_split_column_1: "Given",
      string_split_column_2: "Family",
    }),
  );
  assert.match(
    last.excel,
    /TEXTBEFORE\(\[@\[First Name Last Name\]\], " ", -1\)/,
  );
  assert.match(
    last.python,
    /\.str\.rsplit\(" ", n=1\)\.str\[1\]\.fillna\(""\)/,
  );
});

test("each-delimiter formulas pick parts by position or number columns", () => {
  const ctx = load();
  const named = ctx.atlasDeveloperFormulas(
    splitStep({
      string_split_mode: "every",
      string_split_delimiter: "comma",
      string_split_column_count: "2",
      string_split_column_1: "A",
      string_split_column_2: "B",
    }),
  );
  assert.match(
    named.excel,
    /^A: =IFERROR\(INDEX\(TEXTSPLIT\(\[@\[First Name Last Name\]\], ","\), 1, 1\), ""\)/,
  );
  assert.match(
    named.sql,
    /STRING_SPLIT\(\[First Name Last Name\], ',', 1\) WHERE \[ordinal\] = 2\), ''\) AS \[B\]/,
  );
  assert.match(named.python, /\.str\[1\]\.fillna\(""\)$/);

  const numbered = ctx.atlasDeveloperFormulas(
    splitStep({
      string_split_mode: "every",
      string_split_delimiter: "tab",
      column_name: "Part",
    }),
  );
  assert.equal(
    numbered.excel,
    "=TEXTSPLIT([@[First Name Last Name]], CHAR(9))",
  );
  assert.match(
    numbered.python,
    /split_parts\.columns = \["Part_" \+ str\(i \+ 1\)/,
  );
  assert.ok(numbered.notes.some((note) => /Part_1, Part_2/.test(note)));
});

test("split validation reports missing delimiters and column names", () => {
  const ctx = load();
  const codes = (params) =>
    [...ctx.atlasValidateStringTransform(splitStep(params).params)].map(
      (issue) => issue.code,
    );
  assert.deepEqual(
    codes({
      string_split_mode: "first",
      string_split_delimiter: "custom",
      string_split_custom_delimiter: "",
      string_split_column_1: "A",
      string_split_column_2: "A",
    }),
    ["string_split_delimiter", "string_split_column"],
  );
  assert.deepEqual(codes({ string_split_mode: "every" }), [
    "string_destination",
  ]);
});
