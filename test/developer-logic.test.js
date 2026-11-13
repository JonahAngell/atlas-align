import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// Minimal stand-in for the builder's string transform config reader.
function stringTransformConfig(value = {}, prefix = "") {
  const get = (name, fallback = "") => value[`${prefix}${name}`] ?? fallback;
  return {
    operation: get("string_operation") || "first_characters",
    sourceFile: get("string_source_file", get("source_file", "")),
    sourceAlias: "",
    sourceField: get("string_source_field", ""),
    count: get("string_character_count", ""),
    destinationColumn: get("target_column", get("column_name", "")),
  };
}

function load({ steps = [], sources = [], fields = {} } = {}) {
  let next = 0;
  const context = {
    state: { audit: { sources, steps, fields: [] } },
    uid: (prefix) => `${prefix}_${++next}`,
    sourceAliasFor: (source) => source,
    fieldsForSource: (source) => fields[source] || [],
    stepNumberFor: (id) => ({ if1: "3", if2: "5" })[id] || "",
    atlasStringTransformConfig: stringTransformConfig,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    console,
  };
  vm.createContext(context);
  for (const file of [
    "js/07-phrase-catalog.js",
    "js/02-logic-rendering.js",
    "js/02b-developer-formulas.js",
  ])
    vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  return context;
}

const leaf = (fieldName, operator, compareValue, extra = {}) => ({
  connector: "AND",
  sourceFile: "wd",
  sourceAlias: "wd",
  fieldName,
  operator,
  valueMode: "values",
  compareValue,
  ...extra,
});

const ifStep = (conditions, params = {}, id = "if1") => ({
  id,
  step_type: "if_then",
  params: {
    conditions_json: JSON.stringify(
      conditions.map((item, index) =>
        index === 0 ? { ...item, connector: "IF" } : item,
      ),
    ),
    ...params,
  },
});

const setValue = {
  then_action_type: "set_column_value",
  then_target_column: "Result",
  then_value_field: "Salary",
};

function formulas(ctx, step) {
  const result = ctx.atlasDeveloperFormulas(step);
  assert.ok(result, `formulas for ${step.step_type}`);
  return result;
}

test("developer logic shows Excel, SQL Server, and Python sections", () => {
  const ctx = load();
  const text = ctx.developerLogic(
    ifStep([leaf("Status", "is equal to", "Active")], setValue),
  );
  assert.match(text, /^Excel:\n=IF\(/);
  assert.match(text, /\n\nSQL Server:\nCASE WHEN /);
  assert.match(text, /\n\nPython \(pandas\):\nmask = /);
});

test("IF with a value action builds IF / CASE WHEN / df.loc formulas", () => {
  const ctx = load();
  const result = formulas(
    ctx,
    ifStep([leaf("Status", "is equal to", "Active")], setValue),
  );
  assert.equal(result.excel, '=IF([@[Status]]="Active", [@[Salary]], "")');
  assert.equal(
    result.sql,
    "CASE WHEN [Status] = 'Active' THEN [Salary] END AS [Result]",
  );
  assert.equal(
    result.python,
    'mask = df["Status"] == "Active"\ndf.loc[mask, "Result"] = df["Salary"]',
  );
});

test("multiple values use IN / isin / OR and NOT IN / AND", () => {
  const ctx = load();
  const equal = formulas(
    ctx,
    ifStep([leaf("Country", "is equal to", "US\nCA")], setValue),
  );
  assert.match(
    equal.excel,
    /OR\(\[@\[Country\]\]="US", \[@\[Country\]\]="CA"\)/,
  );
  assert.match(equal.sql, /\[Country\] IN \('US', 'CA'\)/);
  assert.match(equal.python, /df\["Country"\]\.isin\(\["US", "CA"\]\)/);

  const notEqual = formulas(
    ctx,
    ifStep([leaf("Country", "is not equal to", "US\nCA")], setValue),
  );
  assert.match(
    notEqual.excel,
    /AND\(\[@\[Country\]\]<>"US", \[@\[Country\]\]<>"CA"\)/,
  );
  assert.match(notEqual.sql, /\[Country\] NOT IN \('US', 'CA'\)/);
  assert.match(notEqual.python, /~df\["Country"\]\.isin\(\["US", "CA"\]\)/);
});

test("text values are quoted and escaped for each dialect", () => {
  const ctx = load();
  const result = formulas(
    ctx,
    ifStep([leaf("Name", "is equal to", `O'Brien "Jr"`)], setValue),
  );
  assert.match(result.excel, /\[@\[Name\]\]="O'Brien ""Jr"""/);
  assert.match(result.sql, /\[Name\] = 'O''Brien "Jr"'/);
  assert.match(result.python, /df\["Name"\] == "O'Brien \\"Jr\\""/);
});

test("numbers are unquoted for numeric fields and < / > but codes stay text", () => {
  const ctx = load({
    fields: { wd: [{ fieldName: "Amount", fieldType: "number" }] },
  });
  const numericField = formulas(
    ctx,
    ifStep([leaf("Amount", "is not equal to", "0")], setValue),
  );
  assert.match(numericField.sql, /\[Amount\] <> 0 THEN/);
  assert.match(numericField.excel, /\[@\[Amount\]\]<>0,/);

  const code = formulas(
    ctx,
    ifStep([leaf("CoCd", "is equal to", "1016")], setValue),
  );
  assert.match(code.sql, /\[CoCd\] = '1016'/);

  const relational = formulas(
    ctx,
    ifStep([leaf("Hours", "is greater than", "040")], setValue),
  );
  assert.match(relational.sql, /\[Hours\] > 40 THEN/);
  assert.match(relational.python, /df\["Hours"\] > 40/);
});

test("blank checks use TRIM in Excel, NULLIF in SQL, and strip in pandas", () => {
  const ctx = load();
  const result = formulas(
    ctx,
    ifStep(
      [
        leaf("Plan", "is blank", "", { valueMode: "blank" }),
        leaf("Code", "is not blank", "", { valueMode: "blank" }),
      ],
      setValue,
    ),
  );
  assert.match(
    result.excel,
    /AND\(LEN\(TRIM\(\[@\[Plan\]\]\)\)=0, LEN\(TRIM\(\[@\[Code\]\]\)\)>0\)/,
  );
  assert.match(
    result.sql,
    /NULLIF\(LTRIM\(RTRIM\(\[Plan\]\)\), ''\) IS NULL AND NULLIF\(LTRIM\(RTRIM\(\[Code\]\)\), ''\) IS NOT NULL/,
  );
  assert.match(
    result.python,
    /df\["Plan"\]\.fillna\(""\)\.astype\(str\)\.str\.strip\(\)\.eq\(""\)/,
  );
});

test("text matches escape wildcards and negate every value", () => {
  const ctx = load();
  const contains = formulas(
    ctx,
    ifStep([leaf("Note", "contains", "50%_off*")], setValue),
  );
  assert.match(
    contains.excel,
    /ISNUMBER\(SEARCH\("50%_off~\*", \[@\[Note\]\]\)\)/,
  );
  assert.match(contains.sql, /\[Note\] LIKE '%50\[%\]\[_\]off\*%'/);
  assert.match(
    contains.python,
    /str\.contains\("50%_off\*", case=False, regex=False\)/,
  );

  const notStarts = formulas(
    ctx,
    ifStep([leaf("Code", "does not start with", "A\nB")], setValue),
  );
  assert.match(
    notStarts.excel,
    /AND\(NOT\(LEFT\(\[@\[Code\]\], 1\)="A"\), NOT\(LEFT\(\[@\[Code\]\], 1\)="B"\)\)/,
  );
  assert.match(
    notStarts.sql,
    /WHEN \[Code\] NOT LIKE 'A%' AND \[Code\] NOT LIKE 'B%' THEN/,
  );
});

test("AND binds before OR and bullet groups keep their own connector", () => {
  const ctx = load();
  const result = formulas(
    ctx,
    ifStep(
      [
        leaf("A", "is equal to", "1"),
        leaf("B", "is equal to", "2"),
        leaf("C", "is equal to", "3", { connector: "OR" }),
        {
          conditionType: "group",
          connector: "AND",
          groupConnector: "OR",
          items: [leaf("D", "is equal to", "4"), leaf("E", "is equal to", "5")],
        },
      ],
      setValue,
    ),
  );
  assert.equal(
    result.excel,
    '=IF(OR(AND([@[A]]="1", [@[B]]="2"), AND([@[C]]="3", OR([@[D]]="4", [@[E]]="5"))), [@[Salary]], "")',
  );
  assert.match(
    result.sql,
    /^CASE WHEN \(\[A\] = '1' AND \[B\] = '2'\) OR \(\[C\] = '3' AND \(\[D\] = '4' OR \[E\] = '5'\)\) THEN/,
  );
  assert.match(
    result.python,
    /^mask = \(\(df\["A"\] == "1"\) & \(df\["B"\] == "2"\)\) \| \(\(df\["C"\] == "3"\) & \(\(df\["D"\] == "4"\) \| \(df\["E"\] == "5"\)\)\)/,
  );
});

test("Display and Do Not Display become keep-row filters", () => {
  const ctx = load();
  const hide = formulas(
    ctx,
    ifStep([leaf("Active", "is equal to", "No")], {
      then_action_type: "do_not_display",
    }),
  );
  assert.equal(hide.excel, '=NOT([@[Active]]="No")');
  assert.equal(hide.sql, "WHERE NOT ([Active] = 'No')");
  assert.equal(hide.python, 'mask = df["Active"] == "No"\ndf = df[~mask]');

  const show = formulas(
    ctx,
    ifStep([leaf("Active", "is equal to", "Yes")], {
      then_action_type: "display",
    }),
  );
  assert.equal(show.sql, "WHERE [Active] = 'Yes'");
  assert.match(show.python, /df = df\[mask\]$/);
});

test("display text writes the message into the output column", () => {
  const ctx = load();
  const result = formulas(
    ctx,
    ifStep([leaf("Plan", "is equal to", "Bonus")], {
      then_action_type: "display_text",
      then_text: "Check plan",
      then_output_column: "Error Message",
    }),
  );
  assert.equal(result.excel, '=IF([@[Plan]]="Bonus", "Check plan", "")');
  assert.equal(
    result.sql,
    "CASE WHEN [Plan] = 'Bonus' THEN 'Check plan' END AS [Error Message]",
  );
  assert.match(
    result.python,
    /df\.loc\[mask, "Error Message"\] = "Check plan"$/,
  );
});

test("an ELSE writing the same column folds into the IF formulas", () => {
  const parent = ifStep([leaf("Plan", "is equal to", "Bonus")], {
    then_action_type: "display_text",
    then_text: "Bonus plan",
    then_output_column: "Error Message",
    include_else_branch: "Yes",
  });
  const elseStep = {
    id: "if1::else",
    step_type: "else",
    params: {
      managed_else_branch: "Yes",
      parent_if_step_id: "if1",
      then_action_type: "display_text",
      then_text: "Other plan",
      then_output_column: "Error Message",
    },
  };
  const ctx = load({ steps: [parent, elseStep] });
  const result = formulas(ctx, parent);
  assert.equal(
    result.excel,
    '=IF([@[Plan]]="Bonus", "Bonus plan", "Other plan")',
  );
  assert.match(result.sql, /THEN 'Bonus plan' ELSE 'Other plan' END/);
  assert.match(
    result.python,
    /df\.loc\[~mask, "Error Message"\] = "Other plan"$/,
  );
  assert.equal(
    ctx.developerLogic(elseStep),
    "ELSE (Step 3): included in the Step 3 formulas.",
  );
});

test("an ELSE with its own action negates the parent condition", () => {
  const parent = ifStep([leaf("Plan", "is equal to", "Bonus")], {
    then_action_type: "freeform",
    include_else_branch: "Yes",
  });
  const elseStep = {
    id: "if1::else",
    step_type: "else",
    params: {
      parent_if_step_id: "if1",
      then_action_type: "do_not_display",
    },
  };
  const ctx = load({ steps: [parent, elseStep] });
  const result = formulas(ctx, elseStep);
  assert.equal(result.lead, "ELSE (Step 3)");
  assert.equal(result.excel, '=[@[Plan]]="Bonus"');
  assert.equal(result.sql, "WHERE [Plan] = 'Bonus'");
});

test("create column covers static, concatenate, and string modes", () => {
  const ctx = load();
  const staticValue = formulas(ctx, {
    step_type: "create_column",
    params: {
      column_name: "Flag",
      value_mode: "Static value",
      static_value: "Y",
    },
  });
  assert.equal(staticValue.excel, '="Y"');
  assert.equal(staticValue.sql, "'Y' AS [Flag]");
  assert.equal(staticValue.python, 'df["Flag"] = "Y"');

  const blank = formulas(ctx, {
    step_type: "create_column",
    params: { column_name: "Calc", value_mode: "Static value" },
  });
  assert.equal(blank.sql, "NULL AS [Calc]");
  assert.equal(blank.python, 'df["Calc"] = pd.NA');

  const concat = formulas(ctx, {
    step_type: "create_column",
    params: {
      column_name: "Key",
      value_mode: "Concatenate fields",
      concat_field_1: "ID",
      concat_field_2: "Position",
    },
  });
  assert.equal(concat.excel, "=[@[ID]]&[@[Position]]");
  assert.equal(concat.sql, "CONCAT([ID], [Position]) AS [Key]");

  const last = formulas(ctx, {
    step_type: "create_column",
    params: {
      column_name: "Suffix",
      value_mode: "String transformation",
      string_operation: "last_characters",
      string_source_field: "Code",
      string_character_count: "3",
    },
  });
  assert.equal(last.excel, "=RIGHT([@[Code]], 3)");
  assert.equal(last.sql, "RIGHT([Code], 3) AS [Suffix]");
  assert.equal(
    last.python,
    'df["Suffix"] = df["Code"].astype("string").str[-3:]',
  );
});

test("calculations guard division and round the same way in every dialect", () => {
  const ctx = load();
  const result = formulas(ctx, {
    step_type: "create_column",
    params: {
      column_name: "Rate",
      value_mode: "Source field value",
      field_name: "Pay",
      source_math_json: JSON.stringify([
        { operator: "/", operandType: "field", operandFieldName: "Hours" },
      ]),
      rounding_mode: "down",
      rounding_decimal_places: "2",
    },
  });
  assert.equal(
    result.excel,
    '=IFERROR(ROUNDDOWN([@[Pay]] / [@[Hours]], 2), "")',
  );
  assert.equal(result.sql, "ROUND([Pay] / NULLIF([Hours], 0), 2, 1) AS [Rate]");
  assert.equal(
    result.python,
    'df["Rate"] = np.trunc((df["Pay"] / df["Hours"].replace(0, np.nan)) * 10**2) / 10**2',
  );

  const up = formulas(ctx, {
    step_type: "create_column",
    params: {
      column_name: "Whole",
      value_mode: "Source field value",
      field_name: "Pay",
      rounding_mode: "up",
    },
  });
  assert.equal(up.sql, "SIGN([Pay]) * CEILING(ABS([Pay])) AS [Whole]");
  assert.equal(
    up.python,
    'df["Whole"] = np.sign(df["Pay"]) * np.ceil(np.abs(df["Pay"]))',
  );
});

test("joins and unions produce merge, XLOOKUP, and JOIN formulas", () => {
  const ctx = load();
  const join = formulas(ctx, {
    step_type: "join",
    params: {
      join_type: "LEFT JOIN",
      left_source: "wd",
      right_source: "sap",
      join_keys_json: JSON.stringify([
        { id: "k1", left_field: "ID", right_field: "PERNR" },
        { id: "k2", left_field: "Pos", right_field: "Plans" },
      ]),
      left_field: "ID",
      right_field: "PERNR",
    },
  });
  assert.match(join.lead, /^LEFT JOIN: keep all rows from the left source/);
  assert.equal(
    join.sql,
    "FROM [wd]\nLEFT JOIN [sap]\n  ON [wd].[ID] = [sap].[PERNR] AND [wd].[Pos] = [sap].[Plans]",
  );
  assert.equal(
    join.excel,
    '=XLOOKUP(1, (sap[PERNR]=[@[ID]])*(sap[Plans]=[@[Pos]]), sap, "")',
  );
  assert.equal(
    join.python,
    'df = sources["wd"].merge(sources["sap"], how="left", left_on=["ID", "Pos"], right_on=["PERNR", "Plans"])',
  );

  const union = formulas(ctx, {
    step_type: "join",
    params: { join_type: "UNION", left_source: "a.x", right_source: "b.y" },
  });
  assert.equal(union.excel, "=VSTACK(a_x, b_y)");
  assert.equal(
    union.sql,
    "SELECT * FROM [a.x]\nUNION ALL\nSELECT * FROM [b.y]",
  );
});

test("sort, remove duplicates, format, and split steps have formulas", () => {
  const ctx = load();
  const sort = formulas(ctx, {
    step_type: "sort_records",
    params: {
      source_file: "wd",
      sort_fields_json: JSON.stringify([
        {
          id: "s1",
          sourceFile: "wd",
          fieldName: "Date",
          direction: "Descending",
        },
        { id: "s2", sourceFile: "wd", fieldName: "ID", direction: "Ascending" },
      ]),
    },
  });
  assert.equal(sort.excel, "=SORTBY(wd, wd[Date], -1, wd[ID], 1)");
  assert.equal(sort.sql, "ORDER BY [Date] DESC, [ID] ASC");
  assert.equal(
    sort.python,
    'df = df.sort_values(["Date", "ID"], ascending=[False, True], kind="stable")',
  );

  const dedupe = formulas(ctx, {
    step_type: "remove_duplicates",
    params: {
      source_file: "wd",
      duplicate_fields_json: JSON.stringify([
        { sourceFile: "wd", fieldName: "ID" },
      ]),
      duplicate_action: "Drop all duplicated records",
    },
  });
  assert.equal(dedupe.excel, "=COUNTIFS(wd[ID], [@[ID]])=1");
  assert.match(dedupe.sql, /^COUNT\(\*\) OVER \(PARTITION BY \[ID\]\)/);
  assert.equal(
    dedupe.python,
    'df = df.drop_duplicates(subset=["ID"], keep=False)',
  );

  const format = formulas(ctx, {
    step_type: "format_field",
    params: { field_name: "PERNR", format: "eight digits with leading zeroes" },
  });
  assert.equal(format.excel, '=TEXT([@[PERNR]], "00000000")');
  assert.equal(
    format.python,
    'df["PERNR"] = df["PERNR"].astype("string").str.zfill(8)',
  );

  const date = formulas(ctx, {
    step_type: "format_field",
    params: { field_name: "Hired", format: "date format MM/DD/YYYY" },
  });
  assert.equal(
    date.sql,
    "CONVERT(VARCHAR(10), TRY_CONVERT(date, [Hired]), 101) AS [Hired]",
  );

  const split = formulas(ctx, {
    step_type: "split_field",
    params: {
      field_name: "Full Name",
      split_on: "comma",
      split_part: "last value",
      output_column: "First",
    },
  });
  assert.equal(split.excel, '=TAKE(TEXTSPLIT([@[Full Name]], ","), , -1)');
  assert.equal(
    split.python,
    'df["First"] = df["Full Name"].astype("string").str.split(",", regex=False).str[-1]',
  );
});

test("SQL qualifies a field with its source only when the name is ambiguous", () => {
  const ctx = load({
    sources: [{ name: "wd" }, { name: "sap" }],
    fields: {
      wd: [{ fieldName: "ID" }, { fieldName: "Status" }],
      sap: [{ fieldName: "ID" }],
    },
  });
  const result = formulas(
    ctx,
    ifStep(
      [leaf("ID", "is equal to", "1"), leaf("Status", "is equal to", "A")],
      setValue,
    ),
  );
  assert.match(result.sql, /\[wd\]\.\[ID\] = '1' AND \[Status\] = 'A'/);
});

test("every saved step type returns developer logic", () => {
  const ctx = load();
  const steps = [
    { step_type: "reference_source", params: { source_file: "wd" } },
    { step_type: "create_column", params: { column_name: "X" } },
    { step_type: "format_field", params: { field_name: "A", format: "text" } },
    { step_type: "split_field", params: { field_name: "A", split_on: "-" } },
    { step_type: "sort_records", params: { field_name: "A" } },
    { step_type: "remove_duplicates", params: { field_name: "A" } },
    { step_type: "join", params: { left_source: "a", right_source: "b" } },
    ifStep([leaf("A", "is equal to", "1")], { then_action_type: "freeform" }),
  ];
  for (const step of steps)
    assert.match(
      ctx.developerLogic(step),
      /Excel:\n=.+\n\nSQL Server:\n.+\n\nPython \(pandas\):\n.+/s,
      step.step_type,
    );
});
