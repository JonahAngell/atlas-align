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

/**
 * What an operator means in a formula, from the phrase catalog
 * (app_config.logic_options.operator_meanings): kind is "compare" (the
 * symbol, e.g. "<>"), "text_match" ({kind, negated}) or "blank" (true when
 * the operator tests for a value).
 */
function atlasDevOperatorMeaning(kind, operator) {
  const meanings =
    typeof getCatalogValue === "function"
      ? getCatalogValue(`app_config.logic_options.operator_meanings.${kind}`, null)
      : null;
  return meanings &&
    typeof meanings === "object" &&
    Object.prototype.hasOwnProperty.call(meanings, operator)
    ? meanings[operator]
    : undefined;
}

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

/**
 * Set only while the Python code export builds a script: maps
 * "alias\u0000field" to the column a pandas merge renamed it to.
 */
let atlasDevPythonRenames = null;

/** Row-level reference to a field in one dialect. */
function atlasDevField(field = {}, dialect) {
  const name = String(field.fieldName || "").trim();
  if (!name) return atlasDevPlaceholder("field", "[field]");
  if (dialect === "excel") return `[@[${atlasDevExcelColumnName(name)}]]`;
  if (dialect === "python") {
    const renamed = atlasDevPythonRenames?.get(
      `${atlasDevSourceAlias(field.sourceFile, field.sourceAlias)}\u0000${name}`,
    );
    return `df[${atlasDevPyString(renamed || name)}]`;
  }
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

/** Delimiter literal; Excel and SQL spell a tab as CHAR(9). */
function atlasDevSplitLiteral(delimiter, dialect) {
  if (delimiter === "\t" && dialect !== "python") return "CHAR(9)";
  return atlasDevString(
    delimiter || atlasDevPlaceholder("delimiter", "[delimiter]"),
    dialect,
  );
}

/** One part of a split, as an expression for the dialect. Parts are 1-based. */
function atlasDevSplitPartExpression(config, part, dialect) {
  const field = atlasDevField(
    atlasDevFieldSpec(
      config.sourceFile,
      config.sourceAlias,
      config.sourceField,
    ),
    dialect,
  );
  const d = atlasDevSplitLiteral(config.delimiter, dialect);
  const size = Math.max(1, String(config.delimiter || "").length);
  const text = `${field}.astype("string")`;
  if (config.splitMode === "first" || config.splitMode === "last") {
    const last = config.splitMode === "last";
    if (dialect === "excel") {
      const fn = part === 1 ? "TEXTBEFORE" : "TEXTAFTER";
      return `IFERROR(${fn}(${field}, ${d}${last ? ", -1" : ""}), ${part === 1 ? field : '""'})`;
    }
    if (dialect === "sql") {
      const found = `CHARINDEX(${d}, ${field}) > 0`;
      if (!last)
        return part === 1
          ? `LEFT(${field}, CHARINDEX(${d}, ${field} + ${d}) - 1)`
          : `CASE WHEN ${found} THEN SUBSTRING(${field}, CHARINDEX(${d}, ${field}) + ${size}, 4000) ELSE '' END`;
      const fromEnd = `CHARINDEX(REVERSE(${d}), REVERSE(${field}))`;
      return part === 1
        ? `CASE WHEN ${found} THEN LEFT(${field}, LEN(${field} + 'x') - ${fromEnd} - ${size}) ELSE ${field} END`
        : `CASE WHEN ${found} THEN RIGHT(${field}, ${fromEnd} - 1) ELSE '' END`;
    }
    const split = last
      ? `${text}.str.rsplit(${d}, n=1)`
      : `${text}.str.split(${d}, n=1, regex=False)`;
    return part === 1 ? `${split}.str[0]` : `${split}.str[1].fillna("")`;
  }
  if (dialect === "excel")
    return `IFERROR(INDEX(TEXTSPLIT(${field}, ${d}), 1, ${part}), "")`;
  if (dialect === "sql")
    return part === 1
      ? `LEFT(${field}, CHARINDEX(${d}, ${field} + ${d}) - 1)`
      : `ISNULL((SELECT [value] FROM STRING_SPLIT(${field}, ${d}, 1) WHERE [ordinal] = ${part}), '')`;
  return `${text}.str.split(${d}, regex=False).str[${part - 1}].fillna("")`;
}

/**
 * Formulas for a Create Column split: one assignment per named column, or a
 * spill / expand into Name_1, Name_2... when the number of columns is open.
 */
function atlasDevSplitColumns(config = {}) {
  const notes = [];
  if (!config.delimiter)
    notes.push(atlasDevPhrase("developer_logic.notes.missing_delimiter"));
  if (!config.named) {
    const base =
      config.baseColumn || atlasDevPlaceholder("column_name", "[column name]");
    const field = (dialect) =>
      atlasDevField(
        atlasDevFieldSpec(
          config.sourceFile,
          config.sourceAlias,
          config.sourceField,
        ),
        dialect,
      );
    notes.push(
      atlasDevPhrase("developer_logic.notes.split_numbered_columns", {
        pattern: `${base}_1, ${base}_2`,
      }),
    );
    return {
      excel: `=TEXTSPLIT(${field("excel")}, ${atlasDevSplitLiteral(config.delimiter, "excel")})`,
      sql: [
        `CROSS APPLY STRING_SPLIT(${field("sql")}, ${atlasDevSplitLiteral(config.delimiter, "sql")}, 1) AS [split_parts]`,
        `-- CONCAT(${atlasDevSqlString(`${base}_`)}, [split_parts].[ordinal]) AS [column_name], [split_parts].[value]`,
      ].join("\n"),
      python: [
        `split_parts = ${field("python")}.astype("string").str.split(${atlasDevSplitLiteral(config.delimiter, "python")}, regex=False, expand=True).fillna("")`,
        `split_parts.columns = [${atlasDevPyString(`${base}_`)} + str(i + 1) for i in split_parts.columns]`,
        `df = df.join(split_parts)`,
      ].join("\n"),
      notes: [
        ...notes,
        atlasDevPhrase("developer_logic.notes.split_sql_version"),
      ],
    };
  }
  const columns = config.outputColumns.map(
    (name, index) =>
      name || atlasDevPlaceholder("column_name", `[column ${index + 1} name]`),
  );
  const assignments = columns.map((name, index) =>
    atlasDevAssignment(name, (dialect) =>
      atlasDevSplitPartExpression(config, index + 1, dialect),
    ),
  );
  if (config.splitMode === "every" && columns.length > 1)
    notes.push(atlasDevPhrase("developer_logic.notes.split_sql_version"));
  return {
    excel: assignments
      .map((item, index) => `${columns[index]}: ${item.excel}`)
      .join("\n"),
    sql: assignments.map((item) => item.sql).join(",\n"),
    python: assignments.map((item) => item.python).join("\n"),
    notes,
  };
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
  if (Array.isArray(condition.compareValues) && condition.compareValues.length)
    return condition.compareValues
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  return String(condition.compareValue ?? condition.value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// ---- Formula sets ------------------------------------------------------------

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

/** Split part as a 1-based position, or "last". */
/**
 * Formulas for a fixed-width split, or a split that makes one row per part.
 * @param {Record<string, any>} field - Field spec being split.
 * @param {ReturnType<typeof atlasSplitFieldConfig>} c - Split settings.
 */
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

/**
 * A key-matched Join's formulas: { lead, excel, sql, python, notes }. The
 * join definition reads them through the joinFormula helper; a UNION join
 * writes its own formulas.
 */
function atlasDevJoin(step) {
  const params = step.params || {};
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
      ? { ...(globalThis.ATLASStepTypeRuntime?.formulas?.(step) || {}), lead }
      : { lead };
  }
  // Every step type is a definition; its behavior block or its templates
  // build the formulas.
  return globalThis.ATLASStepTypeRuntime?.formulas?.(step) || null;
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
