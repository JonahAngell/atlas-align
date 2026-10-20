/**
 * 07-phrase-catalog.js
 *
 * Phrase catalog loading, formatting helpers, and analyst/developer logic generation for standardized audit language.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Phrase catalog state
// -----------------------------------------------------------------------------
const REQUIRED_CATALOG_KEYS = [
  "version",
  "description",
  "auto_note_prefixes",
  "notes",
  "format_field",
  "list_format",
  "developer_logic",
  "analyst_logic",
];
let phraseCatalog = {};
const missingPhrasePaths = new Set();
const catalogLoadWarnings = [];

// -----------------------------------------------------------------------------
// Catalog loading and lookup
// -----------------------------------------------------------------------------
/**
 * Loads and validates the phrase catalog JSON.
 */
async function initPhraseCatalog() {
  missingPhrasePaths.clear();
  catalogLoadWarnings.length = 0;
  try {
    const response = await fetch("./catalogs/logic_phrase_catalog.json", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    const json = await response.json();
    validateCatalogShape(json);
    phraseCatalog = json;
    status(
      "Phrase catalog loaded from catalogs/logic_phrase_catalog.json.",
      "ok",
    );
  } catch (error) {
    phraseCatalog = {};
    catalogLoadWarnings.push(
      `Phrase catalog could not be loaded: ${error.message}`,
    );
    status(
      "Phrase catalog could not be loaded. Analyst Logic will show missing phrase warnings.",
      "bad",
    );
  }
}

/**
 * Checks that the phrase catalog has required top-level keys.
 * @param {any} catalog - Input used by validateCatalogShape.
 */
function validateCatalogShape(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog))
    throw new Error(
      "catalogs/logic_phrase_catalog.json must contain a JSON object.",
    );
  const missing = REQUIRED_CATALOG_KEYS.filter((key) => !(key in catalog));
  if (missing.length)
    throw new Error(
      `catalogs/logic_phrase_catalog.json is missing required top-level key(s): ${missing.join(", ")}.`,
    );
}

/**
 * Reads a nested value from the phrase catalog.
 * @param {any} path - Catalog path or file path.
 * @param {any} defaultValue - Fallback value when a catalog path is missing.
 */
function getCatalogValue(path, defaultValue = undefined) {
  if (!path) return defaultValue;
  let current = phraseCatalog;
  for (const part of String(path).split(".")) {
    if (
      current &&
      typeof current === "object" &&
      Object.prototype.hasOwnProperty.call(current, part)
    )
      current = current[part];
    else {
      missingPhrasePaths.add(path);
      return defaultValue;
    }
  }
  return current;
}

/**
 * Reads a string template from the phrase catalog.
 * @param {any} path - Catalog path or file path.
 */
function phraseTemplate(path) {
  const value = getCatalogValue(path, undefined);
  if (typeof value !== "string") {
    missingPhrasePaths.add(path);
    return "";
  }
  return value;
}

/**
 * Substitutes template placeholders with values.
 * @param {any} template - Input used by renderPhraseFromTemplate.
 * @param {any} values - Input used by renderPhraseFromTemplate.
 */
function renderPhraseFromTemplate(template, values = {}) {
  return String(template || "").replace(
    /\{([A-Za-z0-9_.-]+)\}/g,
    (match, key) => {
      if (Object.prototype.hasOwnProperty.call(values, key))
        return String(values[key] ?? "");
      return match;
    },
  );
}

/**
 * Renders a phrase template by catalog path.
 * @param {any} path - Catalog path or file path.
 * @param {any} values - Input used by renderCatalogPhrase.
 */
function renderCatalogPhrase(path, values = {}) {
  const template = phraseTemplate(path);
  if (!template) return `[Missing phrase path: ${path}]`;
  return renderPhraseFromTemplate(template, values);
}

/**
 * Reads an array from the phrase catalog using an options object.
 * Explicit property names keep call sites readable and avoid positional-argument ambiguity.
 * @param {Object} options - Catalog-array lookup options.
 * @param {string} options.path - Catalog path to read.
 * @param {Array<any>} options.fallback - Array returned when the catalog value is missing or is not an array.
 */
function catalogArrayFromOptions({ path = "", fallback = [] } = {}) {
  const value = getCatalogValue(path, undefined);
  return Array.isArray(value) ? value : fallback;
}

/**
 * Reads one placeholder from the phrase catalog.
 * The fallback is used only when the catalog has not loaded.
 * @param {string} key - Placeholder key under placeholders.
 * @param {string} fallback - Last-resort text.
 */
function phrasePlaceholder(key, fallback = "") {
  const value = getCatalogValue(`placeholders.${key}`, undefined);
  return typeof value === "string" && value ? value : fallback;
}

// -----------------------------------------------------------------------------
// Phrase formatting helpers
// -----------------------------------------------------------------------------
/**
 * Quotes a value for standardized analyst logic.
 * @param {any} value - Value to process or assign.
 */
function quotePhraseValue(value) {
  const clean = String(value ?? "").trim();
  return clean ? `"${clean}"` : '""';
}

/**
 * Formats a source/field pair as standardized column text.
 * @param {any} sourceFile - Raw source file name.
 * @param {any} alias - Input used by tableColumnPlain.
 * @param {any} fieldName - Raw field name.
 * @param {any} omitSource - Input used by tableColumnPlain.
 */
function tableColumnPlain(sourceFile, alias, fieldName, omitSource = false) {
  const field = String(fieldName || "").trim();
  if (!field) return "";
  const source = String(sourceFile || "").trim();
  const resolvedAlias = String(
    alias || sourceAliasFor(source) || source,
  ).trim();
  if (
    source === "First Available Value" ||
    resolvedAlias === "First Available Value"
  )
    return field;
  if (
    source === "Calculated Field" ||
    resolvedAlias === "Calculated Field" ||
    source === "Calculated Fields" ||
    resolvedAlias === "Calculated Fields" ||
    source === "Created Columns" ||
    source === "__created_columns__"
  )
    return `new column ${quotePhraseValue(field)}`;
  if (omitSource || !resolvedAlias) return `column ${quotePhraseValue(field)}`;
  return `file ${quotePhraseValue(resolvedAlias)} column ${quotePhraseValue(field)}`;
}

/**
 * Formats a list of comparison values using catalog list templates.
 * @param {any} value - Value to process or assign.
 */
function formattedValueList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
  const quoted = values.map(quotePhraseValue);
  if (quoted.length === 0) return "";
  if (quoted.length === 1) return quoted[0];
  if (quoted.length === 2)
    return renderCatalogPhrase("list_format.two_item_template", {
      first: quoted[0],
      second: quoted[1],
    });
  return renderCatalogPhrase("list_format.many_item_template", {
    items: quoted.slice(0, -1).join(", "),
    last: quoted.at(-1),
  });
}

function conditionCompareMathOperationsForPhrase(condition = {}) {
  if (typeof parseSourceMathOperations !== "function") return [];
  return parseSourceMathOperations(
    condition.compareMathJson ||
      condition.compare_math_json ||
      condition.compareMath ||
      [],
  );
}

function compareMathOperatorWord(operator = "") {
  const path = {
    "+": "analyst_logic.math.plus",
    "-": "analyst_logic.math.minus",
    "*": "analyst_logic.math.times",
    "/": "analyst_logic.math.divided_by",
  }[operator];
  return path ? renderCatalogPhrase(path, {}) : "";
}

function compareMathOperandPlain(operation = {}, fallbackSourceFile = "") {
  if ((operation.operandType || "number") === "field") {
    const sourceFile = operation.operandSourceFile || fallbackSourceFile;
    const alias = operation.operandSourceAlias || sourceAliasFor(sourceFile);
    return tableColumnPlain(
      sourceFile,
      alias,
      operation.operandFieldName || "",
    );
  }
  return String(operation.operand || "").trim();
}

function conditionCompareFieldPlain(condition = {}) {
  const base = tableColumnPlain(
    condition.compareSourceFile || condition.sourceFile,
    condition.compareSourceAlias || condition.sourceAlias,
    condition.compareFieldName,
  );
  const operations = conditionCompareMathOperationsForPhrase(condition);
  const mathText = operations
    .map((operation) => {
      const word = compareMathOperatorWord(operation.operator);
      const operand = compareMathOperandPlain(
        operation,
        condition.compareSourceFile || condition.sourceFile,
      );
      return word && operand ? `${word} ${operand}` : "";
    })
    .filter(Boolean)
    .join(" ");
  return `${base}${mathText ? ` ${mathText}` : ""}`.trim();
}

/**
 * Formats the right side of a condition.
 * @param {any} condition - Condition object to format or render.
 */
function conditionValuePlain(condition) {
  if (condition.valueMode === "blank")
    return renderCatalogPhrase("analyst_logic.blank_comparison.value", {});
  if (condition.valueMode === "field")
    return conditionCompareFieldPlain(condition);
  if (condition.valueMode === "expression")
    return String(condition.expression || "").trim();
  return formattedValueList(condition.compareValue || condition.value || "");
}

/**
 * Formats a full condition as plain standardized text.
 * @param {any} condition - Condition object to format or render.
 * @param {any} omitSource - Input used by conditionToPlain.
 */
function conditionToPlain(condition, omitSource = false) {
  const left = tableColumnPlain(
    condition.sourceFile,
    condition.sourceAlias,
    condition.fieldName || condition.field,
    omitSource,
  );
  const operator =
    condition.valueMode === "blank"
      ? renderCatalogPhrase(
          String(condition.operator || "").includes("not")
            ? "analyst_logic.blank_comparison.is_not_blank"
            : "analyst_logic.blank_comparison.is_blank",
          {},
        )
      : condition.operator || "is equal to";
  const value =
    condition.valueMode === "blank" ? "" : conditionValuePlain(condition);
  return `${left} ${operator}${value ? ` ${value}` : ""}`.trim();
}

// -----------------------------------------------------------------------------
// Condition normalization and analyst logic
// -----------------------------------------------------------------------------
/**
 * Normalizes stored condition shapes into guided condition objects.
 * @param {any} step - Logic step object being read or modified.
 */
function parseStepConditions(step) {
  const params = step.params || {};
  if (params.conditions_json) {
    try {
      const parsed = JSON.parse(params.conditions_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return (step.conditions || []).map((condition, index) => ({
    id: condition.id || uid("cond"),
    connector: index === 0 ? "IF" : condition.connector || "AND",
    sourceFile: condition.sourceFile || step.source || params.source_file || "",
    sourceAlias:
      condition.sourceAlias ||
      params.source_alias ||
      sourceAliasFor(
        condition.sourceFile || step.source || params.source_file || "",
      ),
    fieldName:
      condition.fieldName || condition.field || params.field_name || "",
    operator: condition.operator || params.operator || "is equal to",
    valueMode: condition.valueMode || "values",
    compareValue:
      condition.compareValue || condition.value || params.compare_value || "",
    compareSourceFile: condition.compareSourceFile || "",
    compareSourceAlias: condition.compareSourceAlias || "",
    compareFieldName: condition.compareFieldName || "",
    expression: condition.expression || "",
    compareMathJson:
      condition.compareMathJson || condition.compare_math_json || "",
  }));
}

const INVERSE_CONDITION_OPERATOR_MAP = {
  "is equal to": "is not equal to",
  "is not equal to": "is equal to",
  contains: "does not contain",
  "does not contain": "contains",
  "starts with": "does not start with",
  "does not start with": "starts with",
  "ends with": "does not end with",
  "does not end with": "ends with",
  "is greater than": "is less than or equal to",
  "is greater than or equal to": "is less than",
  "is less than": "is greater than or equal to",
  "is less than or equal to": "is greater than",
  "is blank/null": "is not blank/null",
  "is not blank/null": "is blank/null",
  "matches expression": "does not match expression",
  "does not match expression": "matches expression",
};

/**
 * Returns the logical opposite of a guided IF operator.
 * @param {string} operator - Operator label from the IF condition editor.
 * @param {string} valueMode - Condition value mode, used for blank/null defaults.
 */
function inverseConditionOperator(operator, valueMode = "values") {
  const normalized = String(operator || "")
    .trim()
    .toLowerCase();
  if (INVERSE_CONDITION_OPERATOR_MAP[normalized])
    return INVERSE_CONDITION_OPERATOR_MAP[normalized];
  if (valueMode === "blank")
    return renderCatalogPhrase(
      normalized.includes("not")
        ? "analyst_logic.blank_comparison.is_blank"
        : "analyst_logic.blank_comparison.is_not_blank",
      {},
    );
  if (normalized.startsWith("does not "))
    return normalized.replace(/^does not\s+/, "");
  if (normalized.startsWith("does "))
    return normalized.replace(/^does\s+/, "does not ");
  if (normalized.startsWith("is not "))
    return normalized.replace(/^is not\s+/, "is ");
  if (normalized.startsWith("is "))
    return normalized.replace(/^is\s+/, "is not ");
  // Unknown operators are left unchanged because the app cannot infer a safe inverse.
  return operator || "is equal to";
}

/**
 * Returns the De Morgan opposite of a condition connector.
 * @param {string} connector - Connector from a guided condition row.
 */
function inverseConditionConnector(connector) {
  const normalized = String(connector || "")
    .trim()
    .toUpperCase();
  if (normalized === "AND") return "OR";
  if (normalized === "OR") return "AND";
  return "AND";
}

/**
 * Creates the inverse of one guided condition while preserving source/value metadata.
 * @param {any} condition - Guided condition object from parseStepConditions.
 * @param {number} index - Zero-based condition index.
 */
function invertGuidedCondition(condition, index = 0) {
  const next = {
    ...condition,
    id: uid("cond"),
    connector:
      index === 0 ? "IF" : inverseConditionConnector(condition.connector),
    operator: inverseConditionOperator(condition.operator, condition.valueMode),
  };
  if ((next.valueMode || "values") === "blank") {
    next.compareValue = "";
    next.compareFieldName = "";
    next.expression = "";
  }
  return next;
}

/**
 * Builds inverted conditions for a complete IF step.
 * @param {any} step - IF step to invert.
 */
function invertedConditionsForStep(step) {
  const parsed = parseStepConditions(step);
  const conditions = parsed.length
    ? parsed
    : typeof defaultGuidedCondition === "function"
      ? [defaultGuidedCondition(step)]
      : [];
  return conditions.map((condition, index) =>
    invertGuidedCondition(condition, index),
  );
}

/**
 * Formats all IF/THEN conditions as a condition group.
 * @param {any} step - Logic step object being read or modified.
 */
function conditionGroupPlain(step) {
  return parseStepConditions(step)
    .map((condition, index) => {
      const connector = index === 0 ? "IF" : condition.connector || "AND";
      return renderCatalogPhrase("analyst_logic.if_then.condition_line", {
        connector,
        condition_text: conditionToPlain(condition, false),
      });
    })
    .join(" ")
    .trim();
}

/**
 * Ensures condition text starts with an IF-style prefix.
 * @param {any} text - Input used by ensureIfThenPrefix.
 */
function ensureIfThenPrefix(text) {
  const value = String(text || "").trim();
  if (!value) return value;
  if (/^(IF|ELSE IF|ELSE)\b/i.test(value)) return value;
  return `IF ${value}`;
}

/**
 * Formats the THEN action for an IF/THEN step.
 * @param {any} step - Logic step object being read or modified.
 */
function thenActionPlain(step) {
  const params = step.params || {};
  const actionType = params.then_action_type || "freeform";
  if (actionType === "display_text")
    return renderCatalogPhrase("analyst_logic.if_then.then_display_text", {
      message: quotePhraseValue(params.then_text || ""),
      output_column: quotePhraseValue(
        params.then_output_column ||
          phrasePlaceholder("error_message_column", "Error Message"),
      ),
    });
  if (actionType === "set_column_value")
    return renderCatalogPhrase("analyst_logic.if_then.then_set_column_value", {
      target_column: quotePhraseValue(params.then_target_column || ""),
      value_column: tableColumnPlain(
        params.then_value_source_file || params.source_file,
        params.then_value_source_alias || params.source_alias,
        params.then_value_field || "",
      ),
    });
  if (actionType === "do_not_display")
    return renderCatalogPhrase("analyst_logic.if_then.then_do_not_display", {});
  return renderCatalogPhrase("analyst_logic.if_then.then_freeform", {
    action: params.then_action || step.action || "",
  });
}

/**
 * Formats an ELSE step action.
 * @param {any} step - Logic step object being read or modified.
 */
function elseActionPlain(step) {
  const params = step.params || {};
  const actionType = params.then_action_type || "freeform";
  if (actionType === "display_text")
    return renderCatalogPhrase("analyst_logic.else.display_text", {
      message: quotePhraseValue(params.then_text || ""),
      output_column: quotePhraseValue(
        params.then_output_column ||
          phrasePlaceholder("error_message_column", "Error Message"),
      ),
    });
  if (actionType === "set_column_value")
    return renderCatalogPhrase("analyst_logic.else.set_column_value", {
      target_column: quotePhraseValue(params.then_target_column || ""),
      value_column: tableColumnPlain(
        params.then_value_source_file || params.source_file,
        params.then_value_source_alias || params.source_alias,
        params.then_value_field || "",
      ),
    });
  if (actionType === "do_not_display")
    return renderCatalogPhrase("analyst_logic.else.do_not_display", {});
  if (params.then_action)
    return renderCatalogPhrase("analyst_logic.else.freeform", {
      action: params.then_action,
    });
  return renderCatalogPhrase("analyst_logic.else.default", {});
}

/**
 * Selects the phrase path for a Create Column step.
 * @param {any} params - Step params object.
 */
function createColumnPhrasePath(params) {
  if (params.value_mode === "Static value")
    return "analyst_logic.create_column.static_value";
  if (params.value_mode === "Source field value")
    return "analyst_logic.create_column.source_field";
  if (params.value_mode === "Concatenate fields")
    return "analyst_logic.create_column.concatenate_fields";
  if (params.expression_type === "first_characters")
    return "analyst_logic.create_column.first_characters";
  if (params.expression_type === "character_count")
    return "analyst_logic.create_column.character_count";
  if (params.value_mode === "Expression / calculation")
    return "analyst_logic.create_column.expression";
  return "analyst_logic.create_column.default";
}

/**
 * Returns true when a join type represents a Union.
 * @param {any} joinType - Input used by phraseIsUnionJoinType.
 */
function phraseIsUnionJoinType(joinType) {
  return (
    String(joinType || "")
      .trim()
      .toUpperCase() === "UNION"
  );
}

// -----------------------------------------------------------------------------
// Create Column source-field math and rounding phrase helpers
// -----------------------------------------------------------------------------
/**
 * Formats the rounding precision target for analyst-facing Create Column text.
 * @param {any} decimalPlacesValue - Raw decimal places value.
 */
function atlasRoundingTargetText(decimalPlacesValue) {
  const decimals = Number.parseInt(decimalPlacesValue, 10);
  const safeDecimals =
    Number.isFinite(decimals) && decimals >= 0 ? decimals : 0;
  if (safeDecimals === 0)
    return renderCatalogPhrase(
      "analyst_logic.rounding.nearest_whole_number",
      {},
    );
  return renderCatalogPhrase(
    safeDecimals === 1
      ? "analyst_logic.rounding.one_decimal_place"
      : "analyst_logic.rounding.many_decimal_places",
    { count: safeDecimals },
  );
}

/**
 * Formats the rounding direction phrase for analyst-facing Create Column text.
 * @param {string} roundingMode - Rounding mode.
 */
function atlasRoundingDirectionText(roundingMode) {
  const path =
    roundingMode === "down"
      ? "analyst_logic.rounding.down"
      : roundingMode === "up"
        ? "analyst_logic.rounding.up"
        : "analyst_logic.rounding.nearest";
  return renderCatalogPhrase(path, {});
}

function atlasMathOperationPhrase(operator, index, operand, sourceField) {
  const first = index === 0;
  const path = {
    "+": first ? "analyst_logic.math.add_first" : "analyst_logic.math.add_next",
    "-": first
      ? "analyst_logic.math.subtract_first"
      : "analyst_logic.math.subtract_next",
    "*": first
      ? "analyst_logic.math.multiply_first"
      : "analyst_logic.math.multiply_next",
    "/": first
      ? "analyst_logic.math.divide_first"
      : "analyst_logic.math.divide_next",
  }[operator];
  if (!path || !operand) return "";
  return renderCatalogPhrase(path, {
    operand,
    source_field: sourceField,
  });
}

/** Joins phrases with "and" ("A and B", "A, B, and C"). */
function atlasJoinReadableAndList(items = []) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered.at(-1)}`;
}

/**
 * Lists the Remove Duplicates columns, naming each file only once in a row:
 * file "X" column "A" and column "B".
 * @param {any} params - Step params.
 */
function atlasDuplicateColumnListPhrase(params = {}) {
  const fields =
    typeof atlasDuplicateFieldsFromParams === "function"
      ? atlasDuplicateFieldsFromParams(params)
      : [];
  let previousSource = null;
  const phrases = fields.map((item) => {
    const sameSource =
      previousSource !== null && previousSource === item.sourceFile;
    previousSource = item.sourceFile;
    return tableColumnPlain(
      item.sourceFile,
      item.sourceAlias,
      item.fieldName,
      sameSource,
    );
  });
  return (
    atlasJoinReadableAndList(phrases) ||
    phrasePlaceholder("duplicate_columns", "[selected columns]")
  );
}

/** Maps a stored duplicate_action to its sentence ending. */
function atlasDuplicateKeepClause(action = "") {
  const stored = String(action || "").trim() || "Keep first record";
  const clause = getCatalogValue(
    "analyst_logic.remove_duplicates.keep_clauses",
    {},
  )?.[stored];
  return typeof clause === "string" && clause
    ? clause
    : "keeping the first record";
}

// -----------------------------------------------------------------------------
// Step-to-analyst-logic renderer
// -----------------------------------------------------------------------------
/**
 * Generates standardized analyst-facing logic text for a step.
 * @param {any} step - Logic step object being read or modified.
 */
function analystLogic(step) {
  normalizeCatalogStep(step);
  const params = step.params || {};
  const stepType = step.step_type;
  if (stepType === "reference_source") {
    const sourceFile = params.source_file || step.source || "";
    const alias = params.source_alias || sourceAliasFor(sourceFile);
    return alias && alias !== sourceFile
      ? renderCatalogPhrase("analyst_logic.reference_source.with_alias", {
          source_file: quotePhraseValue(sourceFile),
          source_alias: quotePhraseValue(alias),
        })
      : renderCatalogPhrase("analyst_logic.reference_source.without_alias", {
          source_file: quotePhraseValue(sourceFile),
        });
  }
  if (stepType === "create_column") {
    const columnName = params.column_name || step.field || "";
    if (
      (params.value_mode === "Static value" || !params.value_mode) &&
      !String(params.static_value || "").trim()
    ) {
      return renderCatalogPhrase("analyst_logic.create_column.blank", {
        column_name: quotePhraseValue(columnName),
      });
    }
    const tableColumn = tableColumnPlain(
      params.source_file,
      params.source_alias,
      params.field_name,
    );
    return renderCatalogPhrase(createColumnPhrasePath(params), {
      column_name: quotePhraseValue(columnName),
      static_value: quotePhraseValue(params.static_value || ""),
      table_column: tableColumn,
      expression: params.expression || "",
      character_count: params.character_count || "",
      first_column: tableColumnPlain(
        params.concat_source_1 || params.source_file,
        sourceAliasFor(params.concat_source_1 || params.source_file),
        params.concat_field_1,
      ),
      second_column: tableColumnPlain(
        params.concat_source_2 || params.source_file,
        sourceAliasFor(params.concat_source_2 || params.source_file),
        params.concat_field_2,
      ),
    });
  }
  if (stepType === "if_then") {
    const group = ensureIfThenPrefix(conditionGroupPlain(step));
    const action = thenActionPlain(step);
    const phrase = action
      ? renderCatalogPhrase(
          "analyst_logic.if_then.condition_group_with_action",
          { condition_group: group, then_action: action },
        )
      : renderCatalogPhrase(
          "analyst_logic.if_then.condition_group_without_action",
          { condition_group: group },
        );
    return ensureIfThenPrefix(phrase);
  }
  if (stepType === "else") return elseActionPlain(step);
  if (stepType === "join") {
    if (phraseIsUnionJoinType(params.join_type))
      return renderCatalogPhrase("analyst_logic.union_sources.default", {
        left_source: quotePhraseValue(
          params.left_source || params.union_left_source || "",
        ),
        right_source: quotePhraseValue(
          params.right_source || params.union_right_source || "",
        ),
        output_source: quotePhraseValue(
          params.output_source || step.source || "",
        ),
      });
    return renderCatalogPhrase("analyst_logic.join.default", {
      left_column: tableColumnPlain(
        params.left_source,
        params.left_alias,
        params.left_field,
      ),
      right_column: tableColumnPlain(
        params.right_source,
        params.right_alias,
        params.right_field,
      ),
    });
  }
  if (stepType === "union_sources")
    return renderCatalogPhrase("analyst_logic.union_sources.default", {
      left_source: quotePhraseValue(params.union_left_source || ""),
      right_source: quotePhraseValue(params.union_right_source || ""),
      output_source: quotePhraseValue(
        params.output_source || step.source || "",
      ),
    });
  if (stepType === "format_field")
    return renderCatalogPhrase("analyst_logic.format_field.default", {
      table_column: tableColumnPlain(
        params.source_file,
        params.source_alias,
        params.field_name,
      ),
      format: params.format || "",
      format_suffix: "",
    });
  if (stepType === "split_field")
    return renderCatalogPhrase("analyst_logic.split_field.default", {
      table_column: tableColumnPlain(
        params.source_file,
        params.source_alias,
        params.field_name,
      ),
      split_on: quotePhraseValue(params.split_on || ""),
      split_part: params.split_part || "",
      output_column: quotePhraseValue(params.output_column || ""),
    });
  if (stepType === "sort_records") {
    const fields = (
      typeof atlasSortFieldsFromParams === "function"
        ? atlasSortFieldsFromParams(params)
        : []
    ).filter((item) => item.fieldName);
    const first = fields[0] || {
      sourceFile: params.source_file,
      sourceAlias: params.source_alias,
      fieldName: params.field_name,
      direction: params.sort_direction,
    };
    const phrase = renderCatalogPhrase("analyst_logic.sort_records.default", {
      table_column: tableColumnPlain(
        first.sourceFile,
        first.sourceAlias,
        first.fieldName,
      ),
      sort_direction: first.direction || "Ascending",
    });
    if (fields.length < 2) return phrase;
    let previousSource = first.sourceFile;
    const thenClauses = fields.slice(1).map((item) => {
      const sameSource = previousSource === item.sourceFile;
      previousSource = item.sourceFile;
      return renderCatalogPhrase("analyst_logic.sort_records.then_clause", {
        table_column: tableColumnPlain(
          item.sourceFile,
          item.sourceAlias,
          item.fieldName,
          sameSource,
        ),
        sort_direction: item.direction,
      });
    });
    return `${phrase.replace(/\.$/, "")}${thenClauses.join("")}.`;
  }
  if (stepType === "remove_duplicates")
    return renderCatalogPhrase("analyst_logic.remove_duplicates.default", {
      column_list: atlasDuplicateColumnListPhrase(params),
      keep_clause: atlasDuplicateKeepClause(params.duplicate_action),
    });
  if (stepType === "filter_rows")
    return renderCatalogPhrase("analyst_logic.filter_rows.default", {
      table_column: tableColumnPlain(
        params.source_file,
        params.source_alias,
        params.field_name,
      ),
      operator: params.operator || "is equal to",
      compare_value: params.compare_value
        ? ` ${formattedValueList(params.compare_value)}`
        : "",
      filter_action: params.filter_action || "Keep matching rows",
    });
  if (stepType === "flag_records")
    return `${renderCatalogPhrase("analyst_logic.flag_records.condition", { table_column: tableColumnPlain(params.source_file, params.source_alias, params.field_name), operator: params.operator || "is equal to", compare_value: params.compare_value ? ` ${formattedValueList(params.compare_value)}` : "" })} ${params.flag_action === "do_not_display" ? renderCatalogPhrase("analyst_logic.flag_records.do_not_display", {}) : renderCatalogPhrase("analyst_logic.flag_records.display_text", { message: quotePhraseValue(params.message || ""), output_column: quotePhraseValue(params.output_column || phrasePlaceholder("error_message_column", "Error Message")) })}`;
  return `[Missing phrase path: analyst_logic.${stepType || "unknown"}]`;
}

/**
 * Generates notes for a step when manual notes are not provided.
 * @param {any} step - Logic step object being read or modified.
 * @param {any} index - Zero-based index used for ordering or display.
 */
function noteText(step, index) {
  normalizeCatalogStep(step);
  const params = step.params || {};
  if (step.notes) return step.notes;
  if (step.step_type === "join") {
    if (phraseIsUnionJoinType(params.join_type))
      return renderCatalogPhrase("notes.union", {
        left_source:
          params.left_source ||
          params.union_left_source ||
          phrasePlaceholder("file_1", "[file 1]"),
        right_source:
          params.right_source ||
          params.union_right_source ||
          phrasePlaceholder("file_2", "[file 2]"),
        output_source:
          params.output_source ||
          phrasePlaceholder("combined_file", "[combined file]"),
      });
    return renderCatalogPhrase(`notes.join.${params.join_type || "DEFAULT"}`, {
      left_alias:
        params.left_alias ||
        params.left_source ||
        phrasePlaceholder("file_1", "[file 1]"),
      right_alias:
        params.right_alias ||
        params.right_source ||
        phrasePlaceholder("file_2", "[file 2]"),
      keys: `${quotePhraseValue(params.left_field || phrasePlaceholder("file_1_key", "[file 1 key]"))} / ${quotePhraseValue(params.right_field || phrasePlaceholder("file_2_key", "[file 2 key]"))}`,
    });
  }
  if (step.step_type === "union_sources")
    return renderCatalogPhrase("notes.union", {
      left_source:
        params.union_left_source || phrasePlaceholder("file_1", "[file 1]"),
      right_source:
        params.union_right_source || phrasePlaceholder("file_2", "[file 2]"),
      output_source:
        params.output_source ||
        phrasePlaceholder("combined_file", "[combined file]"),
    });
  if (step.step_type === "else")
    return renderCatalogPhrase("notes.else.default", {});
  return ``;
}

// ATLAS-MATH-OPERATIONS-UPDATE:BEGIN
atlasSourceMathOperationPhrase =
  function atlasSourceMathOperationPhraseCanonical(
    operation,
    index,
    sourceField,
  ) {
    return atlasMathOperationPhrase(
      operation?.operator,
      index,
      compareMathOperandPlain(operation, operation?.operandSourceFile || ""),
      sourceField,
    );
  };

function atlasMathRoundingPhrase(mode = "none", decimals = "0") {
  if (!mode || mode === "none") return "";
  return renderCatalogPhrase("analyst_logic.rounding.wrapper", {
    direction: atlasRoundingDirectionText(mode),
    target: atlasRoundingTargetText(decimals),
  });
}

const atlasThenActionPlainBeforeMathUpdate = thenActionPlain;
thenActionPlain = function thenActionPlainWithMath(step) {
  const p = step.params || {};
  if (p.then_action_type !== "set_column_calculation")
    return atlasThenActionPlainBeforeMathUpdate(step);
  const source = tableColumnPlain(
    p.then_value_source_file || p.source_file,
    p.then_value_source_alias ||
      sourceAliasFor(p.then_value_source_file || p.source_file),
    p.then_value_field,
  );
  const operations = parseSourceMathOperations(p.then_math_json || []);
  const math = operations
    .map(
      (operation) =>
        `${compareMathOperatorWord(operation.operator)} ${compareMathOperandPlain(operation, p.then_value_source_file || p.source_file)}`,
    )
    .filter(Boolean)
    .join(" ");
  return renderCatalogPhrase(
    "analyst_logic.if_then.then_set_column_calculation",
    {
      target_column: quotePhraseValue(p.then_target_column || ""),
      calculation: `${source}${math ? ` ${math}` : ""}${atlasMathRoundingPhrase(p.then_rounding_mode, p.then_rounding_decimal_places)}`,
    },
  );
};

const atlasAnalystLogicBeforeMathUpdate = analystLogic;
analystLogic = function analystLogicWithStructuredMath(step) {
  normalizeCatalogStep(step);
  const p = step.params || {};
  if (
    step.step_type === "create_column" &&
    p.value_mode === "Source field value" &&
    (parseSourceMathOperations(p.source_math_json || []).length ||
      (p.rounding_mode && p.rounding_mode !== "none"))
  ) {
    const base = tableColumnPlain(p.source_file, p.source_alias, p.field_name);
    const operations = parseSourceMathOperations(p.source_math_json || []);
    const math = operations
      .map(
        (operation) =>
          `${compareMathOperatorWord(operation.operator)} ${compareMathOperandPlain(operation, p.source_file)}`,
      )
      .filter(Boolean)
      .join(" ");
    return renderCatalogPhrase(
      "analyst_logic.create_column.source_field_calculation",
      {
        column_name: quotePhraseValue(p.column_name || step.field || ""),
        calculation: `${base}${math ? ` ${math}` : ""}${atlasMathRoundingPhrase(p.rounding_mode, p.rounding_decimal_places)}`,
      },
    );
  }
  return atlasAnalystLogicBeforeMathUpdate(step);
};
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
function atlasStringTransformAnalystValues(config) {
  return {
    target_column: quotePhraseValue(config.destinationColumn),
    source_column: tableColumnPlain(
      config.sourceFile,
      config.sourceAlias || sourceAliasFor(config.sourceFile),
      config.sourceField,
    ),
    position: config.position,
    character_count:
      atlasPositiveWholeNumber(config.count) ||
      phrasePlaceholder("positive_whole_number", "[positive whole number]"),
  };
}
function atlasStringTransformAnalystPhrase(config, context = "create_column") {
  const suffix =
    config.operation === "character_count" ? "string_length" : "substring";
  return renderCatalogPhrase(
    `analyst_logic.${context}.${suffix}`,
    atlasStringTransformAnalystValues(config),
  );
}
const atlasThenActionPlainBeforeStringTransform = thenActionPlain;
thenActionPlain = function thenActionPlainWithStringTransform(step) {
  const p = step.params || {};
  if (p.then_action_type === "set_column_string_transform")
    return atlasStringTransformAnalystPhrase(
      atlasStringTransformConfig(p, "then_"),
      "if_then",
    );
  return atlasThenActionPlainBeforeStringTransform(step);
};
const atlasElseActionPlainBeforeStringTransform = elseActionPlain;
elseActionPlain = function elseActionPlainWithStringTransform(step) {
  const p = step.params || {};
  if (p.then_action_type === "set_column_string_transform")
    return renderCatalogPhrase("analyst_logic.else.string_transform", {
      phrase: atlasStringTransformAnalystPhrase(
        atlasStringTransformConfig(p, "then_"),
        "if_then",
      ),
    });
  return atlasElseActionPlainBeforeStringTransform(step);
};
const atlasAnalystLogicBeforeStringTransform = analystLogic;
analystLogic = function analystLogicWithStringTransform(step) {
  normalizeCatalogStep?.(step);
  if (
    step?.step_type === "create_column" &&
    step.params?.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE
  )
    return atlasStringTransformAnalystPhrase(
      atlasStringTransformConfig(step.params),
      "create_column",
    );
  return atlasAnalystLogicBeforeStringTransform(step);
};
// ATLAS-STRING-TRANSFORM-UPDATE:END
