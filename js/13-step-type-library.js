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
 *   formatKind format / formatDigits format      Format Field options
 *   splitDelimiter value / splitPart value       Split Field options
 *   sortKeys params                              Sort Records fields
 *   duplicateKeys params legacy=true             Remove Duplicates columns
 *   firstKeyTable keys source alias              Excel table of the first key
 *
 * Migration handlers: sync_sort_fields, sync_duplicate_fields.
 * Editor blocks: sort_keys, duplicate_keys.
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

  global.ATLASStepTypeLibrary = Object.freeze({
    helpers,
    handlers,
    blocks,
    formatKind,
    formatDigits,
    splitDelimiter,
    splitPart,
    sortKeys,
    duplicateKeys,
  });
})(typeof window !== "undefined" ? window : globalThis);
