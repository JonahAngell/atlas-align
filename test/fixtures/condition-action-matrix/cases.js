/**
 * The condition and action matrix: generated audits that cover every part of
 * a condition and every action kind, for IF / THEN, ELSE, Filter Rows and
 * Flag Records.
 *
 * Phase 8 moves condition and action text and formulas from app code into
 * step type templates. These cases pin today's output first, so every later
 * branch can show nothing changed. Each case is a small audit of its own (a
 * reference step plus the step under test, and its ELSE when it has one), so
 * a difference names the case that caused it.
 *
 * Groups:
 *   conditions  every value mode and catalog operator (and unknown ones),
 *               one and several values, number and text, fields from the same
 *               and a second source, compare math, run parameters
 *   groups      nested groups and mixed connectors
 *   actions     every action kind for THEN and ELSE, separators, key-scoped
 *               do not display, folded and unfolded ELSE, inverse_else
 *   filterFlag  Filter Rows and Flag Records with each action, plus the
 *               legacy step.source / step.field shape
 */

const SOURCES = [
  { id: "source_wd", name: "WD_Workers", sourceFile: "WD_Workers", alias: "wd", color: "#b3f5ff" },
  { id: "source_sap", name: "SAP_HI0256", sourceFile: "SAP_HI0256", alias: "sap", color: "#abf5d1" },
];

/** Cataloged fields, so number fields compare as numbers. */
const FIELDS = [
  ["wd", "Status", "Text"],
  ["wd", "Code", "Text"],
  ["wd", "Pay", "Number"],
  ["wd", "Hours", "Number"],
  ["wd", "Hire Date", "Date"],
  ["wd", "Worker ID", "Text"],
  ["wd", "Country", "Text"],
  ["sap", "PERNR", "Text"],
  ["sap", "Annual Pay", "Number"],
  ["sap", "Status", "Text"],
].map(([sourceFile, name, type], index) => ({
  id: `matrix_field_${index + 1}`,
  name,
  rawFieldName: name,
  fieldName: name,
  sourceFile,
  type,
  dataType: type,
}));

const OPERATORS = {
  values: [
    "is equal to",
    "is not equal to",
    "contains",
    "does not contain",
    "starts with",
    "does not start with",
    "ends with",
    "does not end with",
    "is greater than",
    "is greater than or equal to",
    "is less than",
    "is less than or equal to",
  ],
  parameter: [
    "is equal to",
    "is not equal to",
    "is greater than",
    "is greater than or equal to",
    "is less than",
    "is less than or equal to",
  ],
  blank: ["is blank/null", "is not blank/null", "is blank", "is not blank"],
  expression: ["matches expression", "does not match expression"],
};

/** Operators no catalog lists, which every mode must still render. */
const UNKNOWN_OPERATORS = ["is between", ""];

const slug = (text) =>
  String(text || "none")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function leaf(fieldName, operator, extra = {}) {
  return {
    connector: "AND",
    conditionType: "row_compare",
    sourceFile: "wd",
    sourceAlias: "wd",
    fieldName,
    operator,
    valueMode: "values",
    compareValue: "",
    ...extra,
  };
}

/** Marks the first top-level condition IF, as the editor saves it. */
function withIf(conditions) {
  const [first, ...rest] = conditions;
  return [{ ...first, connector: "IF" }, ...rest];
}

function logicStep(id, stepType, params, extra = {}) {
  return {
    id,
    enabled: true,
    parentId: null,
    branchType: "root",
    sortOrder: 2,
    step_type: stepType,
    notes: "",
    conditions: [],
    params,
    ...extra,
  };
}

const reference = () => ({
  id: "ref-wd",
  enabled: true,
  parentId: null,
  branchType: "root",
  sortOrder: 1,
  step_type: "reference_source",
  notes: "",
  conditions: [],
  params: { source_file: "wd", source_alias: "wd" },
});

function audit(id, steps) {
  steps.forEach((item, index) => {
    item.sortOrder = index + 2;
  });
  return {
    schemaVersion: 1,
    sourceKind: "repo",
    id,
    name: `Matrix ${id}`,
    purpose: `Condition and action matrix case ${id}.`,
    sources: SOURCES.map((item) => ({ ...item })),
    fields: FIELDS.map((item) => ({ ...item })),
    steps: [reference(), ...steps],
  };
}

const DISPLAY = { then_action_type: "display" };

function ifThenCase(id, conditions, action = DISPLAY, extra = {}) {
  return audit(id, [
    logicStep(id, "if_then", {
      conditions_json: JSON.stringify(withIf(conditions)),
      ...action,
      ...extra,
    }),
  ]);
}

// ---- Conditions -------------------------------------------------------------

function conditionCases() {
  const cases = [];
  const add = (id, conditions) => cases.push(ifThenCase(`cond-${id}`, conditions));

  // Values: one and several, text and number, text and number fields.
  const valueSets = [
    ["one-text", "Status", "Active"],
    ["several-text", "Status", "Active\nLeave\nRetired"],
    ["one-number-text-field", "Code", "1016"],
    ["several-number-text-field", "Code", "1016\n2020"],
    ["one-number-number-field", "Pay", "040"],
    ["several-number-number-field", "Pay", "10\n20.5"],
    ["wildcards", "Code", "50%_off*"],
    ["quotes", "Status", `O'Brien "Jr"`],
  ];
  for (const operator of [...OPERATORS.values, ...UNKNOWN_OPERATORS])
    for (const [name, field, value] of valueSets)
      add(`values-${slug(operator)}-${name}`, [
        leaf(field, operator, { compareValue: value }),
      ]);
  add("values-empty-value", [leaf("Status", "is equal to")]);
  add("values-array-form", [
    leaf("Status", "is equal to", { compareValues: ["Active", " Leave "] }),
  ]);
  add("values-no-field", [leaf("", "is equal to", { compareValue: "X" })]);

  // Field compares: same source, a second source, and compare math.
  const fieldSets = [
    ["same-source", "Status", { compareFieldName: "Country", compareSourceFile: "wd", compareSourceAlias: "wd" }],
    ["second-source", "Status", { compareFieldName: "Status", compareSourceFile: "sap", compareSourceAlias: "sap" }],
    ["number-fields", "Pay", { compareFieldName: "Annual Pay", compareSourceFile: "sap", compareSourceAlias: "sap" }],
    [
      "math",
      "Pay",
      {
        compareFieldName: "Hours",
        compareSourceFile: "wd",
        compareSourceAlias: "wd",
        compareMathJson: JSON.stringify([
          { operator: "*", operandType: "number", operand: "20" },
          { operator: "+", operandType: "field", operandSourceFile: "sap", operandFieldName: "Annual Pay" },
        ]),
      },
    ],
    ["no-compare-field", "Status", {}],
  ];
  for (const operator of [...OPERATORS.values, ...UNKNOWN_OPERATORS])
    for (const [name, field, extra] of fieldSets)
      add(`field-${slug(operator)}-${name}`, [
        leaf(field, operator, { valueMode: "field", ...extra }),
      ]);

  // Run parameters, including an operator the run date does not allow.
  for (const operator of [...OPERATORS.parameter, "contains", ...UNKNOWN_OPERATORS])
    add(`parameter-${slug(operator)}`, [
      leaf("Hire Date", operator, { valueMode: "parameter", compareParameter: "runDate" }),
    ]);
  add("parameter-stored-as-values", [
    leaf("Hire Date", "is less than", { compareParameter: "runDate", compareValue: "Run Date" }),
  ]);
  add("parameter-unknown-name", [
    leaf("Hire Date", "is greater than", { valueMode: "parameter", compareParameter: "fiscalYear" }),
  ]);

  // Blank / null.
  for (const operator of [...OPERATORS.blank, ...UNKNOWN_OPERATORS])
    add(`blank-${slug(operator)}`, [leaf("Status", operator, { valueMode: "blank" })]);

  // Legacy expressions.
  for (const operator of [...OPERATORS.expression, ...UNKNOWN_OPERATORS])
    add(`expression-${slug(operator)}`, [
      leaf("Pay", operator, { valueMode: "expression", expression: "[Hours] * 20" }),
    ]);
  add("expression-empty", [leaf("Pay", "matches expression", { valueMode: "expression" })]);

  // A second source on the left side.
  add("left-second-source", [
    leaf("PERNR", "is equal to", { sourceFile: "sap", sourceAlias: "sap", compareValue: "100" }),
  ]);

  // No conditions at all.
  cases.push(
    audit("cond-none", [logicStep("cond-none", "if_then", { conditions_json: "[]", ...DISPLAY })]),
  );
  cases.push(
    audit("cond-bad-json", [logicStep("cond-bad-json", "if_then", { conditions_json: "{not json", ...DISPLAY })]),
  );
  return cases;
}

// ---- Groups and connectors ----------------------------------------------------

function group(groupConnector, items, connector = "AND") {
  return { conditionType: "group", connector, groupConnector, items };
}

function groupCases() {
  const a = (op = "is equal to") => leaf("Status", op, { compareValue: "A" });
  const b = (connector = "AND") => leaf("Code", "starts with", { compareValue: "B", connector });
  const c = (connector = "AND") => leaf("Pay", "is greater than", { compareValue: "3", connector });
  const d = (connector = "AND") => leaf("Country", "is blank/null", { valueMode: "blank", connector });
  const sets = [
    ["two-and", [a(), b()]],
    ["two-or", [a(), b("OR")]],
    ["and-before-or", [a(), b(), c("OR")]],
    ["or-then-and", [a(), b("OR"), c()]],
    ["mixed-four", [a(), b("OR"), c(), d("OR")]],
    ["group-all-of", [a(), group("AND", [b(), c()])]],
    ["group-any-of", [a(), group("OR", [b(), c("OR")])]],
    ["group-or-connector", [a(), group("AND", [b(), c()], "OR")]],
    ["group-of-one", [a(), group("OR", [b()])]],
    ["group-first", [group("OR", [b(), c("OR")]), a()]],
    ["only-group", [group("OR", [b(), c("OR"), d("OR")])]],
    ["empty-group", [a(), group("AND", [])]],
    [
      "nested-three-deep",
      [
        a(),
        group(
          "OR",
          [
            b(),
            group("AND", [c(), group("OR", [d(), leaf("Hours", "is less than", { compareValue: "40", connector: "OR" })])]),
          ],
          "OR",
        ),
        leaf("Worker ID", "does not contain", { compareValue: "TMP" }),
      ],
    ],
    [
      "nested-mixed-items",
      [
        group("AND", [
          group("OR", [a(), b("OR")]),
          group("OR", [c(), d("OR")]),
        ]),
        leaf("Status", "is not equal to", { valueMode: "field", compareFieldName: "Status", compareSourceFile: "sap", compareSourceAlias: "sap", connector: "OR" }),
      ],
    ],
  ];
  return sets.map(([name, conditions]) => ifThenCase(`group-${name}`, conditions));
}

// ---- Actions ------------------------------------------------------------------

const ACTIONS = [
  ["display", { then_action_type: "display" }],
  ["do-not-display", { then_action_type: "do_not_display" }],
  [
    "do-not-display-key",
    {
      then_action_type: "do_not_display",
      then_exclude_scope: "key",
      then_exclude_key_source_file: "wd",
      then_exclude_key_source_alias: "wd",
      then_exclude_key_field: "Worker ID",
    },
  ],
  [
    "do-not-display-key-fields",
    {
      then_action_type: "do_not_display",
      then_exclude_scope: "key",
      then_exclude_key_source_file: "wd",
      then_exclude_key_source_alias: "wd",
      then_exclude_key_fields_json: JSON.stringify(["Worker ID", "Country"]),
    },
  ],
  ["do-not-display-key-no-field", { then_action_type: "do_not_display", then_exclude_scope: "key" }],
  ["display-text", { then_action_type: "display_text", then_text: "Check status", then_output_column: "Error Message" }],
  ["display-text-default-column", { then_action_type: "display_text", then_text: "Check status" }],
  [
    "display-text-custom-column-separator",
    {
      then_action_type: "display_text",
      then_text: `Status "A" isn't allowed`,
      then_output_column: "Review Notes",
      then_text_separator: "; ",
    },
  ],
  [
    "display-text-default-separator",
    { then_action_type: "display_text", then_text: "Check", then_output_column: "Error Message", then_text_separator: "||" },
  ],
  ["display-text-empty", { then_action_type: "display_text" }],
  [
    "display-mode-legacy",
    { then_action_type: "display_text", then_text: "Legacy", then_display_mode: "text", then_output_column: "Flag" },
  ],
  [
    "set-value",
    { then_action_type: "set_column_value", then_target_column: "Pay Check", then_value_source_file: "wd", then_value_field: "Pay" },
  ],
  [
    "set-value-second-source",
    {
      then_action_type: "set_column_value",
      then_target_column: "SAP Status",
      then_value_source_file: "sap",
      then_value_source_alias: "sap",
      then_value_field: "Status",
    },
  ],
  ["set-value-empty", { then_action_type: "set_column_value" }],
  [
    "calculation",
    {
      then_action_type: "set_column_calculation",
      then_target_column: "Overpay",
      then_value_source_file: "wd",
      then_value_field: "Pay",
      then_math_json: JSON.stringify([
        { operator: "-", operandType: "field", operandFieldName: "Hours" },
        { operator: "/", operandType: "number", operand: "2" },
      ]),
      then_rounding_mode: "nearest",
      then_rounding_decimal_places: "1",
    },
  ],
  [
    "calculation-round-down",
    {
      then_action_type: "set_column_calculation",
      then_target_column: "Rate",
      then_value_source_file: "wd",
      then_value_field: "Pay",
      then_math_json: JSON.stringify([{ operator: "*", operandType: "number", operand: "1.5" }]),
      then_rounding_mode: "down",
      then_rounding_decimal_places: "2",
    },
  ],
  [
    "calculation-no-math",
    { then_action_type: "set_column_calculation", then_target_column: "Same", then_value_source_file: "wd", then_value_field: "Pay" },
  ],
  [
    "string-first",
    {
      then_action_type: "set_column_string_transform",
      then_target_column: "Country Short",
      then_string_operation: "first_characters",
      then_string_source_file: "wd",
      then_string_source_field: "Country",
      then_string_character_count: "2",
    },
  ],
  [
    "string-last",
    {
      then_action_type: "set_column_string_transform",
      then_target_column: "Code End",
      then_string_operation: "last_characters",
      then_string_source_file: "wd",
      then_string_source_field: "Code",
      then_string_character_count: "3",
    },
  ],
  [
    "string-count",
    {
      then_action_type: "set_column_string_transform",
      then_target_column: "Code Length",
      then_string_operation: "character_count",
      then_string_source_file: "wd",
      then_string_source_field: "Code",
    },
  ],
  [
    "string-split",
    {
      then_action_type: "set_column_string_transform",
      then_target_column: "Code Part",
      then_string_operation: "split",
      then_string_split_mode: "first",
      then_string_split_delimiter: "custom",
      then_string_split_custom_delimiter: "-",
      then_string_source_file: "wd",
      then_string_source_field: "Code",
    },
  ],
  ["freeform", { then_action_type: "freeform", then_action: "Route to the review queue" }],
  [
    "freeform-display-sentence",
    { then_action_type: "freeform", then_action: `display "Missing pay" in new column "Pay Check"` },
  ],
  ["freeform-do-not-display-sentence", { then_action_type: "freeform", then_action: "Do not display the record" }],
  ["freeform-empty", { then_action_type: "freeform" }],
  ["freeform-if-only", { then_action_type: "freeform", then_action: "IF status is active:" }],
  ["no-action-type", { then_action: "Send to payroll" }],
  ["unknown-action-type", { then_action_type: "archive_record" }],
];

const IF_CONDITION = [leaf("Status", "is equal to", { compareValue: "Active" })];

function actionCases() {
  const cases = [];
  // THEN with every action kind.
  for (const [name, action] of ACTIONS) cases.push(ifThenCase(`then-${name}`, IF_CONDITION, action));

  // ELSE with every action kind, after an IF that displays a message, both
  // managed (folded when it writes the same column) and not.
  for (const [name, action] of ACTIONS) {
    for (const managed of [true, false]) {
      const id = `else-${managed ? "managed" : "own"}-${name}`;
      cases.push(
        audit(id, [
          logicStep(id, "if_then", {
            conditions_json: JSON.stringify(withIf(IF_CONDITION)),
            then_action_type: "display_text",
            then_text: "Active",
            then_output_column: "Error Message",
            include_else_branch: "Yes",
          }),
          logicStep(
            `${id}::else`,
            "else",
            {
              ...(managed ? { managed_else_branch: "Yes" } : {}),
              parent_if_step_id: id,
              ...action,
            },
            { parentId: id, branchType: "else" },
          ),
        ]),
      );
    }
  }

  // Folding: an IF and its managed ELSE that write the same column, a
  // different column, and set the same target column.
  const pair = (id, ifAction, elseAction, conditions = IF_CONDITION) =>
    audit(id, [
      logicStep(id, "if_then", {
        conditions_json: JSON.stringify(withIf(conditions)),
        include_else_branch: "Yes",
        ...ifAction,
      }),
      logicStep(
        `${id}::else`,
        "else",
        { managed_else_branch: "Yes", parent_if_step_id: id, ...elseAction },
        { parentId: id, branchType: "else" },
      ),
    ]);
  const text = (message, column = "Error Message") => ({
    then_action_type: "display_text",
    then_text: message,
    then_output_column: column,
  });
  cases.push(pair("fold-same-column", text("Yes"), text("No")));
  cases.push(pair("fold-different-column", text("Yes"), text("No", "Other Column")));
  cases.push(
    pair(
      "fold-set-value",
      { then_action_type: "set_column_value", then_target_column: "Out", then_value_source_file: "wd", then_value_field: "Pay" },
      { then_action_type: "set_column_value", then_target_column: "Out", then_value_source_file: "wd", then_value_field: "Hours" },
    ),
  );
  cases.push(pair("fold-display-pair", DISPLAY, { then_action_type: "do_not_display" }));
  cases.push(
    pair("fold-grouped-conditions", text("Yes"), text("No"), [
      leaf("Status", "is equal to", { compareValue: "A" }),
      group("OR", [leaf("Code", "contains", { compareValue: "X" }), leaf("Pay", "is greater than", { compareValue: "5", connector: "OR" })]),
    ]),
  );

  // An ELSE whose IF is missing, and one with no parent at all.
  cases.push(
    audit("else-missing-parent", [
      logicStep("else-missing-parent::else", "else", { parent_if_step_id: "nowhere", then_action_type: "display" }),
    ]),
  );
  cases.push(audit("else-no-parent", [logicStep("else-no-parent", "else", { then_action_type: "do_not_display" })]));

  // inverse_else: an IF that inverts an earlier step.
  cases.push(
    audit("inverse-else", [
      logicStep("gate", "if_then", {
        conditions_json: JSON.stringify(withIf([leaf("Status", "is equal to", { compareValue: "Active" })])),
        ...DISPLAY,
      }),
      logicStep("inverse", "if_then", {
        conditions_json: JSON.stringify(withIf([leaf("Status", "is equal to", { compareValue: "Active" })])),
        then_action_type: "do_not_display",
        inverse_else: "Yes",
        inverse_of_step_id: "gate",
      }),
    ]),
  );
  cases.push(
    audit("inverse-else-missing", [
      logicStep("inverse-missing", "if_then", {
        conditions_json: JSON.stringify(withIf(IF_CONDITION)),
        ...DISPLAY,
        inverse_else: "Yes",
        inverse_of_step_id: "nowhere",
      }),
    ]),
  );
  return cases;
}

// ---- Filter Rows and Flag Records -----------------------------------------------

function filterFlagCases() {
  const cases = [];
  const one = (id, stepType, params, extra) => cases.push(audit(id, [logicStep(id, stepType, params, extra)]));
  const conditions = [
    ["equal", { field_name: "Status", operator: "is equal to", compare_value: "Active" }],
    ["several", { field_name: "Status", operator: "is not equal to", compare_value: "Active\nLeave" }],
    ["number", { field_name: "Pay", operator: "is greater than", compare_value: "100" }],
    ["contains", { field_name: "Code", operator: "contains", compare_value: "50%_off" }],
    ["blank", { field_name: "Status", operator: "is blank/null" }],
    ["not-blank", { field_name: "Status", operator: "is not blank" }],
    ["unknown-operator", { field_name: "Status", operator: "is between", compare_value: "A" }],
    ["no-field", { operator: "is equal to", compare_value: "A" }],
  ];
  for (const [name, condition] of conditions) {
    for (const filterAction of ["Keep matching rows", "Exclude matching rows", ""])
      one(`filter-${name}-${slug(filterAction)}`, "filter_rows", {
        source_file: "wd",
        ...condition,
        filter_action: filterAction,
      });
    for (const [actionName, action] of [
      ["display-text", { flag_action: "display_text", message: "Check this", output_column: "Error Message" }],
      ["display-text-default-column", { flag_action: "display_text", message: "Check this" }],
      ["display-text-custom-column", { flag_action: "display_text", message: `It's "odd"`, output_column: "Flags" }],
      ["do-not-display", { flag_action: "do_not_display" }],
      ["no-action", {}],
    ])
      one(`flag-${name}-${actionName}`, "flag_records", { source_file: "wd", ...condition, ...action });
  }
  one("filter-second-source", "filter_rows", {
    source_file: "sap",
    field_name: "PERNR",
    operator: "is equal to",
    compare_value: "100",
    filter_action: "Keep matching rows",
  });
  // Legacy shapes: the source and field on the step instead of in params.
  one(
    "filter-legacy-step-source",
    "filter_rows",
    { operator: "is equal to", compare_value: "Active", filter_action: "Exclude matching rows" },
    { source: "wd", field: "Status" },
  );
  one(
    "flag-legacy-step-source",
    "flag_records",
    { operator: "is blank/null", flag_action: "display_text", message: "Missing" },
    { source: "wd", field: "Status" },
  );
  return cases;
}

/** [{ group, cases: [audit] }] in a stable order. */
export function matrixGroups() {
  return [
    { group: "conditions", cases: conditionCases() },
    { group: "groups", cases: groupCases() },
    { group: "actions", cases: actionCases() },
    { group: "filter-flag", cases: filterFlagCases() },
  ];
}
