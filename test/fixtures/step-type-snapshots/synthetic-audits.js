/**
 * Synthetic audits for the step type snapshots.
 *
 * The sample audits in audits/ cover the common step forms. These audits add
 * every subtype and legacy form they leave out, so the snapshots pin the
 * behavior of each one before step types move into definitions.
 */

const source = (id, name, alias, color) => ({
  id,
  name,
  sourceFile: name,
  alias,
  color,
});

const SOURCES = [
  source("source_wd", "WD_Workers", "wd", "#b3f5ff"),
  source("source_sap", "SAP_HI0256", "sap", "#abf5d1"),
];

let order = 0;
function step(id, stepType, params = {}, extra = {}) {
  order += 1;
  return {
    id,
    enabled: true,
    parentId: null,
    branchType: "root",
    sortOrder: order,
    step_type: stepType,
    notes: "",
    conditions: [],
    params,
    ...extra,
  };
}

function leaf(fieldName, operator, compareValue, extra = {}) {
  return {
    connector: "AND",
    conditionType: "row_compare",
    sourceFile: "wd",
    sourceAlias: "wd",
    fieldName,
    operator,
    valueMode: "values",
    compareValue,
    ...extra,
  };
}

function ifThen(id, conditions, params = {}, extra = {}) {
  const [first, ...rest] = conditions;
  return step(
    id,
    "if_then",
    {
      conditions_json: JSON.stringify([{ ...first, connector: "IF" }, ...rest]),
      ...params,
    },
    extra,
  );
}

function audit(id, name, steps) {
  order = 0;
  return {
    schemaVersion: 1,
    sourceKind: "repo",
    id,
    name,
    purpose: `Synthetic snapshot audit: ${name}.`,
    sources: SOURCES.map((item) => ({ ...item })),
    fields: [],
    steps: steps(),
  };
}

const reference = () =>
  step("ref-wd", "reference_source", { source_file: "wd", source_alias: "wd" });

export const SYNTHETIC_AUDITS = [
  audit("synthetic-create-column", "Create Column subtypes", () => [
    reference(),
    step("static", "create_column", {
      column_name: "Flag",
      value_mode: "Static value",
      static_value: "Y",
    }),
    step("blank", "create_column", {
      column_name: "Empty",
      value_mode: "Static value",
    }),
    step("copy", "create_column", {
      column_name: "Worker Copy",
      value_mode: "Source field value",
      source_file: "wd",
      field_name: "Worker ID",
    }),
    step("calc-divide", "create_column", {
      column_name: "Rate",
      value_mode: "Source field value",
      source_file: "wd",
      field_name: "Pay",
      source_math_json: JSON.stringify([
        { operator: "/", operandType: "field", operandFieldName: "Hours" },
      ]),
      rounding_mode: "down",
      rounding_decimal_places: "2",
    }),
    step("calc-chain", "create_column", {
      column_name: "Adjusted",
      value_mode: "Source field value",
      source_file: "wd",
      field_name: "Pay",
      source_math_json: JSON.stringify([
        { operator: "+", operandType: "number", operand: "10" },
        { operator: "*", operandType: "number", operand: "1.5" },
        { operator: "-", operandType: "field", operandFieldName: "Bonus" },
      ]),
      rounding_mode: "nearest",
      rounding_decimal_places: "1",
    }),
    step("round-up", "create_column", {
      column_name: "Whole",
      value_mode: "Source field value",
      source_file: "wd",
      field_name: "Pay",
      rounding_mode: "up",
    }),
    step("concat", "create_column", {
      column_name: "Key",
      value_mode: "Concatenate fields",
      concat_source_1: "wd",
      concat_field_1: "Worker ID",
      concat_source_2: "sap",
      concat_field_2: "PERNR",
    }),
    step("first-chars", "create_column", {
      column_name: "Prefix",
      value_mode: "String transformation",
      string_operation: "first_characters",
      string_source_file: "wd",
      string_source_field: "Cost Center",
      string_character_count: "4",
    }),
    step("last-chars", "create_column", {
      column_name: "Suffix",
      value_mode: "String transformation",
      string_operation: "last_characters",
      string_source_file: "wd",
      string_source_field: "Cost Center",
      string_character_count: "3",
    }),
    step("char-count", "create_column", {
      column_name: "Name Length",
      value_mode: "String transformation",
      string_operation: "character_count",
      string_source_file: "wd",
      string_source_field: "Legal Name",
    }),
    step("split-every", "create_column", {
      value_mode: "String transformation",
      string_operation: "split",
      string_split_mode: "every",
      string_split_delimiter: "comma",
      string_source_file: "wd",
      string_source_field: "Tags",
      column_name: "Tag",
    }),
    step("split-first", "create_column", {
      value_mode: "String transformation",
      string_operation: "split",
      string_split_mode: "first",
      string_split_delimiter: "space",
      string_source_file: "wd",
      string_source_field: "Legal Name",
      string_split_column_1: "First Name",
      string_split_column_2: "Last Name",
    }),
    step("split-last-custom", "create_column", {
      value_mode: "String transformation",
      string_operation: "split",
      string_split_mode: "last",
      string_split_delimiter: "custom",
      string_split_custom_delimiter: "::",
      string_source_file: "wd",
      string_source_field: "Path",
      string_split_column_1: "Parent",
      string_split_column_2: "Leaf",
    }),
    step("legacy-expression", "create_column", {
      column_name: "Expr",
      value_mode: "Expression / calculation",
      expression_type: "custom_expression",
      expression: "[Pay] * 12",
    }),
    step("legacy-expression-first", "create_column", {
      column_name: "Expr First",
      value_mode: "Expression / calculation",
      expression_type: "first_characters",
      source_file: "wd",
      expression_source_field: "Cost Center",
      character_count: "2",
    }),
    step("legacy-concat-shared-source", "create_column", {
      column_name: "Legacy Key",
      value_mode: "Concatenate fields",
      source_file: "wd",
      concat_field_1: "Worker ID",
      concat_field_2: "Position",
    }),
  ]),

  audit("synthetic-if-then", "IF THEN conditions and actions", () => [
    reference(),
    ifThen("values", [leaf("Status", "is equal to", "T\nR")], {
      then_action_type: "display",
    }),
    ifThen(
      "blank-and-field",
      [
        leaf("Plan", "is blank", "", { valueMode: "blank" }),
        leaf("Manager", "is not equal to", "", {
          valueMode: "field",
          compareFieldName: "PERNR",
          compareSourceFile: "sap",
          compareSourceAlias: "sap",
        }),
      ],
      { then_action_type: "do_not_display" },
    ),
    ifThen(
      "text-matches",
      [
        leaf("Note", "contains", "50%_off*"),
        leaf("Code", "does not start with", "A\nB", { connector: "OR" }),
        leaf("Code", "ends with", "Z"),
      ],
      {
        then_action_type: "display_text",
        then_text: "Check code",
        then_output_column: "Error Message",
        then_text_separator: "; ",
      },
    ),
    ifThen(
      "groups",
      [
        leaf("A", "is equal to", "1"),
        leaf("B", "is greater than", "040"),
        leaf("C", "is equal to", "3", { connector: "OR" }),
        {
          conditionType: "group",
          connector: "AND",
          groupConnector: "OR",
          items: [
            leaf("D", "is less than or equal to", "4"),
            leaf("E", "does not contain", "x"),
          ],
        },
      ],
      {
        then_action_type: "set_column_value",
        then_target_column: "Salary Check",
        then_value_source_file: "wd",
        then_value_field: "Salary",
      },
    ),
    ifThen(
      "expression-compare",
      [
        leaf("Pay", "is greater than", "", {
          valueMode: "expression",
          expression: "[Hours] * 20",
        }),
      ],
      {
        then_action_type: "set_column_calculation",
        then_target_column: "Overpay",
        then_value_source_file: "wd",
        then_value_field: "Pay",
        then_math_json: JSON.stringify([
          { operator: "-", operandType: "field", operandFieldName: "Hours" },
        ]),
        then_rounding_mode: "nearest",
        then_rounding_decimal_places: "0",
      },
    ),
    ifThen(
      "string-action",
      [leaf("Country", "is not blank", "", { valueMode: "blank" })],
      {
        then_action_type: "set_column_string_transform",
        then_target_column: "Country Short",
        then_string_operation: "first_characters",
        then_string_source_file: "wd",
        then_string_source_field: "Country",
        then_string_character_count: "2",
      },
    ),
    ifThen("freeform", [leaf("Region", "is equal to", "EMEA")], {
      then_action_type: "freeform",
      then_action: "Route to the EMEA review queue",
    }),
    ifThen("with-else", [leaf("Plan", "is equal to", "Bonus")], {
      then_action_type: "display_text",
      then_text: "Bonus plan",
      then_output_column: "Error Message",
      include_else_branch: "Yes",
    }),
    step(
      "with-else::else",
      "else",
      {
        managed_else_branch: "Yes",
        parent_if_step_id: "with-else",
        then_action_type: "display_text",
        then_text: "Other plan",
        then_output_column: "Error Message",
      },
      { parentId: "with-else", branchType: "else" },
    ),
    ifThen("else-own-action", [leaf("Grade", "is equal to", "A")], {
      then_action_type: "freeform",
      include_else_branch: "Yes",
    }),
    step(
      "else-own-action::else",
      "else",
      {
        parent_if_step_id: "else-own-action",
        then_action_type: "do_not_display",
      },
      { parentId: "else-own-action", branchType: "else" },
    ),
    ifThen("parent-gate", [leaf("Active", "is equal to", "Yes")], {}),
    ifThen(
      "child-condition",
      [leaf("Type", "is equal to", "FT")],
      { then_action_type: "do_not_display" },
      { parentId: "parent-gate", branchType: "then" },
    ),
    step(
      "child-column",
      "create_column",
      { column_name: "Checked", value_mode: "Static value", static_value: "Y" },
      { parentId: "parent-gate", branchType: "then" },
    ),
    ifThen("inverse", [leaf("Active", "is equal to", "Yes")], {
      then_action_type: "do_not_display",
      inverse_else: "Yes",
      inverse_of_step_id: "parent-gate",
    }),
    step(
      "disabled",
      "create_column",
      { column_name: "Hidden" },
      { enabled: false },
    ),
  ]),

  audit("synthetic-join-union", "Join and Union types", () => [
    reference(),
    step("ref-sap", "reference_source", { source_file: "sap" }),
    step("inner", "join", {
      join_type: "INNER JOIN",
      left_source: "wd",
      left_alias: "wd",
      left_field: "Worker ID",
      right_source: "sap",
      right_alias: "sap",
      right_field: "PERNR",
    }),
    step("left-multi", "join", {
      join_type: "LEFT JOIN",
      left_source: "wd",
      right_source: "sap",
      left_field: "Worker ID",
      right_field: "PERNR",
      join_keys_json: JSON.stringify([
        { id: "k1", left_field: "Worker ID", right_field: "PERNR" },
        { id: "k2", left_field: "Position", right_field: "PLANS" },
      ]),
    }),
    step("right", "join", {
      join_type: "RIGHT JOIN",
      left_source: "wd",
      right_source: "sap",
      left_field: "Worker ID",
      right_field: "PERNR",
    }),
    step("full", "join", {
      join_type: "FULL OUTER JOIN",
      left_source: "wd",
      right_source: "sap",
      left_field: "Worker ID",
      right_field: "PERNR",
    }),
    step("empty-join", "join", {}),
    step("union", "join", {
      join_type: "UNION",
      left_source: "wd",
      right_source: "sap",
      output_source: "Combined",
    }),
    step("legacy-union", "union_sources", {
      union_left_source: "wd",
      union_right_source: "sap",
      output_source: "Combined Legacy",
    }),
  ]),

  audit("synthetic-transforms", "Format, sort, duplicates and legacy", () => [
    reference(),
    ...[
      "text",
      "number",
      "date format MM/DD/YYYY",
      "eight digits with leading zeroes",
      "currency with two decimals",
    ].map((format, index) =>
      step(`format-${index + 1}`, "format_field", {
        source_file: "wd",
        field_name: "Worker ID",
        format,
      }),
    ),
    step("sort-single", "sort_records", {
      source_file: "wd",
      field_name: "Hire Date",
      sort_direction: "Descending",
    }),
    step("sort-multi", "sort_records", {
      source_file: "wd",
      sort_fields_json: JSON.stringify([
        { sourceFile: "wd", fieldName: "Country", direction: "Ascending" },
        { sourceFile: "wd", fieldName: "Pay", direction: "Descending" },
      ]),
    }),
    ...[
      "Keep first record",
      "Keep last record",
      "Drop all duplicated records",
    ].map((action, index) =>
      step(`dupes-${index + 1}`, "remove_duplicates", {
        source_file: "wd",
        duplicate_action: action,
        duplicate_fields_json: JSON.stringify([
          { sourceFile: "wd", fieldName: "Worker ID" },
          { sourceFile: "wd", fieldName: "Position" },
        ]),
      }),
    ),
    step("split-legacy", "split_field", {
      source_file: "wd",
      field_name: "Legal Name",
      split_on: "space",
      split_part: "first value",
      output_column: "First Name",
    }),
    step("filter-keep", "filter_rows", {
      source_file: "wd",
      field_name: "Status",
      operator: "is equal to",
      compare_value: "Active",
      filter_action: "Keep matching rows",
    }),
    step("filter-exclude", "filter_rows", {
      source_file: "wd",
      field_name: "Status",
      operator: "is not equal to",
      compare_value: "Active",
      filter_action: "Exclude matching rows",
    }),
    step("flag-text", "flag_records", {
      source_file: "wd",
      field_name: "Email",
      operator: "is blank/null",
      flag_action: "display_text",
      message: "Missing email",
      output_column: "Error Message",
    }),
    step("flag-hide", "flag_records", {
      source_file: "wd",
      field_name: "Status",
      operator: "is equal to",
      compare_value: "Terminated",
      flag_action: "do_not_display",
    }),
    step(
      "join-note-manual",
      "join",
      {
        join_type: "LEFT JOIN",
        left_source: "wd",
        right_source: "sap",
        left_field: "Worker ID",
        right_field: "PERNR",
      },
      { notes: "Analyst wrote this note, so no automatic note." },
    ),
  ]),

  audit("synthetic-legacy-shapes", "Legacy step shapes", () => {
    const legacy = (id, type, extra = {}) => {
      const item = step(id, undefined, undefined, { type, ...extra });
      delete item.step_type;
      delete item.params;
      return item;
    };
    return [
      legacy("legacy-source", "source", {
        source: "wd",
        title: "Review source file",
      }),
      legacy("legacy-create", "create", {
        source: "wd",
        field: "Output Field",
      }),
      legacy("legacy-if", "if", {
        source: "wd",
        field: "Status",
        conditions: [
          { id: "c1", field: "Status", operator: "equals", value: "Open" },
        ],
      }),
      legacy("legacy-compare", "compare", {
        source: "wd",
        field: "Comparison",
      }),
      legacy("legacy-join", "join", { source: "wd + sap" }),
      legacy("legacy-transform", "transform", {
        source: "wd",
        field: "Status",
      }),
      legacy("legacy-unknown", "mystery", { source: "wd" }),
    ];
  }),
];
