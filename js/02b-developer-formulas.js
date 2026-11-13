// -----------------------------------------------------------------------------
// Developer Logic formulas
// -----------------------------------------------------------------------------
// Builds approximate Excel 365, SQL Server, and Python (pandas) formulas for one
// logic line. Each formula is a row-level expression, not a full query or
// script, using these conventions:
//   Excel  - the data is an Excel table; [@[Field]] is the current row and
//            Table[Field] is a whole column. Filter-style lines return TRUE for
//            rows to keep.
//   SQL    - expressions for a SELECT list (expr AS [Column]) or a WHERE clause.
//            Fields are qualified as [alias].[Field] only when the field name
//            exists in more than one audit source.
//   Python - `df` is the working DataFrame, `sources["alias"]` holds each source
//            DataFrame, and pandas/numpy are imported as pd/np.
// Every step type goes through atlasDeveloperFormulas(); developerLogic() only
// formats the result.

const ATLAS_DEV_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

const ATLAS_DEV_COMPARE_OPERATORS = {
  "is equal to": "=",
  equals: "=",
  "=": "=",
  "is not equal to": "<>",
  "not equal to": "<>",
  "<>": "<>",
  "is greater than": ">",
  "greater than": ">",
  ">": ">",
  "is greater than or equal to": ">=",
  "greater than or equal to": ">=",
  ">=": ">=",
  "is less than": "<",
  "less than": "<",
  "<": "<",
  "is less than or equal to": "<=",
  "less than or equal to": "<=",
  "<=": "<=",
};

const ATLAS_DEV_TEXT_MATCH_OPERATORS = {
  contains: { kind: "contains", negated: false },
  "does not contain": { kind: "contains", negated: true },
  "starts with": { kind: "starts", negated: false },
  "does not start with": { kind: "starts", negated: true },
  "ends with": { kind: "ends", negated: false },
  "does not end with": { kind: "ends", negated: true },
};

const ATLAS_DEV_BLANK_OPERATORS = {
  "is blank": false,
  "is blank/null": false,
  "is null": false,
  "is not blank": true,
  "is not blank/null": true,
  "is not null": true,
};

const ATLAS_DEV_NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const ATLAS_DEV_ORDINAL_WORDS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const ATLAS_DEV_DELIMITER_WORDS = {
  comma: ",",
  space: " ",
  hyphen: "-",
  dash: "-",
  underscore: "_",
  period: ".",
  dot: ".",
  slash: "/",
  "forward slash": "/",
  backslash: "\\",
  pipe: "|",
  semicolon: ";",
  colon: ":",
  tab: "\t",
};

const ATLAS_DEV_PANDAS_JOIN = {
  "INNER JOIN": "inner",
  "LEFT JOIN": "left",
  "RIGHT JOIN": "right",
  "FULL OUTER JOIN": "outer",
};

// ---- Phrases and placeholders ------------------------------------------------

function atlasDevPhrase(path, values = {}) {
  if (typeof renderCatalogPhrase !== "function")
    return `[Missing phrase path: ${path}]`;
  return renderCatalogPhrase(path, values);
}

function atlasDevPlaceholder(key, fallback) {
  if (typeof phrasePlaceholder === "function")
    return phrasePlaceholder(key, fallback);
  return fallback;
}

// ---- Literals and identifiers ------------------------------------------------

function atlasDevExcelString(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function atlasDevSqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function atlasDevPyString(value) {
  return JSON.stringify(String(value ?? ""));
}

function atlasDevString(value, dialect) {
  if (dialect === "excel") return atlasDevExcelString(value);
  if (dialect === "sql") return atlasDevSqlString(value);
  return atlasDevPyString(value);
}

/** Normalizes a numeric literal so every dialect parses it (no leading zeros). */
function atlasDevNumber(value) {
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? String(number) : String(value).trim();
}

function atlasDevIsNumberText(value) {
  return ATLAS_DEV_NUMBER_PATTERN.test(String(value ?? "").trim());
}

/** Escapes a name inside an Excel structured reference bracket. */
function atlasDevExcelColumnName(name) {
  return String(name).replace(/(['[\]#])/g, "'$1");
}

function atlasDevSqlName(name) {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

/** Excel table name derived from a source alias (letters, digits, underscores). */
function atlasDevExcelTable(alias) {
  const cleaned = String(alias || "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "Table1";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

function atlasDevExcelTableColumn(alias, name) {
  return `${atlasDevExcelTable(alias)}[${atlasDevExcelColumnName(name)}]`;
}

function atlasDevSourceAlias(sourceFile = "", sourceAlias = "") {
  const alias = String(sourceAlias || "").trim();
  if (alias) return alias;
  const file = String(sourceFile || "").trim();
  if (!file) return "";
  try {
    return (
      (typeof sourceAliasFor === "function" && sourceAliasFor(file)) || file
    );
  } catch (_error) {
    return file;
  }
}

function atlasDevPySource(alias) {
  return `sources[${atlasDevPyString(alias || atlasDevPlaceholder("source", "[source]"))}]`;
}

function atlasDevSqlSource(alias) {
  return alias
    ? atlasDevSqlName(alias)
    : atlasDevPlaceholder("source", "[source]");
}

// ---- Field metadata ----------------------------------------------------------

const atlasDevFieldSourceIndexCache = new WeakMap();

/** Maps each field name to the audit sources that contain it (memoized per audit). */
function atlasDevFieldSourceIndex() {
  const audit =
    typeof state !== "undefined" && state?.audit ? state.audit : null;
  if (!audit || typeof fieldsForSource !== "function") return null;
  const sources = Array.isArray(audit.sources) ? audit.sources : [];
  const signature = `${sources.length}|${(audit.fields || []).length}|${sources
    .map((source) => source.sourceKey || source.name || source.alias || "")
    .join("|")}`;
  const cached = atlasDevFieldSourceIndexCache.get(audit);
  if (cached?.signature === signature) return cached.index;
  const index = new Map();
  sources.forEach((source) => {
    const key = source.sourceKey || source.name || source.alias;
    if (!key) return;
    let fields = [];
    try {
      fields = fieldsForSource(key) || [];
    } catch (_error) {
      fields = [];
    }
    fields.forEach((field) => {
      [field.fieldName, field.rawFieldName, field.name, field.vanityLabel]
        .filter(Boolean)
        .map(String)
        .forEach((name) => {
          if (!index.has(name)) index.set(name, new Set());
          index.get(name).add(key);
        });
    });
  });
  atlasDevFieldSourceIndexCache.set(audit, { signature, index });
  return index;
}

function atlasDevFieldIsAmbiguous(fieldName) {
  try {
    return (atlasDevFieldSourceIndex()?.get(String(fieldName))?.size || 0) > 1;
  } catch (_error) {
    return false;
  }
}

function atlasDevFieldIsNumeric(field = {}) {
  if (
    typeof atlasFindFieldRecord !== "function" ||
    typeof atlasIsNumericField !== "function"
  )
    return false;
  try {
    const record = atlasFindFieldRecord(field.sourceFile, field.fieldName);
    return !!record && atlasIsNumericField(record);
  } catch (_error) {
    return false;
  }
}

// ---- Field references --------------------------------------------------------

function atlasDevFieldSpec(sourceFile, sourceAlias, fieldName) {
  return {
    sourceFile: String(sourceFile || "").trim(),
    sourceAlias: String(sourceAlias || "").trim(),
    fieldName: String(fieldName || "").trim(),
  };
}

/** Row-level reference to a field in one dialect. */
function atlasDevField(field = {}, dialect) {
  const name = String(field.fieldName || "").trim();
  if (!name) return atlasDevPlaceholder("field", "[field]");
  if (dialect === "excel") return `[@[${atlasDevExcelColumnName(name)}]]`;
  if (dialect === "python") return `df[${atlasDevPyString(name)}]`;
  const alias = atlasDevSourceAlias(field.sourceFile, field.sourceAlias);
  return alias && atlasDevFieldIsAmbiguous(name)
    ? `${atlasDevSqlName(alias)}.${atlasDevSqlName(name)}`
    : atlasDevSqlName(name);
}

/** Text form of a field for pandas string methods (blank for missing values). */
function atlasDevPyText(reference) {
  return `${reference}.fillna("").astype(str)`;
}

/** Removes one pair of parentheses that wraps the whole expression. */
function atlasDevUnwrap(expression = "") {
  const value = String(expression || "").trim();
  if (!value.startsWith("(") || !value.endsWith(")")) return value;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return value;
  }
  return value.slice(1, -1);
}

// ---- Math and rounding -------------------------------------------------------

function atlasDevMathOperand(operation = {}, dialect) {
  if ((operation.operandType || "number") === "field")
    return atlasDevField(
      atlasDevFieldSpec(
        operation.operandSourceFile,
        operation.operandSourceAlias,
        operation.operandFieldName,
      ),
      dialect,
    );
  const operand = String(operation.operand ?? "").trim();
  if (!operand) return atlasDevPlaceholder("number", "[number]");
  const number = atlasDevIsNumberText(operand)
    ? atlasDevNumber(operand)
    : operand;
  // Integer division in SQL Server truncates, so divide by a decimal.
  if (dialect === "sql" && operation.operator === "/" && /^-?\d+$/.test(number))
    return `${number}.0`;
  return number;
}

/** Applies math operations left to right: ((base op a) op b). */
function atlasDevMath(base, operations = [], dialect) {
  let expression = base;
  let hasDivision = false;
  (operations || []).forEach((operation) => {
    let operand = atlasDevMathOperand(operation, dialect);
    if (operation.operator === "/") {
      hasDivision = true;
      if ((operation.operandType || "number") === "field") {
        if (dialect === "sql") operand = `NULLIF(${operand}, 0)`;
        if (dialect === "python") operand = `${operand}.replace(0, np.nan)`;
      }
    }
    expression = `(${expression} ${operation.operator} ${operand})`;
  });
  return { expression, hasDivision };
}

function atlasDevRoundingMode(value) {
  const mode = String(value || "none").toLowerCase();
  return ["nearest", "up", "down"].includes(mode) ? mode : "none";
}

function atlasDevDecimalPlaces(value) {
  const raw =
    typeof atlasDecimalPlacesValue === "function"
      ? atlasDecimalPlacesValue(value, "0")
      : value;
  const number = Number.parseInt(raw, 10);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

/**
 * Rounds like Excel in every dialect: nearest rounds half away from zero,
 * down truncates toward zero, and up rounds away from zero.
 */
function atlasDevRound(expression, mode, places, dialect) {
  if (mode === "none") return expression;
  const base = atlasDevUnwrap(expression);
  if (dialect === "excel") {
    const fn = { nearest: "ROUND", up: "ROUNDUP", down: "ROUNDDOWN" }[mode];
    return `${fn}(${base}, ${places})`;
  }
  if (dialect === "sql") {
    if (mode === "nearest") return `ROUND(${base}, ${places})`;
    if (mode === "down") return `ROUND(${base}, ${places}, 1)`;
    if (places === 0) return `SIGN(${base}) * CEILING(ABS(${base}))`;
    return `SIGN(${base}) * CEILING(ABS(${base}) * POWER(10.0, ${places})) / POWER(10.0, ${places})`;
  }
  const grouped = /\s/.test(base) ? `(${base})` : base;
  const scale = places === 0 ? "" : ` * 10**${places}`;
  const unscale = places === 0 ? "" : ` / 10**${places}`;
  const scaled = places === 0 ? base : `${grouped}${scale}`;
  const absScaled = `np.abs(${base})${scale}`;
  if (mode === "down") return `np.trunc(${scaled})${unscale}`;
  if (mode === "up")
    return `np.sign(${base}) * np.ceil(${absScaled})${unscale}`;
  return `np.sign(${base}) * np.floor(${absScaled} + 0.5)${unscale}`;
}

/** Field value with optional math and rounding, shared by create and THEN steps. */
function atlasDevCalculation(field, operations, mode, places, dialect) {
  const math = atlasDevMath(atlasDevField(field, dialect), operations, dialect);
  const rounded = atlasDevRound(math.expression, mode, places, dialect);
  if (dialect === "excel" && math.hasDivision)
    return `IFERROR(${atlasDevUnwrap(rounded)}, "")`;
  return atlasDevUnwrap(rounded);
}

// ---- String transformations --------------------------------------------------

function atlasDevStringTransform(config = {}, dialect) {
  const field = atlasDevField(
    atlasDevFieldSpec(
      config.sourceFile,
      config.sourceAlias,
      config.sourceField,
    ),
    dialect,
  );
  if (config.operation === "character_count") {
    if (dialect === "python") return `${field}.astype("string").str.len()`;
    return `LEN(${field})`;
  }
  const count =
    (typeof atlasPositiveWholeNumber === "function"
      ? atlasPositiveWholeNumber(config.count)
      : /^\d+$/.test(String(config.count || "")) && Number(config.count) > 0
        ? String(Number(config.count))
        : "") ||
    atlasDevPlaceholder("positive_whole_number", "[positive whole number]");
  const last = config.operation === "last_characters";
  if (dialect === "python")
    return last
      ? `${field}.astype("string").str[-${count}:]`
      : `${field}.astype("string").str[:${count}]`;
  return `${last ? "RIGHT" : "LEFT"}(${field}, ${count})`;
}

function atlasDevStringTransformConfig(params = {}, prefix = "") {
  if (typeof atlasStringTransformConfig === "function")
    return atlasStringTransformConfig(params, prefix);
  return {};
}

// ---- Conditions --------------------------------------------------------------

function atlasDevNot(expression, dialect) {
  if (dialect === "excel") return `NOT(${atlasDevUnwrap(expression)})`;
  if (dialect === "sql") return `NOT (${atlasDevUnwrap(expression)})`;
  return `~(${atlasDevUnwrap(expression)})`;
}

/** Arguments of an Excel call when the whole expression is fn(...), else null. */
function atlasDevExcelCallArgs(expression, fn) {
  const value = String(expression || "");
  if (!value.startsWith(`${fn}(`) || !value.endsWith(")")) return null;
  const inner = atlasDevUnwrap(value.slice(fn.length));
  return inner === value.slice(fn.length) ? null : inner;
}

/** Joins expressions with AND/OR in one dialect. */
function atlasDevCombine(expressions, connector, dialect) {
  const list = expressions.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (dialect === "excel")
    // AND(a, AND(b, c)) reads better as AND(a, b, c).
    return `${connector}(${list
      .map((item) => atlasDevExcelCallArgs(item, connector) ?? item)
      .join(", ")})`;
  if (dialect === "sql") return `(${list.join(` ${connector} `)})`;
  return `(${list.join(connector === "AND" ? " & " : " | ")})`;
}

function atlasDevBlankTest(left, notBlank, dialect) {
  if (dialect === "excel")
    return notBlank ? `LEN(TRIM(${left}))>0` : `LEN(TRIM(${left}))=0`;
  if (dialect === "sql")
    return `NULLIF(LTRIM(RTRIM(${left})), '') IS ${notBlank ? "NOT " : ""}NULL`;
  return `${atlasDevPyText(left)}.str.strip().${notBlank ? "ne" : "eq"}("")`;
}

function atlasDevTextMatchTerm(left, kind, term, dialect) {
  if (dialect === "excel") {
    if (term.literal) {
      if (kind === "contains")
        return `ISNUMBER(SEARCH(${atlasDevExcelString(term.value.replace(/([~*?])/g, "~$1"))}, ${left}))`;
      return `${kind === "starts" ? "LEFT" : "RIGHT"}(${left}, ${term.value.length})=${atlasDevExcelString(term.value)}`;
    }
    if (kind === "contains")
      return `ISNUMBER(SEARCH(${term.expression}, ${left}))`;
    return `${kind === "starts" ? "LEFT" : "RIGHT"}(${left}, LEN(${term.expression}))=${term.expression}`;
  }
  if (dialect === "sql") {
    const pattern = term.literal
      ? atlasDevSqlString(
          `${kind === "starts" ? "" : "%"}${term.value.replace(/([%_[])/g, "[$1]")}${kind === "ends" ? "" : "%"}`,
        )
      : [
          kind === "starts" ? "" : "'%'",
          term.expression,
          kind === "ends" ? "" : "'%'",
        ]
          .filter(Boolean)
          .join(" + ");
    return `${left} LIKE ${pattern}`;
  }
  if (term.literal) {
    const text = atlasDevPyText(left);
    if (kind === "contains")
      return `${text}.str.contains(${atlasDevPyString(term.value)}, case=False, regex=False)`;
    return `${text}.str.lower().str.${kind === "starts" ? "startswith" : "endswith"}(${atlasDevPyString(term.value.toLowerCase())})`;
  }
  const leftName = atlasDevPyString(term.leftName);
  const rightName = atlasDevPyString(term.rightName);
  const leftText = `str(row[${leftName}]).lower()`;
  const rightText = `str(row[${rightName}]).lower()`;
  const test =
    kind === "contains"
      ? `${rightText} in ${leftText}`
      : `${leftText}.${kind === "starts" ? "startswith" : "endswith"}(${rightText})`;
  return `df.apply(lambda row: ${test}, axis=1)`;
}

function atlasDevTextMatch(left, match, terms, dialect) {
  const parts = terms.map((term) => {
    const test = atlasDevTextMatchTerm(left, match.kind, term, dialect);
    if (!match.negated) return test;
    if (dialect === "sql") return test.replace(" LIKE ", " NOT LIKE ");
    return atlasDevNot(test, dialect);
  });
  // A negated match must fail every value; a positive match needs any value.
  return atlasDevCombine(parts, match.negated ? "AND" : "OR", dialect);
}

function atlasDevCompare(left, symbol, right, dialect) {
  if (dialect === "excel") return `${left}${symbol}${right}`;
  if (dialect === "sql") return `${left} ${symbol} ${right}`;
  const python = { "=": "==", "<>": "!=" }[symbol] || symbol;
  return `(${left} ${python} ${right})`;
}

function atlasDevValueList(condition = {}) {
  return String(condition.compareValue ?? condition.value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** One condition (no groups) as a boolean expression. */
function atlasDevConditionLeaf(condition = {}, dialect) {
  const leftField = atlasDevFieldSpec(
    condition.sourceFile,
    condition.sourceAlias,
    condition.fieldName || condition.field,
  );
  const left = atlasDevField(leftField, dialect);
  const operator = String(condition.operator || "is equal to")
    .trim()
    .toLowerCase();
  const valueMode = condition.valueMode || "values";

  if (valueMode === "blank")
    return atlasDevBlankTest(left, operator.includes("not"), dialect);
  if (operator in ATLAS_DEV_BLANK_OPERATORS)
    return atlasDevBlankTest(
      left,
      ATLAS_DEV_BLANK_OPERATORS[operator],
      dialect,
    );
  if (valueMode === "expression") {
    const expression =
      String(condition.expression || "").trim() ||
      atlasDevPlaceholder("expression", "[expression]");
    const wrapped = `(${expression})`;
    return operator.includes("not") ? atlasDevNot(wrapped, dialect) : wrapped;
  }

  const textMatch = ATLAS_DEV_TEXT_MATCH_OPERATORS[operator];
  if (valueMode === "field") {
    const compareField = atlasDevFieldSpec(
      condition.compareSourceFile,
      condition.compareSourceAlias,
      condition.compareFieldName,
    );
    const operations =
      typeof parseSourceMathOperations === "function"
        ? parseSourceMathOperations(
            condition.compareMathJson ||
              condition.compare_math_json ||
              condition.compareMath ||
              [],
          )
        : [];
    const right = atlasDevMath(
      atlasDevField(compareField, dialect),
      operations,
      dialect,
    ).expression;
    if (textMatch)
      return atlasDevTextMatch(
        left,
        textMatch,
        [
          {
            literal: false,
            expression: right,
            leftName: leftField.fieldName,
            rightName: compareField.fieldName,
          },
        ],
        dialect,
      );
    return atlasDevCompare(
      left,
      ATLAS_DEV_COMPARE_OPERATORS[operator] || "=",
      right,
      dialect,
    );
  }

  const values = atlasDevValueList(condition);
  if (textMatch)
    return atlasDevTextMatch(
      left,
      textMatch,
      (values.length ? values : [""]).map((value) => ({
        literal: true,
        value,
      })),
      dialect,
    );

  const symbol = ATLAS_DEV_COMPARE_OPERATORS[operator] || "=";
  const relational = symbol !== "=" && symbol !== "<>";
  // Compare as numbers only when the values are numeric and the field is a
  // cataloged number (or the operator is < / >), so codes like "1016" stay text.
  const numeric =
    values.length > 0 &&
    values.every(atlasDevIsNumberText) &&
    (relational || atlasDevFieldIsNumeric(leftField));
  const literals = (values.length ? values : [""]).map((value) =>
    numeric ? atlasDevNumber(value) : atlasDevString(value, dialect),
  );
  if (literals.length === 1)
    return atlasDevCompare(left, symbol, literals[0], dialect);
  if (!relational) {
    const negated = symbol === "<>";
    if (dialect === "sql")
      return `${left} ${negated ? "NOT IN" : "IN"} (${literals.join(", ")})`;
    if (dialect === "python")
      return `${negated ? "~" : ""}${left}.isin([${literals.join(", ")}])`;
    return atlasDevCombine(
      literals.map((literal) =>
        atlasDevCompare(left, symbol, literal, dialect),
      ),
      negated ? "AND" : "OR",
      dialect,
    );
  }
  return atlasDevCombine(
    literals.map((literal) => atlasDevCompare(left, symbol, literal, dialect)),
    "OR",
    dialect,
  );
}

function atlasDevIsGroup(node) {
  if (typeof atlasIsConditionGroup === "function")
    return atlasIsConditionGroup(node);
  return !!node && node.conditionType === "group";
}

function atlasDevConnector(value, fallback = "AND") {
  if (typeof atlasConditionConnectorOf === "function")
    return atlasConditionConnectorOf(value, fallback);
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return normalized === "OR" || normalized === "AND" ? normalized : fallback;
}

/**
 * Condition tree as one boolean expression. Bullet groups use their own
 * connector; top-level connectors follow SQL precedence (AND before OR).
 */
function atlasDevConditionTree(nodes, dialect) {
  const nodeExpression = (node) => {
    if (!atlasDevIsGroup(node)) return atlasDevConditionLeaf(node, dialect);
    const items = Array.isArray(node.items) ? node.items : [];
    return atlasDevCombine(
      items.map(nodeExpression),
      atlasDevConnector(node.groupConnector, "OR"),
      dialect,
    );
  };
  const list = Array.isArray(nodes) ? nodes : [];
  const orRuns = [];
  list.forEach((node, index) => {
    const expression = nodeExpression(node);
    if (!expression) return;
    if (
      !orRuns.length ||
      (index > 0 && atlasDevConnector(node.connector) === "OR")
    )
      orRuns.push([expression]);
    else orRuns[orRuns.length - 1].push(expression);
  });
  const combined = atlasDevCombine(
    orRuns.map((run) => atlasDevCombine(run, "AND", dialect)),
    "OR",
    dialect,
  );
  return (
    atlasDevUnwrap(combined) || atlasDevPlaceholder("condition", "[condition]")
  );
}

// ---- Formula sets ------------------------------------------------------------

const ATLAS_DEV_DIALECTS = ["excel", "sql", "python"];

function atlasDevEachDialect(build) {
  return Object.fromEntries(
    ATLAS_DEV_DIALECTS.map((dialect) => [dialect, build(dialect)]),
  );
}

/** Assigns a row-level value to a column in each dialect. */
function atlasDevAssignment(target, valueFor) {
  const column = target || atlasDevPlaceholder("column_name", "[column name]");
  return {
    excel: `=${atlasDevUnwrap(valueFor("excel"))}`,
    sql: `${atlasDevUnwrap(valueFor("sql"))} AS ${atlasDevSqlName(column)}`,
    python: `df[${atlasDevPyString(column)}] = ${atlasDevUnwrap(valueFor("python"))}`,
  };
}

function atlasDevSteps() {
  return typeof state !== "undefined" && Array.isArray(state?.audit?.steps)
    ? state.audit.steps
    : [];
}

function atlasDevStepNumber(stepId) {
  try {
    return (
      (typeof stepNumberFor === "function" && stepNumberFor(stepId)) || "?"
    );
  } catch (_error) {
    return "?";
  }
}

/** The managed ELSE step attached to an IF step, if any. */
function atlasDevElseStepFor(step) {
  if (!step?.id || step.params?.include_else_branch === "No") return null;
  return (
    atlasDevSteps().find(
      (item) =>
        item?.step_type === "else" &&
        item.enabled !== false &&
        item.params?.parent_if_step_id === step.id,
    ) || null
  );
}

/**
 * Column and value a THEN/ELSE action writes, or null for filter and freeform
 * actions.
 */
function atlasDevActionValue(params = {}, dialect) {
  const action = params.then_action_type || "freeform";
  if (action === "display_text")
    return {
      target:
        params.then_output_column ||
        atlasDevPlaceholder("error_message_column", "Error Message"),
      value: atlasDevString(params.then_text || "", dialect),
    };
  if (action === "set_column_value")
    return {
      target:
        params.then_target_column ||
        atlasDevPlaceholder("target_column", "[target column]"),
      value: atlasDevField(
        atlasDevFieldSpec(
          params.then_value_source_file || params.source_file,
          params.then_value_source_alias,
          params.then_value_field,
        ),
        dialect,
      ),
    };
  if (action === "set_column_calculation") {
    const operations =
      typeof parseSourceMathOperations === "function"
        ? parseSourceMathOperations(params.then_math_json || [])
        : [];
    return {
      target:
        params.then_target_column ||
        atlasDevPlaceholder("target_column", "[target column]"),
      value: atlasDevCalculation(
        atlasDevFieldSpec(
          params.then_value_source_file || params.source_file,
          params.then_value_source_alias,
          params.then_value_field,
        ),
        operations,
        atlasDevRoundingMode(params.then_rounding_mode),
        atlasDevDecimalPlaces(params.then_rounding_decimal_places),
        dialect,
      ),
    };
  }
  if (action === "set_column_string_transform") {
    const config = atlasDevStringTransformConfig(params, "then_");
    return {
      target:
        config.destinationColumn ||
        atlasDevPlaceholder("destination_column", "[destination column]"),
      value: atlasDevStringTransform(config, dialect),
    };
  }
  return null;
}

/** Keep-rows formulas for Display / Do Not Display style actions. */
function atlasDevFilterFormulas(condition, keepMatches) {
  return {
    excel: keepMatches
      ? `=${condition.excel}`
      : `=${atlasDevNot(condition.excel, "excel")}`,
    sql: keepMatches
      ? `WHERE ${condition.sql}`
      : `WHERE ${atlasDevNot(condition.sql, "sql")}`,
    python: `mask = ${condition.python}\ndf = df[${keepMatches ? "mask" : "~mask"}]`,
  };
}

function atlasDevIfThen(step) {
  const params = step.params || {};
  const conditions =
    typeof parseStepConditions === "function" ? parseStepConditions(step) : [];
  const condition = atlasDevEachDialect((dialect) =>
    atlasDevConditionTree(conditions, dialect),
  );
  const action = params.then_action_type || "freeform";
  if (action === "display" || action === "do_not_display")
    return {
      ...atlasDevFilterFormulas(condition, action === "display"),
      notes: [atlasDevPhrase(`developer_logic.display_notes.${action}`)],
    };

  const thenValue = atlasDevEachDialect((dialect) =>
    atlasDevActionValue(params, dialect),
  );
  if (thenValue.excel) {
    const elseStep = atlasDevElseStepFor(step);
    const elseValue = elseStep
      ? atlasDevEachDialect((dialect) =>
          atlasDevActionValue(elseStep.params || {}, dialect),
        )
      : null;
    const folded =
      !!elseValue?.excel && elseValue.excel.target === thenValue.excel.target;
    const target = thenValue.excel.target;
    return {
      excel: `=IF(${condition.excel}, ${thenValue.excel.value}, ${folded ? elseValue.excel.value : '""'})`,
      sql: `CASE WHEN ${condition.sql} THEN ${thenValue.sql.value}${folded ? ` ELSE ${elseValue.sql.value}` : ""} END AS ${atlasDevSqlName(target)}`,
      python: [
        `mask = ${condition.python}`,
        `df.loc[mask, ${atlasDevPyString(target)}] = ${thenValue.python.value}`,
        folded
          ? `df.loc[~mask, ${atlasDevPyString(target)}] = ${elseValue.python.value}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      notes: [],
    };
  }

  // Freeform THEN text: give the row test and repeat the action as a note.
  const freeform = String(params.then_action || step.action || "").trim();
  return {
    excel: `=${condition.excel}`,
    sql: `CASE WHEN ${condition.sql} THEN 1 ELSE 0 END`,
    python: `mask = ${condition.python}`,
    notes: [
      freeform
        ? atlasDevPhrase("developer_logic.notes.freeform_action", {
            action: freeform,
          })
        : atlasDevPhrase("developer_logic.notes.matching_rows"),
    ],
  };
}

function atlasDevElse(step) {
  const params = step.params || {};
  const parentId = params.parent_if_step_id;
  const stepNumber = atlasDevStepNumber(parentId);
  const label = atlasDevPhrase("developer_logic.else_step", {
    step_number: stepNumber,
  });
  const parent = atlasDevSteps().find((item) => item?.id === parentId);
  if (!parent || parent.step_type !== "if_then") return { lead: label };

  const parentParams = parent.params || {};
  const parentValue = atlasDevActionValue(parentParams, "excel");
  const elseValue = atlasDevActionValue(params, "excel");
  if (parentValue && elseValue && parentValue.target === elseValue.target)
    return {
      lead: atlasDevPhrase("developer_logic.else_included", {
        step_number: stepNumber,
      }),
    };

  const conditions =
    typeof parseStepConditions === "function"
      ? parseStepConditions(parent)
      : [];
  const condition = atlasDevEachDialect((dialect) =>
    atlasDevConditionTree(conditions, dialect),
  );
  const action = params.then_action_type || "freeform";
  if (action === "display" || action === "do_not_display")
    // ELSE rows are the rows that fail the parent IF.
    return {
      lead: label,
      ...atlasDevFilterFormulas(condition, action === "do_not_display"),
      notes: [atlasDevPhrase(`developer_logic.display_notes.else_${action}`)],
    };
  if (elseValue) {
    const value = atlasDevEachDialect((dialect) =>
      atlasDevActionValue(params, dialect),
    );
    return {
      lead: label,
      excel: `=IF(${atlasDevNot(condition.excel, "excel")}, ${value.excel.value}, "")`,
      sql: `CASE WHEN ${atlasDevNot(condition.sql, "sql")} THEN ${value.sql.value} END AS ${atlasDevSqlName(elseValue.target)}`,
      python: `mask = ${condition.python}\ndf.loc[~mask, ${atlasDevPyString(elseValue.target)}] = ${value.python.value}`,
      notes: [],
    };
  }
  const freeform = String(params.then_action || "").trim();
  return {
    lead: label,
    excel: `=${atlasDevNot(condition.excel, "excel")}`,
    sql: `CASE WHEN ${atlasDevNot(condition.sql, "sql")} THEN 1 ELSE 0 END`,
    python: `mask = ${atlasDevNot(condition.python, "python")}`,
    notes: freeform
      ? [
          atlasDevPhrase("developer_logic.notes.freeform_action", {
            action: freeform,
          }),
        ]
      : [],
  };
}

function atlasDevCustomExpression(target, expression) {
  const text =
    String(expression || "")
      .trim()
      .replace(/^=/, "") || atlasDevPlaceholder("expression", "[expression]");
  return {
    ...atlasDevAssignment(target, () => text),
    notes: [atlasDevPhrase("developer_logic.notes.free_text_expression")],
  };
}

function atlasDevCreateColumn(step) {
  const params = step.params || {};
  const target =
    params.column_name ||
    step.field ||
    atlasDevPlaceholder("column_name", "[column name]");
  const mode = params.value_mode || "Static value";
  const sourceField = (fieldName) =>
    atlasDevFieldSpec(params.source_file, params.source_alias, fieldName);

  if (
    mode ===
    (typeof ATLAS_STRING_TRANSFORM_VALUE_MODE === "string"
      ? ATLAS_STRING_TRANSFORM_VALUE_MODE
      : "String transformation")
  ) {
    const config = atlasDevStringTransformConfig(params);
    return {
      ...atlasDevAssignment(config.destinationColumn || target, (dialect) =>
        atlasDevStringTransform(config, dialect),
      ),
      notes: [],
    };
  }
  if (mode === "Source field value") {
    const operations =
      typeof parseSourceMathOperations === "function"
        ? parseSourceMathOperations(params.source_math_json || [])
        : [];
    return {
      ...atlasDevAssignment(target, (dialect) =>
        atlasDevCalculation(
          sourceField(params.field_name),
          operations,
          atlasDevRoundingMode(params.rounding_mode || params.rounding_method),
          atlasDevDecimalPlaces(params.rounding_decimal_places),
          dialect,
        ),
      ),
      notes: [],
    };
  }
  if (mode === "Concatenate fields") {
    const first = atlasDevFieldSpec(
      params.concat_source_1 || params.source_file,
      params.concat_source_alias_1,
      params.concat_field_1,
    );
    const second = atlasDevFieldSpec(
      params.concat_source_2 || params.source_file,
      params.concat_source_alias_2,
      params.concat_field_2,
    );
    return {
      ...atlasDevAssignment(target, (dialect) => {
        const a = atlasDevField(first, dialect);
        const b = atlasDevField(second, dialect);
        if (dialect === "excel") return `${a}&${b}`;
        if (dialect === "sql") return `CONCAT(${a}, ${b})`;
        return `${atlasDevPyText(a)} + ${atlasDevPyText(b)}`;
      }),
      notes: [],
    };
  }
  if (mode === "Expression / calculation") {
    const expressionField = sourceField(
      params.expression_source_field || params.field_name,
    );
    if (params.expression_type === "first_characters")
      return {
        ...atlasDevAssignment(target, (dialect) =>
          atlasDevStringTransform(
            {
              operation: "first_characters",
              ...expressionField,
              sourceField: expressionField.fieldName,
              count: params.character_count,
            },
            dialect,
          ),
        ),
        notes: [],
      };
    if (params.expression_type === "character_count")
      return {
        ...atlasDevAssignment(target, (dialect) =>
          atlasDevStringTransform(
            {
              operation: "character_count",
              ...expressionField,
              sourceField: expressionField.fieldName,
            },
            dialect,
          ),
        ),
        notes: [],
      };
    return atlasDevCustomExpression(target, params.expression);
  }
  if (mode === "Expression")
    return atlasDevCustomExpression(target, params.expression);

  // Static value (and blank columns).
  const value = String(params.static_value ?? "");
  return {
    ...atlasDevAssignment(target, (dialect) => {
      if (value.trim()) return atlasDevString(value, dialect);
      if (dialect === "excel") return '""';
      return dialect === "sql" ? "NULL" : "pd.NA";
    }),
    notes: [],
  };
}

function atlasDevFormatDigits(format) {
  const match = String(format || "")
    .trim()
    .toLowerCase()
    .match(/^(\w+) digits? with leading zero(?:e)?s?$/);
  if (!match) return 0;
  return Number(match[1]) || ATLAS_DEV_NUMBER_WORDS[match[1]] || 0;
}

function atlasDevFormatField(step) {
  const params = step.params || {};
  const field = atlasDevFieldSpec(
    params.source_file,
    params.source_alias,
    params.field_name,
  );
  const target = field.fieldName || atlasDevPlaceholder("field", "[field]");
  const format = String(params.format || "text").trim();
  const normalized = format.toLowerCase();
  const digits = atlasDevFormatDigits(format);
  let notes = [];
  const formulas = atlasDevAssignment(target, (dialect) => {
    const ref = atlasDevField(field, dialect);
    if (digits) {
      if (dialect === "excel")
        return `TEXT(${ref}, ${atlasDevExcelString("0".repeat(digits))})`;
      if (dialect === "sql")
        return `RIGHT(REPLICATE('0', ${digits}) + CAST(${ref} AS VARCHAR(50)), ${digits})`;
      return `${ref}.astype("string").str.zfill(${digits})`;
    }
    if (normalized.includes("mm/dd/yyyy")) {
      if (dialect === "excel") return `TEXT(${ref}, "mm/dd/yyyy")`;
      if (dialect === "sql")
        return `CONVERT(VARCHAR(10), TRY_CONVERT(date, ${ref}), 101)`;
      return `pd.to_datetime(${ref}, errors="coerce").dt.strftime("%m/%d/%Y")`;
    }
    if (normalized === "number") {
      if (dialect === "excel") return `VALUE(${ref})`;
      if (dialect === "sql") return `TRY_CAST(${ref} AS DECIMAL(38, 10))`;
      return `pd.to_numeric(${ref}, errors="coerce")`;
    }
    if (normalized === "text") {
      if (dialect === "excel") return `TEXT(${ref}, "@")`;
      if (dialect === "sql") return `CAST(${ref} AS NVARCHAR(4000))`;
      return `${ref}.astype("string")`;
    }
    notes = [
      atlasDevPhrase("developer_logic.notes.unknown_format", { format }),
    ];
    if (dialect === "excel")
      return `TEXT(${ref}, ${atlasDevExcelString(format)})`;
    if (dialect === "sql")
      return `FORMAT(${ref}, ${atlasDevSqlString(format)})`;
    return `${ref}.astype("string")`;
  });
  return { ...formulas, notes };
}

function atlasDevSplitDelimiter(value) {
  const raw = String(value ?? "");
  const word = raw.trim().toLowerCase();
  if (ATLAS_DEV_DELIMITER_WORDS[word]) return ATLAS_DEV_DELIMITER_WORDS[word];
  return raw === "" ? "" : raw.trim() || raw;
}

/** Split part as a 1-based position, or "last". */
function atlasDevSplitPart(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return 1;
  if (/\blast\b/.test(text)) return "last";
  const digits = text.match(/\d+/);
  if (digits) return Math.max(1, Number(digits[0]));
  const word = Object.keys(ATLAS_DEV_ORDINAL_WORDS).find((key) =>
    new RegExp(`\\b${key}\\b`).test(text),
  );
  return word ? ATLAS_DEV_ORDINAL_WORDS[word] : 1;
}

function atlasDevSplitField(step) {
  const params = step.params || {};
  const field = atlasDevFieldSpec(
    params.source_file,
    params.source_alias,
    params.field_name,
  );
  const delimiter = atlasDevSplitDelimiter(params.split_on);
  const part = atlasDevSplitPart(params.split_part);
  const target =
    params.output_column ||
    atlasDevPlaceholder("output_column", "[output column]");
  const notes = [];
  if (!delimiter)
    notes.push(atlasDevPhrase("developer_logic.notes.missing_delimiter"));
  if (typeof part === "number" && part > 1)
    notes.push(atlasDevPhrase("developer_logic.notes.split_sql_version"));
  const formulas = atlasDevAssignment(target, (dialect) => {
    const ref = atlasDevField(field, dialect);
    const d = atlasDevString(
      delimiter || atlasDevPlaceholder("delimiter", "[delimiter]"),
      dialect,
    );
    if (dialect === "excel")
      return part === "last"
        ? `TAKE(TEXTSPLIT(${ref}, ${d}), , -1)`
        : `INDEX(TEXTSPLIT(${ref}, ${d}), ${part})`;
    if (dialect === "sql") {
      if (part === "last")
        return `RIGHT(${ref}, CHARINDEX(REVERSE(${d}), REVERSE(${d} + ${ref})) - 1)`;
      if (part === 1) return `LEFT(${ref}, CHARINDEX(${d}, ${ref} + ${d}) - 1)`;
      return `(SELECT [value] FROM STRING_SPLIT(${ref}, ${d}, 1) WHERE [ordinal] = ${part})`;
    }
    return `${ref}.astype("string").str.split(${d}, regex=False).str[${part === "last" ? -1 : part - 1}]`;
  });
  return { ...formulas, notes };
}

function atlasDevSortRecords(step) {
  const params = step.params || {};
  const fields = (
    typeof atlasSortFieldsFromParams === "function"
      ? atlasSortFieldsFromParams(params)
      : []
  ).filter((item) => item.fieldName);
  if (!fields.length)
    fields.push({
      sourceFile: params.source_file,
      sourceAlias: params.source_alias,
      fieldName: params.field_name,
      direction: params.sort_direction,
    });
  const table = atlasDevExcelTable(
    atlasDevSourceAlias(
      fields[0].sourceFile || params.source_file,
      fields[0].sourceAlias || params.source_alias,
    ),
  );
  const descending = (item) => item.direction === "Descending";
  return {
    excel: `=SORTBY(${table}, ${fields
      .map(
        (item) =>
          `${table}[${atlasDevExcelColumnName(item.fieldName || atlasDevPlaceholder("field", "[field]"))}], ${descending(item) ? -1 : 1}`,
      )
      .join(", ")})`,
    sql: `ORDER BY ${fields
      .map(
        (item) =>
          `${atlasDevField(item, "sql")} ${descending(item) ? "DESC" : "ASC"}`,
      )
      .join(", ")}`,
    python: `df = df.sort_values([${fields
      .map((item) => atlasDevPyString(item.fieldName))
      .join(", ")}], ascending=[${fields
      .map((item) => (descending(item) ? "False" : "True"))
      .join(", ")}], kind="stable")`,
    notes: [],
  };
}

function atlasDevRemoveDuplicates(step) {
  const params = step.params || {};
  const fields =
    typeof atlasDuplicateFieldsFromParams === "function"
      ? atlasDuplicateFieldsFromParams(params)
      : [];
  if (!fields.length)
    fields.push(
      atlasDevFieldSpec(
        params.source_file,
        params.source_alias,
        params.field_name,
      ),
    );
  const action = params.duplicate_action || "Keep first record";
  const alias = atlasDevSourceAlias(
    fields[0].sourceFile || params.source_file,
    fields[0].sourceAlias || params.source_alias,
  );
  const column = (item) =>
    atlasDevExcelTableColumn(
      alias,
      item.fieldName || atlasDevPlaceholder("field", "[field]"),
    );
  const row = (item) => atlasDevField(item, "excel");
  const criteria = fields
    .map((item) => {
      if (action === "Keep last record")
        return `${row(item)}:INDEX(${column(item)}, ROWS(${column(item)})), ${row(item)}`;
      if (action === "Drop all duplicated records")
        return `${column(item)}, ${row(item)}`;
      return `INDEX(${column(item)}, 1):${row(item)}, ${row(item)}`;
    })
    .join(", ");
  const partition = fields.map((item) => atlasDevField(item, "sql")).join(", ");
  const rank = `ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY (SELECT NULL)) AS [Duplicate Rank]`;
  const count = `COUNT(*) OVER (PARTITION BY ${partition}) AS [Duplicate Count]`;
  const sql =
    action === "Drop all duplicated records"
      ? `${count} -- keep rows where [Duplicate Count] = 1`
      : action === "Keep last record"
        ? `${rank}, ${count} -- keep rows where [Duplicate Rank] = [Duplicate Count]`
        : `${rank} -- keep rows where [Duplicate Rank] = 1`;
  const keep =
    action === "Drop all duplicated records"
      ? "False"
      : action === "Keep last record"
        ? '"last"'
        : '"first"';
  return {
    excel: `=COUNTIFS(${criteria})=1`,
    sql,
    python: `df = df.drop_duplicates(subset=[${fields
      .map((item) => atlasDevPyString(item.fieldName))
      .join(", ")}], keep=${keep})`,
    notes: [atlasDevPhrase("developer_logic.notes.keep_true_rows")],
  };
}

function atlasDevJoinTypeName(joinType) {
  const normalized = String(joinType || "INNER JOIN").toUpperCase();
  return ATLAS_DEV_PANDAS_JOIN[normalized] ? normalized : "INNER JOIN";
}

function atlasDevJoinKeptRows(joinType) {
  const key = {
    "LEFT JOIN": "left",
    "RIGHT JOIN": "right",
    "FULL OUTER JOIN": "full",
  }[joinType];
  return atlasDevPhrase(`developer_logic.kept_rows.${key || "inner"}`);
}

function atlasDevUnion(params = {}) {
  const left = atlasDevSourceAlias(
    params.left_source || params.union_left_source,
    params.left_alias || params.union_left_alias,
  );
  const right = atlasDevSourceAlias(
    params.right_source || params.union_right_source,
    params.right_alias || params.union_right_alias,
  );
  return {
    excel: `=VSTACK(${atlasDevExcelTable(left)}, ${atlasDevExcelTable(right)})`,
    sql: `SELECT * FROM ${atlasDevSqlSource(left)}\nUNION ALL\nSELECT * FROM ${atlasDevSqlSource(right)}`,
    python: `df = pd.concat([${atlasDevPySource(left)}, ${atlasDevPySource(right)}], ignore_index=True)`,
    notes: [],
  };
}

function atlasDevJoin(step) {
  const params = step.params || {};
  if (String(params.join_type || "").toUpperCase() === "UNION")
    return atlasDevUnion(params);
  const joinType = atlasDevJoinTypeName(params.join_type);
  const leftAlias =
    atlasDevSourceAlias(params.left_source, params.left_alias) ||
    atlasDevPlaceholder("left_source", "[left source]");
  const rightAlias =
    atlasDevSourceAlias(params.right_source, params.right_alias) ||
    atlasDevPlaceholder("right_source", "[right source]");
  const pairs = (
    typeof atlasJoinKeyPairsInUse === "function"
      ? atlasJoinKeyPairsInUse(params)
      : [{ left_field: params.left_field, right_field: params.right_field }]
  ).map((pair) => ({
    left: pair.left_field || atlasDevPlaceholder("left_key", "[left key]"),
    right: pair.right_field || atlasDevPlaceholder("right_key", "[right key]"),
  }));
  if (!pairs.length)
    pairs.push({
      left: atlasDevPlaceholder("left_key", "[left key]"),
      right: atlasDevPlaceholder("right_key", "[right key]"),
    });
  const leftKeyList = pairs.map((pair) => pair.left);
  const lead = atlasDevPhrase(
    pairs.length > 1 ? "developer_logic.join_multi" : "developer_logic.join",
    {
      join_type: joinType,
      kept_rows: atlasDevJoinKeptRows(joinType),
      left_alias: leftAlias,
      left_field: pairs[0].left,
      right_alias: rightAlias,
      right_field: pairs[0].right,
      key_pairs: pairs
        .map(
          (pair) =>
            `"${leftAlias}"."${pair.left}" = "${rightAlias}"."${pair.right}"`,
        )
        .join(" AND "),
    },
  );
  const rightTable = atlasDevExcelTable(rightAlias);
  const excel =
    pairs.length === 1
      ? `=XLOOKUP([@[${atlasDevExcelColumnName(pairs[0].left)}]], ${atlasDevExcelTableColumn(rightAlias, pairs[0].right)}, ${rightTable}, "")`
      : `=XLOOKUP(1, ${pairs
          .map(
            (pair) =>
              `(${atlasDevExcelTableColumn(rightAlias, pair.right)}=[@[${atlasDevExcelColumnName(pair.left)}]])`,
          )
          .join("*")}, ${rightTable}, "")`;
  const pyKeys = (keys) =>
    keys.length === 1
      ? atlasDevPyString(keys[0])
      : `[${keys.map(atlasDevPyString).join(", ")}]`;
  const notes = [];
  if (joinType === "RIGHT JOIN" || joinType === "FULL OUTER JOIN")
    notes.push(atlasDevPhrase("developer_logic.notes.excel_join_limit"));
  return {
    lead,
    excel,
    sql: `FROM ${atlasDevSqlSource(leftAlias)}\n${joinType} ${atlasDevSqlSource(rightAlias)}\n  ON ${pairs
      .map(
        (pair) =>
          `${atlasDevSqlName(leftAlias)}.${atlasDevSqlName(pair.left)} = ${atlasDevSqlName(rightAlias)}.${atlasDevSqlName(pair.right)}`,
      )
      .join(" AND ")}`,
    python: `df = ${atlasDevPySource(leftAlias)}.merge(${atlasDevPySource(rightAlias)}, how=${atlasDevPyString(ATLAS_DEV_PANDAS_JOIN[joinType])}, left_on=${pyKeys(leftKeyList)}, right_on=${pyKeys(pairs.map((pair) => pair.right))})`,
    notes,
  };
}

function atlasDevReferenceSource(step) {
  const params = step.params || {};
  const sourceFile = params.source_file || step.source || "";
  const alias =
    atlasDevSourceAlias(sourceFile, params.source_alias) ||
    atlasDevPlaceholder("source", "[source]");
  return {
    excel: `=${atlasDevExcelTable(alias)}`,
    sql: `SELECT * FROM ${atlasDevSqlSource(sourceFile || alias)}${sourceFile && sourceFile !== alias ? ` AS ${atlasDevSqlName(alias)}` : ""}`,
    python: `df = ${atlasDevPySource(alias)}.copy()`,
    notes: [],
  };
}

/** Legacy Filter Rows / Flag Records steps reuse the IF formulas. */
function atlasDevLegacyCondition(step) {
  const params = step.params || {};
  const condition = {
    id: `${step.id || "legacy"}_condition`,
    connector: "IF",
    sourceFile: params.source_file || step.source || "",
    sourceAlias: params.source_alias || "",
    fieldName: params.field_name || step.field || "",
    operator: params.operator || "is equal to",
    valueMode: "values",
    compareValue: params.compare_value || "",
  };
  const isFilter = step.step_type === "filter_rows";
  const actionType = isFilter
    ? params.filter_action === "Exclude matching rows"
      ? "do_not_display"
      : "display"
    : params.flag_action === "do_not_display"
      ? "do_not_display"
      : "display_text";
  return atlasDevIfThen({
    step_type: "if_then",
    params: {
      conditions_json: JSON.stringify([condition]),
      then_action_type: actionType,
      then_text: params.message || "",
      then_output_column: params.output_column || "",
    },
  });
}

/**
 * Developer formulas for one step: { lead, excel, sql, python, notes }.
 * Returns null when the step type has no formula.
 */
function atlasDeveloperFormulas(step) {
  if (!step) return null;
  const params = step.params || {};
  if (params.inverse_else === "Yes" && params.inverse_of_step_id) {
    const lead = atlasDevPhrase("developer_logic.else_step", {
      step_number: atlasDevStepNumber(params.inverse_of_step_id),
    });
    return step.step_type === "if_then"
      ? { ...atlasDevIfThen(step), lead }
      : { lead };
  }
  switch (step.step_type) {
    case "if_then":
      return atlasDevIfThen(step);
    case "else":
      return atlasDevElse(step);
    case "create_column":
      return atlasDevCreateColumn(step);
    case "join":
      return atlasDevJoin(step);
    case "union_sources":
      return atlasDevUnion(params);
    case "reference_source":
      return atlasDevReferenceSource(step);
    case "format_field":
      return atlasDevFormatField(step);
    case "split_field":
      return atlasDevSplitField(step);
    case "sort_records":
      return atlasDevSortRecords(step);
    case "remove_duplicates":
      return atlasDevRemoveDuplicates(step);
    case "filter_rows":
    case "flag_records":
      return atlasDevLegacyCondition(step);
    default:
      return null;
  }
}

/** Formats a formula set as labeled Excel, SQL Server, and Python sections. */
function atlasDeveloperFormulaText(formulas) {
  if (!formulas) return "";
  const sections = [];
  if (formulas.lead) sections.push(formulas.lead);
  if (formulas.excel || formulas.sql || formulas.python) {
    sections.push(
      `${atlasDevPhrase("developer_logic.labels.excel")}\n${formulas.excel || ""}`,
    );
    sections.push(
      `${atlasDevPhrase("developer_logic.labels.sql_server")}\n${formulas.sql || ""}`,
    );
    sections.push(
      `${atlasDevPhrase("developer_logic.labels.python")}\n${formulas.python || ""}`,
    );
  }
  (formulas.notes || []).filter(Boolean).forEach((note) => sections.push(note));
  return sections.join("\n\n");
}

/**
 * Developer Logic text for a step (Requirements preview, logic table, exports).
 * @param {any} step - Logic step object being read.
 */
function developerLogic(step) {
  if (!step) return "";
  if (typeof normalizeCatalogStep === "function") normalizeCatalogStep(step);
  try {
    return atlasDeveloperFormulaText(atlasDeveloperFormulas(step));
  } catch (error) {
    console.warn("Developer Logic could not be generated for a step.", error);
    return "";
  }
}
