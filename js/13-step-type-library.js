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
 *
 * Migration handlers: sync_sort_fields, sync_duplicate_fields,
 * sync_format_field, sync_split_field, union_sources_to_join.
 * Editor blocks (a field's `block`): sort_keys, duplicate_keys.
 *
 * Behavior blocks (a definition's `block`) supply whole parts of a type from
 * the app's own code: normalize(step, index) on the real step, editor(step)
 * markup, english(step), notes(step), formulas(step), createdColumns(step),
 * qtestAction(step) (the THEN outcome qTest tests) and
 * qtestOutcomes(step, { record }) (the two expected outcomes). The types that came with ATLAS Align use them:
 *   create_column   all value modes, math and string transformations
 *   if_then         condition tree and THEN actions
 *   else            ELSE actions (legacy)
 *   join            Join and Union, with the join type picker
 *   union_sources   saved Union Sources steps (legacy; normalize makes a Join)
 *   filter_rows, flag_records   single-condition steps (legacy)
 * Replaced blocks (replacedBlocks below) are the ones a later version
 * rebuilt with fields: format_field and split_field. Only definitions pinned
 * to their old versions name them; they render through the field-based
 * definition.
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
    /** Rewrites a saved Union Sources step as a UNION Join. */
    union_sources_to_join(step) {
      app("atlasConvertUnionSourcesStep")?.(step);
    },
  });

  // ---------------------------------------------------------------------------
  // Editor blocks: markup is built and escaped by the app's own editors.
  // ---------------------------------------------------------------------------

  /** Calls an app function by name; undefined when it is not loaded. */
  const call =
    (name) =>
    (...args) =>
      app(name)?.(...args);

  /** The frame the built-in forms sit in, as the step type forms do. */
  const framed = (name) => (step) => {
    const html = app(name)?.(step);
    return typeof html === "string"
      ? `<div class="selected-source-only-builder">${html}</div>`
      : html;
  };

  const legacyCondition = (sentence, qtestAction) => ({
    normalize: call("atlasCopyStepSourceParams"),
    editor: framed("atlasLegacyConditionEditorHtml"),
    english: call(sentence),
    formulas: call("atlasDevLegacyCondition"),
    qtestAction: call(qtestAction),
  });

  const blocks = Object.freeze({
    sort_keys: {
      editor: (step) => app("atlasSortFieldsEditorHtml")?.(step.params || {}),
    },
    duplicate_keys: {
      editor: (step) =>
        app("atlasDuplicateFieldsEditorHtml")?.(step.params || {}),
    },
    create_column: {
      normalize: call("atlasNormalizeCreateColumnStep"),
      editor: framed("atlasCreateColumnEditorHtml"),
      english: call("atlasCreateColumnSentence"),
      formulas: call("atlasDevCreateColumn"),
      createdColumns: call("atlasCreateColumnOutputNames"),
      qtestOutcomes: call("atlasQtestCreateColumnOutcomes"),
    },
    if_then: {
      normalize: call("atlasNormalizeIfThenStep"),
      editor: call("atlasRenderIfThenTabbedBuilder"),
      english: call("atlasIfThenSentence"),
      formulas: call("atlasDevIfThen"),
      qtestAction: call("atlasQtestThenAction"),
    },
    else: {
      normalize: call("atlasCopyStepSourceParams"),
      editor: call("atlasElseEditorHtml"),
      english: call("elseActionPlain"),
      notes: () => app("renderCatalogPhrase")?.("notes.else.default", {}),
      formulas: call("atlasDevElse"),
      qtestAction: call("atlasQtestThenAction"),
    },
    join: {
      normalize: call("atlasNormalizeJoinStep"),
      editor: call("atlasJoinEditorHtml"),
      english: call("atlasJoinSentence"),
      notes: call("atlasJoinNotes"),
      formulas: call("atlasDevJoin"),
      qtestOutcomes: call("atlasQtestJoinOutcomes"),
    },
    union_sources: {
      english: call("atlasUnionSourcesSentence"),
      notes: call("atlasUnionSourcesNotes"),
      formulas: (step) => app("atlasDevUnion")?.(step.params || {}),
      qtestOutcomes: (step) =>
        app("qtestUnionOutcomes")?.(step.params || {}, step),
    },
    filter_rows: legacyCondition(
      "atlasFilterRowsSentence",
      "atlasQtestFilterAction",
    ),
    flag_records: legacyCondition(
      "atlasFlagRecordsSentence",
      "atlasQtestFlagAction",
    ),
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
