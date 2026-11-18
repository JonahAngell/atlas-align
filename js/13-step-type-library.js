/**
 * 13-step-type-library.js
 *
 * The code pieces step type definitions can name: template helpers, migration
 * handlers and editor blocks. A definition stays data; when it needs something
 * no template feature can express, it names one of these, and the registry
 * rejects names this library does not have.
 *
 * Loaded before js/13a-step-type-runtime.js, which merges this library into
 * the runtime. Every piece calls the app's own functions when they are loaded
 * and has a plain fallback, so tests that load only some scripts still work.
 *
 * Helpers (args are template values; `format` is english, excel, sql, python,
 * plain or migration):
 *   tableColumn source alias field omitSource   file "x" column "y" (analyst text)
 *   firstSource                                  the audit's first source file
 *   excelTable name / excelColumn name           Excel table and column names
 *   sqlName name / sqlSource name / pySource name
 *   repeat text count / minus a b
 *   orEmpty value fallback                       fallback only for "" (keeps " ")
 *   formatKind format / formatDigits format      legacy Format Field text
 *   formatCase params                            which Format Field formula
 *   formatText / formatPadWidth / formatPlaces params, formatDateCode params dialect
 *   splitDelimiter value / splitPart value       Split Field options
 *   splitDelimiterChar params / splitDelimiterName params
 *   splitWidth value / splitWidthSet value
 *   sourceAliasFor source                        the audit's alias for a source
 *   plus a b / times a b                         arithmetic
 *   phrase path key=value                        a phrase catalog entry
 *   sortKeys params                              Sort Records fields
 *   duplicateKeys params legacy=true             Remove Duplicates columns
 *   duplicateKeepClause action                   "keeping the first record"
 *   firstKeyTable keys source alias              Excel table of the first key
 *   separatorPhrase value                        "with a space between them"
 *   stringTransformPhrase / stringTransformTarget / stringTransformFormula params
 *   splitColumnsFormula params note=N            Create Column split formulas
 *   mathActive / mathPhrase / mathFormula params Create Column calculations
 *   literal value / writtenExpression value      quoted text, written formula
 *   createColumnOutputs params field / quotedNames list   created columns
 *   joinKeyPairs params from=N blank=true         Join key pairs in use
 *   joinKeyList params style=notes|additional     Join key pairs as text
 *   joinFormula params part=lead note=N           Join formulas
 *   conditionText param step                      IF conditions in words
 *   actionText param step branch=ELSE             THEN / ELSE action in words
 *   ifPrefix text                                 IF + text unless it has one
 *   ifThenFormula / elseFormula param step part=lead note=N   IF and ELSE formulas
 *   valueList value lead=" "                      compare values as quoted text
 *   conditionFormula param step note=N            Filter Rows / Flag Records formulas
 *
 * Migration handlers: sync_sort_fields, sync_duplicate_fields,
 * sync_format_field, sync_split_field, sync_create_column, sync_join,
 * union_sources_to_join, sync_if_then, copy_step_source.
 * Editor blocks (a field's `block`): sort_keys, duplicate_keys.
 *
 * Behavior blocks (a definition's `block`) supply whole parts of a type from
 * the app's own code: normalize(step, index) on the real step, editor(step)
 * markup, english(step), notes(step), formulas(step), createdColumns(step),
 * qtestAction(step) (the THEN outcome qTest tests) and
 * qtestOutcomes(step, { record }) (the two expected outcomes). No type that
 * came with ATLAS Align uses one any more.
 * Replaced blocks (replacedBlocks below) are the ones a later version
 * rebuilt with fields: format_field, split_field, create_column, join,
 * union_sources, if_then, else, filter_rows and flag_records. Only
 * definitions pinned to their old
 * versions name them; they render through the field-based definition.
 * A new type can name one of them and change its label, order and export.
 */
(function initializeStepTypeLibrary(global) {
  "use strict";

  const text = (value) => (value == null ? "" : String(value));

  /** An app function when it is loaded. */
  function app(name) {
    const fn = global[name];
    return typeof fn === "function" ? fn : null;
  }

  /** The app's audit state, when the page has one. */
  function appState() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof state !== "undefined") return state;
    } catch (_error) {
      /* Not declared on this page. */
    }
    return global.state || null;
  }

  function placeholder(key, fallback) {
    const fromCatalog = app("phrasePlaceholder");
    return fromCatalog ? fromCatalog(key, fallback) : fallback;
  }

  function sourceAlias(sourceFile, alias) {
    const devAlias = app("atlasDevSourceAlias");
    if (devAlias) return devAlias(text(sourceFile), text(alias));
    return text(alias).trim() || text(sourceFile).trim();
  }

  function excelTable(alias) {
    const appTable = app("atlasDevExcelTable");
    if (appTable) return appTable(alias);
    const cleaned = text(alias)
      .trim()
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!cleaned) return "Table1";
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
  }

  function excelColumn(name) {
    return text(name).replace(/(['[\]#])/g, "'$1");
  }

  function sqlName(name) {
    return `[${text(name).replace(/]/g, "]]")}]`;
  }

  // ---------------------------------------------------------------------------
  // Format Field and Split Field words.
  // ---------------------------------------------------------------------------

  const NUMBER_WORDS = Object.freeze({
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
  });

  const ORDINAL_WORDS = Object.freeze({
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
  });

  const DELIMITER_WORDS = Object.freeze({
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
  });

  /** "eight digits with leading zeroes" -> 8; 0 for any other format. */
  function formatDigits(format) {
    const match = text(format)
      .trim()
      .toLowerCase()
      .match(/^(\w+) digits? with leading zero(?:e)?s?$/);
    if (!match) return 0;
    return Number(match[1]) || NUMBER_WORDS[match[1]] || 0;
  }

  /** digits, date, number, text or custom. A blank format reads as text. */
  function formatKind(format) {
    const value = text(format || "text").trim();
    const normalized = value.toLowerCase();
    if (formatDigits(value)) return "digits";
    if (normalized.includes("mm/dd/yyyy")) return "date";
    if (normalized === "number") return "number";
    if (normalized === "text") return "text";
    return "custom";
  }

  /** "comma" -> ","; any other text is the delimiter itself. */
  function splitDelimiter(value) {
    const raw = text(value);
    const word = raw.trim().toLowerCase();
    if (DELIMITER_WORDS[word]) return DELIMITER_WORDS[word];
    return raw === "" ? "" : raw.trim() || raw;
  }

  const paramsOf = (params) =>
    params && typeof params === "object" && !Array.isArray(params)
      ? params
      : {};

  /** A step from a helper's `param step` arguments, for the app's own code. */
  const stepOf = (args) => ({
    ...paramsOf(args[1]),
    params: { ...paramsOf(args[0]) },
  });

  /** One part of an app formula result: a note=N, the lead or a dialect. */
  function formulaPart(result, hash, format) {
    const formulas = result || {};
    if (hash.note !== undefined)
      return text((formulas.notes || [])[Number(hash.note)]);
    return text(formulas[hash.part === "lead" ? "lead" : format]);
  }

  /** The structured Format Field settings, or null for a legacy format. */
  function formatConfig(params) {
    const values = paramsOf(params);
    if (!values.format_kind) return null;
    return app("atlasFormatFieldConfig")?.(values) || null;
  }

  /** The legacy format text the formulas name, "text" when blank. */
  function formatText(params) {
    return text(paramsOf(params).format || "text").trim();
  }

  /** Zero-pad width: the structured width, else the legacy "8 digits..." text. */
  function formatPadWidth(params) {
    const config = formatConfig(params);
    if (config)
      return config.kind === "zeroPad" ? Number(config.width) || 0 : 0;
    return formatDigits(formatText(params));
  }

  /**
   * Which formula a Format Field step uses: trim, upper, lower, round, date,
   * pad, legacyDate, number, text or unknown (a format no formula knows).
   */
  function formatCase(params) {
    const config = formatConfig(params);
    const kind = config?.kind;
    if (["trim", "upper", "lower"].includes(kind)) return kind;
    if (kind === "number" && config.decimals !== "") return "round";
    if (kind === "date" && config.dateOutput) return "date";
    if (formatPadWidth(params)) return "pad";
    const format = formatText(params).toLowerCase();
    if (format.includes("mm/dd/yyyy")) return "legacyDate";
    if (format === "number" || format === "text") return format;
    return "unknown";
  }

  const DATE_FORMAT_CODES = Object.freeze({
    "MM/DD/YYYY": { excel: "mm/dd/yyyy", sql: "101", python: "%m/%d/%Y" },
    "YYYY-MM-DD": { excel: "yyyy-mm-dd", sql: "23", python: "%Y-%m-%d" },
    YYYYMMDD: { excel: "yyyymmdd", sql: "112", python: "%Y%m%d" },
    "DD.MM.YYYY": { excel: "dd.mm.yyyy", sql: "104", python: "%d.%m.%Y" },
  });

  /** The Excel format, SQL CONVERT style or strftime code of a date format. */
  function formatDateCode(params, dialect) {
    const output = formatConfig(params)?.dateOutput;
    const codes = Object.prototype.hasOwnProperty.call(
      DATE_FORMAT_CODES,
      output,
    )
      ? DATE_FORMAT_CODES[output]
      : null;
    return text(codes?.[dialect]);
  }

  /** The structured Split Field settings, or null for a legacy split. */
  function splitConfig(params) {
    const values = paramsOf(params);
    if (!values.split_by && !values.split_mode) return null;
    return app("atlasSplitFieldConfig")?.(values) || null;
  }

  /** The characters a Split Field step splits on; "" when none are set. */
  function splitDelimiterChar(params) {
    const config = splitConfig(params);
    return config
      ? text(config.delimiter)
      : splitDelimiter(paramsOf(params).split_on);
  }

  /** "the comma", "\" - \"" for a custom delimiter, or "[delimiter]". */
  function splitDelimiterName(params) {
    const config = app("atlasSplitFieldConfig")?.(paramsOf(params));
    const named = config ? app("atlasSplitDelimiterPlain")?.(config) : null;
    return named == null ? "[delimiter]" : text(named);
  }

  /** The split width as a number, or the [width] placeholder when unset. */
  function splitWidth(value) {
    return Number(text(value).trim()) || placeholder("width", "[width]");
  }

  /** The split part as a 1-based position, or "last". */
  function splitPart(value) {
    const words = text(value).trim().toLowerCase();
    if (!words) return 1;
    if (/\blast\b/.test(words)) return "last";
    const digits = words.match(/\d+/);
    if (digits) return Math.max(1, Number(digits[0]));
    const word = Object.keys(ORDINAL_WORDS).find((key) =>
      new RegExp(`\\b${key}\\b`).test(words),
    );
    return word ? ORDINAL_WORDS[word] : 1;
  }

  // ---------------------------------------------------------------------------
  // Multi-field lists (Sort Records and Remove Duplicates).
  // ---------------------------------------------------------------------------

  /** Marks each key whose source file matches the key before it. */
  function withSameSource(keys) {
    return keys.map((key, index) => ({
      ...key,
      sameSource: index > 0 && keys[index - 1].sourceFile === key.sourceFile,
    }));
  }

  const keyText = (item) => ({
    sourceFile: text(item?.sourceFile),
    sourceAlias: text(item?.sourceAlias),
    fieldName: text(item?.fieldName),
  });

  /**
   * Sort fields that name a field, or the single legacy sort field:
   * [{ sourceFile, sourceAlias, fieldName, direction, sameSource }].
   */
  function sortKeys(params) {
    const values = params && typeof params === "object" ? params : {};
    const read = app("atlasSortFieldsFromParams");
    const fields = (read ? read(values) : []).filter((item) => item.fieldName);
    const keys = fields.length
      ? fields.map((item) => ({
          ...keyText(item),
          direction: text(item.direction),
        }))
      : [
          {
            ...keyText({
              sourceFile: values.source_file,
              sourceAlias: values.source_alias,
              fieldName: values.field_name,
            }),
            direction: text(values.sort_direction),
          },
        ];
    return withSameSource(keys);
  }

  /**
   * Remove Duplicates columns. With legacy=true an empty list becomes the
   * single legacy column, which is what the formulas compare.
   */
  function duplicateKeys(params, legacy) {
    const values = params && typeof params === "object" ? params : {};
    const read = app("atlasDuplicateFieldsFromParams");
    let keys = (read ? read(values) : []).map(keyText);
    if (!keys.length && legacy)
      keys = [
        {
          sourceFile: text(values.source_file).trim(),
          sourceAlias: text(values.source_alias).trim(),
          fieldName: text(values.field_name).trim(),
        },
      ];
    return withSameSource(keys);
  }

  // ---------------------------------------------------------------------------
  // Create Column.
  // ---------------------------------------------------------------------------

  /** Math operations of a stored list; [] when it cannot be read. */
  function mathOperations(value) {
    const parse = app("parseSourceMathOperations");
    return parse ? parse(value || []) : [];
  }

  /**
   * Column names a Create Column step adds. A split adds one per named
   * part, or "Name_x" standing for Name_1, Name_2... when the count is open.
   */
  function createColumnOutputs(params, field) {
    const values = paramsOf(params);
    if (
      values.value_mode === "String transformation" &&
      text(values.string_operation).trim() === "split"
    ) {
      const config = app("atlasStringTransformConfig")?.(values);
      if (!config) return [];
      const names = config.named
        ? config.outputColumns
        : [config.outputPattern];
      return [...new Set(names.filter(Boolean))];
    }
    const name = text(values.column_name || field || "").trim();
    return name ? [name] : [];
  }

  /**
   * A Join's key pairs in use: [{ left_field, right_field }]. The first pair
   * always counts; later ones only when they name a field.
   */
  function joinKeyPairs(params) {
    const values = paramsOf(params);
    const inUse = app("atlasJoinKeyPairsInUse");
    if (inUse) return inUse(values);
    return values.left_field || values.right_field
      ? [
          {
            left_field: text(values.left_field),
            right_field: text(values.right_field),
          },
        ]
      : [];
  }

  // ---------------------------------------------------------------------------
  // Template helpers.
  // ---------------------------------------------------------------------------

  const helpers = Object.freeze({
    /** Analyst text for a column; blank when no field is named. */
    tableColumn(args) {
      const [source, alias, field, omitSource] = args;
      const plain = app("tableColumnPlain");
      if (plain) return plain(source, alias, field, omitSource === true);
      const name = text(field).trim();
      if (!name) return "";
      const label = text(alias).trim() || text(source).trim();
      return omitSource === true || !label
        ? `column "${name}"`
        : `file "${label}" column "${name}"`;
    },
    /** The name of the audit's first source file. */
    firstSource() {
      return text(appState()?.audit?.sources?.[0]?.name);
    },
    excelTable(args) {
      return excelTable(args[0]);
    },
    excelColumn(args) {
      return excelColumn(args[0]);
    },
    sqlName(args) {
      return app("atlasDevSqlName")?.(text(args[0])) ?? sqlName(args[0]);
    },
    /** A source table in SQL, or the [source] placeholder. */
    sqlSource(args) {
      const appSource = app("atlasDevSqlSource");
      if (appSource) return appSource(text(args[0]));
      return args[0] ? sqlName(args[0]) : placeholder("source", "[source]");
    },
    /** sources["alias"] in Python. */
    pySource(args) {
      const appSource = app("atlasDevPySource");
      if (appSource) return appSource(text(args[0]));
      return `sources[${JSON.stringify(text(args[0]) || placeholder("source", "[source]"))}]`;
    },
    repeat(args) {
      const count = Math.max(0, Math.min(1000, Number(args[1]) || 0));
      return text(args[0]).repeat(count);
    },
    minus(args) {
      return Number(args[0]) - Number(args[1]);
    },
    /** The value, or the fallback when it is empty. A space is a value. */
    orEmpty(args) {
      return text(args[0]) === "" ? args[1] : args[0];
    },
    formatKind(args) {
      return formatKind(args[0]);
    },
    formatDigits(args) {
      return formatDigits(args[0]);
    },
    splitDelimiter(args) {
      return splitDelimiter(args[0]);
    },
    splitPart(args) {
      return splitPart(args[0]);
    },
    /** The alias the audit gives a source file. */
    sourceAliasFor(args) {
      const source = text(args[0]);
      const appAlias = app("sourceAliasFor");
      return appAlias ? text(appAlias(source)) : source;
    },
    formatCase(args) {
      return formatCase(args[0]);
    },
    formatText(args) {
      return formatText(args[0]);
    },
    formatPadWidth(args) {
      return formatPadWidth(args[0]);
    },
    /** Decimal places of a rounded number format. */
    formatPlaces(args) {
      return Number(formatConfig(args[0])?.decimals) || 0;
    },
    formatDateCode(args) {
      return formatDateCode(args[0], text(args[1]));
    },
    splitDelimiterChar(args) {
      return splitDelimiterChar(args[0]);
    },
    splitDelimiterName(args) {
      return splitDelimiterName(args[0]);
    },
    splitWidth(args) {
      return splitWidth(args[0]);
    },
    /** Whether the split width is a number other than 0. */
    splitWidthSet(args) {
      return Boolean(Number(text(args[0]).trim()));
    },
    plus(args) {
      return Number(args[0]) + Number(args[1]);
    },
    times(args) {
      return Number(args[0]) * Number(args[1]);
    },
    /** A phrase from the phrase catalog, filled from the hash values. */
    phrase(args, hash) {
      const path = text(args[0]);
      const render = app("renderCatalogPhrase");
      if (!render) return `[Missing phrase path: ${path}]`;
      return text(
        render(
          path,
          Object.fromEntries(
            Object.entries(hash || {}).map(([key, value]) => [
              key,
              text(value),
            ]),
          ),
        ),
      );
    },
    /** "keeping the first record" and the other duplicate keep clauses. */
    duplicateKeepClause(args) {
      return text(app("atlasDuplicateKeepClause")?.(args[0]) ?? "");
    },
    sortKeys(args) {
      return sortKeys(args[0]);
    },
    duplicateKeys(args, hash) {
      return duplicateKeys(args[0], hash.legacy === true);
    },
    /** A separator in analyst text: "a space", "a comma" or the quoted text. */
    separatorPhrase(args) {
      return text(app("separatorPlain")?.(args[0]) ?? args[0]);
    },
    /** Create Column string transformation sentence. */
    stringTransformPhrase(args) {
      const config = app("atlasStringTransformConfig")?.(paramsOf(args[0]));
      const phrase = app("atlasStringTransformAnalystPhrase");
      return config && phrase ? text(phrase(config, "create_column")) : "";
    },
    /** The column a string transformation writes; blank when none is named. */
    stringTransformTarget(args) {
      return text(
        app("atlasStringTransformConfig")?.(paramsOf(args[0]))
          ?.destinationColumn,
      );
    },
    /** A string transformation's value in the current dialect. */
    stringTransformFormula(args, _hash, { format }) {
      const config = app("atlasDevStringTransformConfig")?.(paramsOf(args[0]));
      return text(app("atlasDevStringTransform")?.(config || {}, format));
    },
    /** One dialect of a Create Column split, or one of its notes (note=N). */
    splitColumnsFormula(args, hash, { format }) {
      const config = app("atlasDevStringTransformConfig")?.(paramsOf(args[0]));
      const result = app("atlasDevSplitColumns")?.(config || {}) || {};
      if (hash.note !== undefined)
        return text((result.notes || [])[Number(hash.note)]);
      return text(result[format]);
    },
    /** Whether a source field value has math operations or rounding. */
    mathActive(args) {
      const values = paramsOf(args[0]);
      return Boolean(
        mathOperations(values.source_math_json).length ||
        (values.rounding_mode && values.rounding_mode !== "none"),
      );
    },
    /** "file "wd" column "Pay" times 2, then round to ..." for analyst text. */
    mathPhrase(args) {
      const values = paramsOf(args[0]);
      const base = text(
        app("tableColumnPlain")?.(
          values.source_file,
          values.source_alias,
          values.field_name,
        ),
      );
      const word = app("compareMathOperatorWord");
      const operand = app("compareMathOperandPlain");
      const math = mathOperations(values.source_math_json)
        .map(
          (operation) =>
            `${word?.(operation.operator) ?? ""} ${operand?.(operation, values.source_file) ?? ""}`,
        )
        .filter(Boolean)
        .join(" ");
      const rounding = text(
        app("atlasMathRoundingPhrase")?.(
          values.rounding_mode,
          values.rounding_decimal_places,
        ),
      );
      return `${base}${math ? ` ${math}` : ""}${rounding}`;
    },
    /** A source field value with its math and rounding in the current dialect. */
    mathFormula(args, _hash, { format }) {
      const values = paramsOf(args[0]);
      const field = app("atlasDevFieldSpec")?.(
        values.source_file,
        values.source_alias,
        values.field_name,
      );
      const rounding = app("atlasDevRoundingMode")?.(
        values.rounding_mode || values.rounding_method,
      );
      const places = app("atlasDevDecimalPlaces")?.(
        values.rounding_decimal_places,
      );
      return text(
        app("atlasDevCalculation")?.(
          field,
          mathOperations(values.source_math_json || []),
          rounding,
          places,
          format,
        ),
      );
    },
    /** A text literal as the developer formulas write it in each dialect. */
    literal(args, _hash, { format }) {
      const appString = app("atlasDevString");
      if (appString) return appString(text(args[0]), format);
      return JSON.stringify(text(args[0]));
    },
    /** A written expression without its leading "=", or [expression]. */
    writtenExpression(args) {
      return (
        text(args[0]).trim().replace(/^=/, "") ||
        placeholder("expression", "[expression]")
      );
    },
    /** The columns a Create Column step adds (see createColumnOutputs). */
    createColumnOutputs(args) {
      return createColumnOutputs(args[0], args[1]);
    },
    /** Quoted names joined with ", ", or "" when there are none. */
    quotedNames(args) {
      const quote = app("quotePhraseValue") || ((value) => `"${value}"`);
      const names = Array.isArray(args[0]) ? args[0] : [];
      return names.map((name) => quote(text(name))).join(", ") || '""';
    },
    /**
     * A Join's key pairs (see joinKeyPairs); from=N skips the first N, and
     * blank=true gives one blank pair when there are none.
     */
    joinKeyPairs(args, hash) {
      const pairs = joinKeyPairs(args[0]).slice(Number(hash.from) || 0);
      return pairs.length || hash.blank !== true
        ? pairs
        : [{ left_field: "", right_field: "" }];
    },
    /**
     * A Join's key pairs as one phrase value: style="notes" gives
     * "L" / "R", ... and style="additional" the pairs after the first as
     * file "a" column "L" with file "b" column "R", and ...
     */
    joinKeyList(args, hash) {
      const values = paramsOf(args[0]);
      const quote = app("quotePhraseValue") || ((value) => `"${value}"`);
      const column = (source, alias, field) =>
        text(app("tableColumnPlain")?.(source, alias, field));
      if (hash.style === "additional")
        return joinKeyPairs(values)
          .slice(1)
          .map(
            (pair) =>
              `${column(values.left_source, values.left_alias, pair.left_field) || placeholder("left_key", "[left key]")} with ${column(values.right_source, values.right_alias, pair.right_field) || placeholder("right_key", "[right key]")}`,
          )
          .join(", and ");
      const pairs = joinKeyPairs(values);
      return (pairs.length ? pairs : [{ left_field: "", right_field: "" }])
        .map(
          (pair) =>
            `${quote(pair.left_field || placeholder("file_1_key", "[file 1 key]"))} / ${quote(pair.right_field || placeholder("file_2_key", "[file 2 key]"))}`,
        )
        .join(", ");
    },
    /**
     * One dialect of a Join's formulas, its lead (part="lead") or one of its
     * notes (note=N), from the app's join formulas.
     */
    joinFormula(args, hash, { format }) {
      return formulaPart(
        app("atlasDevJoin")?.({ params: paramsOf(args[0]) }),
        hash,
        format,
      );
    },
    /** IF + the step's condition tree in words (the condition_group control). */
    conditionText(args) {
      const step = stepOf(args);
      return text(
        app("ensureIfThenPrefix")?.(app("conditionGroupPlain")?.(step)),
      );
    },
    /** The THEN action in words, or the ELSE action with branch="ELSE". */
    actionText(args, hash) {
      const name =
        hash.branch === "ELSE" ? "elseActionPlain" : "thenActionPlain";
      return text(app(name)?.(stepOf(args)));
    },
    /** Text that starts with IF, ELSE IF or ELSE, else IF + the text. */
    ifPrefix(args) {
      return text(app("ensureIfThenPrefix")?.(text(args[0])));
    },
    /**
     * One dialect of an IF / THEN step's formulas, or one of its notes
     * (note=N), from the app's condition and action formulas.
     */
    ifThenFormula(args, hash, { format }) {
      return formulaPart(app("atlasDevIfThen")?.(stepOf(args)), hash, format);
    },
    /** One dialect, the lead (part="lead") or a note of an ELSE step. */
    elseFormula(args, hash, { format }) {
      return formulaPart(app("atlasDevElse")?.(stepOf(args)), hash, format);
    },
    /**
     * Compare values, one per line, as quoted text: "A", "A" or "B", and
     * so on. Blank when there are none; lead=" " goes in front otherwise.
     */
    valueList(args, hash) {
      const value = args[0];
      if (!value) return "";
      const list = app("formattedValueList");
      const shown = list
        ? list(value)
        : text(value)
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => `"${item}"`)
            .join(", ");
      return `${text(hash.lead)}${text(shown)}`;
    },
    /**
     * One dialect or a note (note=N) of a single-condition step: Filter
     * Rows or Flag Records, built as the IF / THEN they stand for.
     */
    conditionFormula(args, hash, { format }) {
      return formulaPart(
        app("atlasDevLegacyCondition")?.(stepOf(args)),
        hash,
        format,
      );
    },
    /** Excel table of a key list's first key, else of the step's source. */
    firstKeyTable(args) {
      const [keys, source, alias] = args;
      const first = Array.isArray(keys) ? keys[0] : null;
      return excelTable(
        sourceAlias(first?.sourceFile || source, first?.sourceAlias || alias),
      );
    },
  });

  // ---------------------------------------------------------------------------
  // Migration handlers: rewrites that need the list editors' own rules.
  // ---------------------------------------------------------------------------

  const handlers = Object.freeze({
    /** Writes sort_fields_json and mirrors the first field to the legacy params. */
    sync_sort_fields(_step, { params }) {
      app("atlasSyncSortFieldParams")?.(params);
    },
    /** Writes duplicate_fields_json and mirrors the first column. */
    sync_duplicate_fields(_step, { params }) {
      app("atlasSyncDuplicateFieldParams")?.(params);
    },
    /**
     * Writes the structured Format Field settings and the `format` text the
     * older compiler reads. A step without a format keeps it blank.
     */
    sync_format_field(_step, { params }) {
      params.format = params.format || "";
      app("atlasNormalizeFormatFieldParams")?.(params);
    },
    /** Writes the structured Split Field settings and their split_on mirror. */
    sync_split_field(_step, { params }) {
      app("atlasNormalizeSplitFieldParams")?.(params);
    },
    /**
     * Create Column defaults: the column name from the step's field, the
     * value type, and each Concatenate operand's own source.
     */
    sync_create_column(step) {
      app("atlasNormalizeCreateColumnStep")?.(step);
    },
    /** Join defaults: the source params and an INNER JOIN. */
    sync_join(step) {
      app("atlasNormalizeJoinStep")?.(step);
    },
    /** IF / THEN defaults: the source params and the action type. */
    sync_if_then(step) {
      app("atlasNormalizeIfThenStep")?.(step);
    },
    /** Copies the legacy step source and field into the source params. */
    copy_step_source(step) {
      app("atlasCopyStepSourceParams")?.(step);
    },
    /** Rewrites a saved Union Sources step as a UNION Join. */
    union_sources_to_join(step) {
      app("atlasConvertUnionSourcesStep")?.(step);
    },
  });

  // ---------------------------------------------------------------------------
  // Editor blocks: markup is built and escaped by the app's own editors.
  // ---------------------------------------------------------------------------

  const blocks = Object.freeze({
    sort_keys: {
      editor: (step) => app("atlasSortFieldsEditorHtml")?.(step.params || {}),
    },
    duplicate_keys: {
      editor: (step) =>
        app("atlasDuplicateFieldsEditorHtml")?.(step.params || {}),
    },
  });

  /**
   * Behavior blocks a later version of a type replaced with fields: block
   * name -> the type whose latest definition renders it. The runtime keeps
   * each as a shim, so a publication pinned to the old version still
   * renders. Never remove an entry while such a version can be pinned.
   */
  const replacedBlocks = Object.freeze({
    format_field: "format_field",
    split_field: "split_field",
    create_column: "create_column",
    join: "join",
    union_sources: "union_sources",
    if_then: "if_then",
    else: "else",
    filter_rows: "filter_rows",
    flag_records: "flag_records",
  });

  global.ATLASStepTypeLibrary = Object.freeze({
    helpers,
    handlers,
    blocks,
    replacedBlocks,
    formatKind,
    formatDigits,
    splitDelimiter,
    splitPart,
    sortKeys,
    duplicateKeys,
  });
})(typeof window !== "undefined" ? window : globalThis);
