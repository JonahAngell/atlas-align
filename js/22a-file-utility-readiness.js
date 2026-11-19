/**
 * "Runnable in File Utility" readiness rules.
 *
 * Pure and persistence-free: no DOM, state, network or storage. It reads an
 * audit document and the shared contract (catalogs/file-utility/
 * executable-steps.json) and reports which steps File Utility cannot run.
 *
 * It mirrors the checks in File Utility's atlas_compile.py, so both apps give
 * the same verdict and the same step numbers without calling each other. A
 * change to the contract or to a rule here must be matched on the File Utility
 * side. Checks that need File Utility's engine (a v3 procedure validation, the
 * execution settings, which tables each step reads) are not mirrored.
 *
 * Messages never include condition values.
 *
 * Classic-script usage:
 *   const result = FileUtilityReadiness.check(auditDocument, contract);
 *   // { runnable, blockers: [{ stepNumber, stepId, title, message }], warnings }
 */
(function initializeFileUtilityReadiness(global) {
  "use strict";

  const JOIN_TYPES = new Set([
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL OUTER JOIN",
    "INNER",
    "LEFT",
    "RIGHT",
    "FULL OUTER",
    "FULL JOIN",
    "OUTER JOIN",
  ]);
  const DELIMITER_WORDS = new Set([
    "comma",
    "space",
    "hyphen",
    "dash",
    "underscore",
    "period",
    "dot",
    "slash",
    "forward slash",
    "backslash",
    "pipe",
    "semicolon",
    "colon",
    "tab",
  ]);
  const NUMBER_WORDS = {
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
  const DATE_FORMATS = ["mm/dd/yyyy", "yyyy-mm-dd", "yyyymmdd", "dd.mm.yyyy"];
  const BLANK_TOKENS = new Set(["blank/null", "blank", "null", "(blank)"]);
  const MATH_OPERATORS = new Set(["+", "-", "*", "_", "x", "×", "/", "÷"]);
  const STRING_OPERATIONS = [
    "first_characters",
    "last_characters",
    "character_count",
    "split",
  ];
  const TEXT_MATCH = new Set([
    "contains",
    "notContains",
    "startsWith",
    "notStartsWith",
    "endsWith",
    "notEndsWith",
  ]);
  const ORDER_OPERATORS = new Set(["gt", "gte", "lt", "lte"]);
  const SPLIT_MAX_COLUMNS = 20;
  const MAX_EXPR_DEPTH = 5;
  const MAX_KEYS = 10;
  // Row-changing steps cannot sit inside an IF branch.
  const SHAPE_TYPES = new Set([
    "join",
    "union_sources",
    "sort_records",
    "remove_duplicates",
  ]);
  // Compilers an ELSE step can follow.
  const IF_LIKE = new Set(["if_then", "legacy_condition"]);

  class Blocked extends Error {}

  const text = (value) => (value == null ? "" : String(value).trim());
  const own = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);
  const dict = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  // Python-style truthiness, so the rules read the same as the compiler's.
  const truthy = (value) =>
    Array.isArray(value)
      ? value.length > 0
      : value && typeof value === "object"
        ? Object.keys(value).length > 0
        : Boolean(value);

  function jsonList(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        return null;
      }
    }
    return [];
  }

  function parseNumber(value) {
    const t = text(value);
    const match =
      /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(-?)$/.exec(t) ||
      /^([+-]?)(\d{1,3}(?:,\d{3})+(?:\.\d*)?)(-?)$/.exec(t);
    return Boolean(match && !(match[1] && match[3]));
  }

  const positiveInt = (value) => {
    const t = text(value);
    return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
  };

  function numberOf(step, order) {
    const value = Number(step.sortOrder || 0);
    return Number.isFinite(value) ? value : order;
  }

  // A version 1 contract keyed readiness by type id; the handler File Utility
  // used for each id before definitions carried an export.fileUtility block.
  const LEGACY_COMPILERS = {
    filter_rows: "legacy_condition",
    flag_records: "legacy_condition",
  };

  /**
   * How File Utility runs `definition` (see fileUtilityFor in
   * js/step-types/02-definitions.js, used when the engine is loaded):
   * { compiler, params } from its export.fileUtility block, the contract's
   * legacyStepTypes entry for an older version, or null.
   */
  function runFor(definition, rules) {
    const engine = global.ATLASStepTypes?.definitions?.fileUtilityFor;
    if (typeof engine === "function") return engine(definition, rules);
    const block = definition?.export?.fileUtility;
    if (block && typeof block === "object")
      return {
        compiler: String(block.compiler || ""),
        params: { ...(block.params || {}) },
      };
    const list = dict(rules.legacyStepTypes || rules.stepTypes);
    const id = text(definition?.id);
    if (!id || !own(list, id)) return null;
    return { compiler: LEGACY_COMPILERS[id] || id, params: {} };
  }

  /**
   * Options: definitionFor(step), the definition version the step renders
   * with (ATLASStepTypeRuntime.definitionFor, which applies a publication's
   * pins). Without it, or for a step it has no definition for, the step type
   * id is looked up in the contract's legacyStepTypes. actionKindFor(name),
   * the action kind definition a then_action_type names in the version the
   * audit uses, or null; its export.fileUtility.action is the handler. A kind
   * with no definition is its own handler.
   */
  function check(document, contract, options = {}) {
    if (!document || typeof document !== "object" || Array.isArray(document))
      throw new TypeError("The audit is not a JSON object.");
    const rules = dict(contract);
    const definitionFor =
      typeof options.definitionFor === "function"
        ? options.definitionFor
        : () => null;
    const actionKindFor =
      typeof options.actionKindFor === "function"
        ? (kind) => {
            const definition = options.actionKindFor(kind);
            return definition && typeof definition === "object"
              ? definition
              : null;
          }
        : () => null;
    // Contract version 2 lists each compiler and whether it changes rows.
    const compilers = own(rules, "compilers") ? dict(rules.compilers) : null;
    const changesRows = (compiler) =>
      compilers
        ? compilers[compiler]?.changesRows === true
        : SHAPE_TYPES.has(compiler);
    const runs = new Map();
    // { compiler, params, label } for a step, or null when it can't run.
    const stepRun = (step) => {
      if (runs.has(step)) return runs.get(step);
      const typeId = text(step.step_type);
      const definition = definitionFor(step) || { id: typeId };
      const run = runFor(definition, rules);
      const result = run
        ? {
            compiler: run.compiler,
            params: dict(run.params),
            label: text(definition.id) || typeId,
          }
        : null;
      runs.set(step, result);
      return result;
    };
    const compilerOf = (step) => stepRun(step)?.compiler || "";
    // The step's params under the names its compiler reads.
    const paramsFor = (step) => {
      const saved = dict(step.params);
      const map = stepRun(step)?.params || {};
      const mapped = { ...saved };
      Object.entries(map).forEach(([to, from]) => {
        mapped[to] = saved[from];
      });
      return mapped;
    };
    const operators = new Map(
      Object.entries(dict(rules.operators)).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const blockedOperators = new Set(
      (rules.blockedOperators || []).map((value) =>
        String(value).toLowerCase(),
      ),
    );
    const runTokens = new Set(
      (rules.runParameterTokens || []).map((value) =>
        String(value).toLowerCase(),
      ),
    );
    const pseudoSources = new Set(
      (rules.pseudoSources || []).map((value) => String(value).toLowerCase()),
    );
    const thenActions = dict(rules.thenActions);
    const createModes = dict(rules.createColumnModes);
    const valueModes = dict(rules.valueModes);
    const formats = dict(rules.formats);
    const rounding = dict(rules.rounding);
    const duplicateActions = dict(rules.duplicateActions);

    const steps = (Array.isArray(document.steps) ? document.steps : []).filter(
      (step) => step && typeof step === "object" && !Array.isArray(step),
    );
    const sources = (
      Array.isArray(document.sources) ? document.sources : []
    ).filter((source) => source && typeof source === "object");
    const byName = new Map();
    for (const source of sources) {
      const alias = text(source.alias) || text(source.name);
      if (!alias) continue;
      if (!byName.has(text(source.name))) byName.set(text(source.name), source);
      if (!byName.has(alias)) byName.set(alias, source);
    }

    const blockers = [];
    const warnings = [];
    const numbers = new Map();
    const issue = (bucket, step, message) => {
      const entry = {
        stepNumber: step ? numbers.get(step) || "" : "",
        stepId: step ? text(step.id) : "",
        title: step ? text(step.title) : "",
        message,
      };
      if (
        !bucket.some(
          (item) =>
            item.stepNumber === entry.stepNumber &&
            item.stepId === entry.stepId &&
            item.title === entry.title &&
            item.message === entry.message,
        )
      )
        bucket.push(entry);
    };
    const block = (step, message) => issue(blockers, step, message);
    const warn = (step, message) => issue(warnings, step, message);

    // ---- step tree, numbered like the Logic Builder rules list -------------
    const byId = new Map();
    for (const step of steps) {
      const id = text(step.id);
      if (id && !byId.has(id)) byId.set(id, step);
    }
    // An ELSE step names its IF in parent_if_step_id (older audits: its parent).
    const elseFor = new Map();
    const attached = new Set();
    for (const step of steps) {
      if (compilerOf(step) !== "else") continue;
      const parent =
        text(dict(step.params).parent_if_step_id) || text(step.parentId);
      const target = byId.get(parent);
      if (target && IF_LIKE.has(compilerOf(target)) && !elseFor.has(parent)) {
        elseFor.set(parent, step);
        attached.add(step);
      }
    }
    const kidsOf = new Map();
    const roots = [];
    const orphans = [];
    steps.forEach((step, index) => {
      const parent = text(step.parentId);
      const entry = { order: numberOf(step, 0), index, step };
      if (parent && byId.has(parent) && parent !== text(step.id)) {
        if (!kidsOf.has(parent)) kidsOf.set(parent, []);
        kidsOf.get(parent).push(entry);
      } else {
        if (parent) orphans.push(step);
        roots.push(entry);
      }
    });
    const ordered = (entries) =>
      entries
        .sort((a, b) => a.order - b.order || a.index - b.index)
        .map((entry) => entry.step);
    const kids = new Map();
    kidsOf.forEach((entries, key) => kids.set(key, ordered(entries)));
    const rootSteps = ordered(roots);
    const childrenOf = (step) => kids.get(text(step.id)) || [];
    const number = (items, prefix) => {
      items.forEach((step, index) => {
        if (numbers.has(step)) return;
        const label = `${prefix}${index + 1}`;
        numbers.set(step, label);
        number(childrenOf(step), `${label}.`);
      });
    };
    number(rootSteps, "");
    for (const step of orphans)
      warn(step, "its parent step is missing, so it runs as a top-level step.");

    const branchChildren = (step, branch = "then") =>
      childrenOf(step).filter(
        (child) =>
          !attached.has(child) &&
          (child.branchType === "else" ? "else" : "then") === branch,
      );

    // ---- sources and joins --------------------------------------------------
    const tableOf = new Map();
    const tableIds = new Set();
    const aliasOf = (sourceFile = "", sourceAlias = "") => {
      const alias = text(sourceAlias);
      if (alias && pseudoSources.has(alias.toLowerCase())) return "";
      if (alias) return alias;
      const file = text(sourceFile);
      if (!file || pseudoSources.has(file.toLowerCase())) return "";
      const source = byName.get(file);
      return source ? text(source.alias) || text(source.name) : file;
    };
    const declare = (alias) => {
      if (!tableOf.has(alias)) {
        tableOf.set(alias, alias);
        tableIds.add(alias);
      }
      return tableOf.get(alias);
    };

    // ---- helpers that throw Blocked ------------------------------------------
    const requireField = (fieldName, what = "field") => {
      if (!text(fieldName)) throw new Blocked(`no ${what} is chosen.`);
    };
    const isRunToken = (value) =>
      runTokens.has(
        text(value)
          .toLowerCase()
          .replace(/^[[\]{}()]+|[[\]{}()]+$/g, ""),
      );

    function math(step, operations, what = "calculation") {
      const list = jsonList(operations);
      if (list === null) throw new Blocked(`its ${what} could not be read.`);
      let count = 0;
      for (const item of list) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        if (!MATH_OPERATORS.has(text(item.operator)))
          throw new Blocked(
            `its ${what} uses an operator that is not + - * /.`,
          );
        if (text(item.operandType || item.operand_type) === "field")
          requireField(
            item.operandFieldName || item.operand_field_name,
            "field in its calculation",
          );
        else if (!parseNumber(item.operand))
          throw new Blocked(
            `its ${what} has a number that is missing or not a number.`,
          );
        count += 1;
      }
      if (count > MAX_EXPR_DEPTH)
        throw new Blocked(
          `its ${what} has more than ${MAX_EXPR_DEPTH} operations.`,
        );
    }

    function calculation(step, operations, roundingMode, places) {
      math(step, operations || []);
      const mode = text(roundingMode).toLowerCase() || "none";
      if (!own(rounding, mode))
        throw new Blocked(
          `the rounding ${JSON.stringify(text(roundingMode))} is not known.`,
        );
      const digits = text(places) || "0";
      if (!/^\d+$/.test(digits) || Number(digits) > 10)
        throw new Blocked(
          "decimal places must be a whole number from 0 to 10.",
        );
    }

    function valueLines(step, raw) {
      const lines = String(raw == null ? "" : raw)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (
        lines.length === 1 &&
        lines[0].includes(",") &&
        !parseNumber(lines[0])
      ) {
        const parts = [
          ...lines[0].matchAll(/\s*(?:'([^']*)'|"([^"]*)"|([^,]*))\s*(?:,|$)/g),
        ]
          .map((match) => [match[1], match[2], match[3]].find((g) => g != null))
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          warn(
            step,
            "a condition's values are separated by commas; they are read as " +
              `a list of ${parts.length} values. Put one value per line in ATLAS.`,
          );
          return parts;
        }
      }
      return lines;
    }

    function leaf(step, condition) {
      requireField(condition.fieldName, "field for a condition");
      const operatorText =
        text(condition.operator).toLowerCase().replace(/\s+/g, " ") ||
        "is equal to";
      const mode = text(condition.valueMode).toLowerCase() || "values";
      if (blockedOperators.has(operatorText))
        throw new Blocked(`the operator '${operatorText}' can't run yet.`);
      if (mode === "blank") return;
      if (!operators.has(operatorText))
        throw new Blocked(`the operator '${operatorText}' is not known.`);
      const operator = operators.get(operatorText);
      if (operator === "blank" || operator === "notBlank") return;
      if (mode === "field") {
        requireField(condition.compareFieldName, "field to compare with");
        if (truthy(condition.compareMathJson))
          math(step, condition.compareMathJson, "comparison calculation");
        return;
      }
      if (mode === "expression") {
        if (!isRunToken(condition.expression))
          throw new Blocked(
            "a condition compares with a free-text expression; rebuild it " +
              "with a field, a value or the run date.",
          );
        if (TEXT_MATCH.has(operator))
          throw new Blocked(
            "a text match (contains, starts or ends with) can't use the run date.",
          );
        return;
      }
      if (mode !== "values" || !own(valueModes, mode))
        throw new Blocked(`the value mode '${mode}' is not known.`);
      const lines = valueLines(step, condition.compareValue);
      const orBlank = lines.some((line) =>
        BLANK_TOKENS.has(line.toLowerCase()),
      );
      const values = lines.filter(
        (line) => !BLANK_TOKENS.has(line.toLowerCase()),
      );
      if (
        values.length === 1 &&
        !TEXT_MATCH.has(operator) &&
        isRunToken(values[0])
      ) {
        if (orBlank)
          throw new Blocked("a condition mixes the run date with blank/null.");
        return;
      }
      if (ORDER_OPERATORS.has(operator)) {
        if (values.length !== 1 || orBlank)
          throw new Blocked(
            "a greater/less than condition needs exactly one value.",
          );
        return;
      }
      if (!values.length) {
        if (operator === "equals" || operator === "notEquals") {
          if (!orBlank)
            warn(
              step,
              "a condition compares with an empty value; it is read as " +
                (operator === "equals" ? "'is blank'." : "'is not blank'."),
            );
          return;
        }
        throw new Blocked("a condition has no value to compare with.");
      }
    }

    function conditions(step) {
      const params = dict(step.params);
      if (truthy(params.conditions_json)) {
        const nodes = jsonList(params.conditions_json);
        if (nodes === null)
          throw new Blocked("its conditions could not be read.");
        if (nodes.length) return nodes;
      }
      return (Array.isArray(step.conditions) ? step.conditions : [])
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          sourceFile: item.sourceFile || step.source || params.source_file,
          fieldName: item.fieldName || item.field || params.field_name,
          operator: item.operator || params.operator || "is equal to",
          valueMode: item.valueMode || "values",
          compareValue: item.compareValue || item.value || params.compare_value,
          compareFieldName: item.compareFieldName,
          expression: item.expression,
          compareMathJson: item.compareMathJson || item.compare_math_json,
        }));
    }

    function when(step, nodes) {
      if (!nodes.length) throw new Blocked("has no condition.");
      const visit = (node) => {
        if (node && node.conditionType === "group") {
          const items = (Array.isArray(node.items) ? node.items : []).filter(
            (item) => item && typeof item === "object",
          );
          if (!items.length) throw new Blocked("has an empty condition group.");
          items.forEach(visit);
          return;
        }
        leaf(step, dict(node));
      };
      let seen = false;
      for (const node of nodes) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        seen = true;
        visit(node);
      }
      if (!seen) throw new Blocked("has no condition.");
    }

    // ---- THEN / ELSE actions --------------------------------------------------
    function stringTransform(step, params, prefix, defaultTarget) {
      const get = (name, fallback = "") =>
        params[prefix + name] == null ? fallback : params[prefix + name];
      const raw = text(get("string_operation"));
      const position = text(get("string_position"));
      const operation = STRING_OPERATIONS.includes(raw)
        ? raw
        : raw === "string_length"
          ? "character_count"
          : raw === "substring" && position === "last"
            ? "last_characters"
            : "first_characters";
      const target =
        text(get("target_column", get("column_name", ""))) || defaultTarget;
      requireField(get("string_source_field"), "source field");
      if (operation === "split") return splitColumns(get);
      if (!target)
        throw new Blocked(
          "the string transformation has no destination column.",
        );
      if (
        operation !== "character_count" &&
        positiveInt(get("string_character_count")) === null
      )
        throw new Blocked(
          "the number of characters must be a positive whole number.",
        );
      return undefined;
    }

    function splitColumns(get) {
      const mode = ["every", "first", "last"].includes(
        text(get("string_split_mode")),
      )
        ? text(get("string_split_mode"))
        : "every";
      const choice = text(get("string_split_delimiter")).toLowerCase();
      const delimiter =
        choice === "custom"
          ? String(get("string_split_custom_delimiter") || "")
          : DELIMITER_WORDS.has(choice || "space")
            ? "x"
            : "";
      if (!delimiter) throw new Blocked("the split has no delimiter.");
      let count = 2;
      if (mode === "every") {
        count = positiveInt(get("string_split_column_count"));
        if (count === null)
          throw new Blocked(
            "a split into every part needs a number of columns.",
          );
        count = Math.min(count, SPLIT_MAX_COLUMNS);
      }
      for (let i = 1; i <= count; i += 1)
        if (!text(get(`string_split_column_${i}`)))
          throw new Blocked("every split column needs a name.");
      return undefined;
    }

    // The File Utility handler for an action kind: the kind definition's
    // export.fileUtility.action (contract version 3), or, for a kind with no
    // definition (a publication saved before action kinds were definitions),
    // the kind's own name. Throws Blocked when File Utility has no handler.
    function actionHandler(kind) {
      const definition = actionKindFor(kind);
      let handler = kind;
      if (definition) {
        handler = text(definition.export?.fileUtility?.action);
        if (!handler)
          throw new Blocked(
            `the action '${text(definition.label) || kind}' has no File Utility handler yet.`,
          );
      }
      if (!own(thenActions, handler))
        throw new Blocked(`the action '${handler}' is not known.`);
      return handler;
    }

    // Returns the unparsed free-form text, or null when the action is fully
    // checked. Throws Blocked when the action itself is unusable.
    function action(step, params) {
      const kind = actionHandler(text(params.then_action_type) || "freeform");
      if (kind === "freeform") {
        const freeText = text(params.then_action);
        if (/^display\s+"[\s\S]+"\s+in\s+column\s+"[\s\S]+"$/i.test(freeText)) {
          warn(
            step,
            "its free-form action was read as Display Text; change it to a " +
              "Display Text action in ATLAS.",
          );
          return null;
        }
        if (/^do\s+not\s+display$/i.test(freeText)) {
          warn(
            step,
            "its free-form action was read as Do Not Display; change it to a " +
              "Do Not Display action in ATLAS.",
          );
          return null;
        }
        return freeText;
      }
      if (kind === "set_column_value") {
        if (!text(params.then_target_column))
          throw new Blocked("Set Column Value has no target column.");
        if (
          !text(params.then_value_field) &&
          params.then_value == null &&
          params.then_static_value == null
        )
          throw new Blocked("Set Column Value has no value field.");
      } else if (kind === "set_column_calculation") {
        if (!text(params.then_target_column))
          throw new Blocked("Set Column Calculation has no target column.");
        requireField(params.then_value_field, "value field");
        calculation(
          step,
          params.then_math_json,
          params.then_rounding_mode,
          params.then_rounding_decimal_places,
        );
      } else if (kind === "set_column_string_transform") {
        stringTransform(step, params, "then_", "");
      } else if (kind === "display_text") {
        // Writes nothing without text; File Utility only warns about that.
      }
      return null;
    }

    function freeform(step, freeText, kidsList) {
      if (kidsList.length) {
        if (freeText)
          warn(
            step,
            "its free-form action text is not run; only its child steps are.",
          );
        return;
      }
      if (freeText)
        throw new Blocked(
          "it has a free-form action; rebuild it as a structured action in ATLAS.",
        );
    }

    // ---- steps ------------------------------------------------------------------
    function legacyCondition(step, params) {
      // filter_rows has filter_action and flag_records flag_action; a step
      // saved before either was set goes by its type.
      const isFilter = own(params, "filter_action")
        ? true
        : own(params, "flag_action")
          ? false
          : step.step_type === "filter_rows";
      const kind = isFilter
        ? params.filter_action === "Exclude matching rows"
          ? "do_not_display"
          : "display"
        : params.flag_action === "do_not_display"
          ? "do_not_display"
          : "display_text";
      return {
        ...step,
        step_type: "if_then",
        params: {
          conditions_json: JSON.stringify([
            {
              fieldName: params.field_name || step.field,
              operator: params.operator || "is equal to",
              valueMode: "values",
              compareValue: params.compare_value || "",
            },
          ]),
          then_action_type: kind,
        },
      };
    }

    function fieldList(params, key) {
      let items = jsonList(params[key]);
      if (items === null)
        throw new Blocked("its column list could not be read.");
      if (!items.length && text(params.field_name))
        items = [{ fieldName: params.field_name }];
      const named = items.filter(
        (item) => item && typeof item === "object" && text(item.fieldName),
      );
      if (!named.length) throw new Blocked("no column is chosen.");
    }

    function formatField(params) {
      requireField(params.field_name);
      const format = text(params.format) || "text";
      const low = format.toLowerCase();
      const padded = /^(\w+) digits? with leading zero(?:e)?s?$/.exec(low);
      if (padded) {
        const width = /^\d+$/.test(padded[1])
          ? Number(padded[1])
          : NUMBER_WORDS[padded[1]] || 0;
        if (width < 1 || width > 100)
          throw new Blocked(`the format '${format}' is not known.`);
      } else if (
        own(formats, low) ||
        DATE_FORMATS.includes(low) ||
        low.includes("mm/dd/yyyy") ||
        low === "number" ||
        low === "text"
      ) {
        return;
      } else {
        throw new Blocked(`the format '${format}' is not known.`);
      }
    }

    function splitField(params) {
      requireField(params.field_name);
      const raw = params.split_on == null ? "" : String(params.split_on);
      if (!(DELIMITER_WORDS.has(raw.trim().toLowerCase()) || raw))
        throw new Blocked("the split has no delimiter.");
      if (!text(params.output_column))
        throw new Blocked("the split has no output column.");
    }

    function createColumn(step, params) {
      const name = text(params.column_name) || text(step.field);
      const mode = text(params.value_mode) || "Static value";
      if (mode !== "String transformation" && !name)
        throw new Blocked("the new column has no name.");
      if (!own(createModes, mode))
        throw new Blocked(`the value mode '${mode}' is not known.`);
      if (mode === "Source field value") {
        requireField(params.field_name);
        calculation(
          step,
          params.source_math_json,
          params.rounding_mode || params.rounding_method,
          params.rounding_decimal_places,
        );
      } else if (mode === "Concatenate fields") {
        [1, 2].forEach((i) =>
          requireField(params[`concat_field_${i}`], `field ${i} to combine`),
        );
      } else if (mode === "Expression / calculation") {
        const type = text(params.expression_type);
        if (type === "first_characters" || type === "character_count") {
          requireField(params.expression_source_field || params.field_name);
          if (
            type === "first_characters" &&
            positiveInt(params.character_count) === null
          )
            throw new Blocked(
              "the number of characters must be a positive whole number.",
            );
        } else expression(step, params.expression);
      } else if (mode === "Expression") {
        expression(step, params.expression);
      } else if (mode === "String transformation") {
        stringTransform(step, params, "", name);
      }
    }

    // "<run date> - <field>" or "<field> - <run date>" is the only expression
    // File Utility runs.
    function expression(step, raw) {
      const value = text(raw).replace(/^=+/, "").trim();
      for (const match of value.matchAll(/\s+-\s+|-/g)) {
        const left = value.slice(0, match.index).trim();
        const right = value.slice(match.index + match[0].length).trim();
        const leftToken = isRunToken(left);
        const rightToken = isRunToken(right);
        if (
          (leftToken && right && !rightToken) ||
          (rightToken && left && !leftToken)
        ) {
          warn(
            step,
            "its expression was read as a number of days between the run date " +
              "and a date column.",
          );
          return;
        }
      }
      throw new Blocked(
        "it uses a free-text expression; rebuild it with a structured " +
          "calculation or string transformation.",
      );
    }

    function join(step, params) {
      if (text(params.join_type).toUpperCase() === "UNION")
        return union(step, params);
      if (!JOIN_TYPES.has(text(params.join_type).toUpperCase() || "INNER JOIN"))
        throw new Blocked(
          `the join type '${text(params.join_type)}' is not known.`,
        );
      const left = aliasOf(params.left_source, params.left_alias);
      const right = aliasOf(params.right_source, params.right_alias);
      if (!left || !right)
        throw new Blocked("the join needs a left and a right source.");
      let pairs = jsonList(params.join_keys_json);
      if (pairs === null) throw new Blocked("its join keys could not be read.");
      const first = {
        left_field: params.left_field,
        right_field: params.right_field,
      };
      pairs = pairs.filter((item) => item && typeof item === "object");
      pairs = pairs.length
        ? [
            { ...pairs[0], ...first },
            ...pairs
              .slice(1)
              .filter(
                (item) => text(item.left_field) || text(item.right_field),
              ),
          ]
        : [first];
      for (const pair of pairs)
        if (!text(pair.left_field) || !text(pair.right_field))
          throw new Blocked("a join key is missing its left or right field.");
      if (pairs.length > MAX_KEYS)
        throw new Blocked(`the join has more than ${MAX_KEYS} key pairs.`);
      const leftTable = declare(left);
      const rightTable = declare(right);
      if (leftTable === rightTable)
        throw new Blocked(
          `sources '${left}' and '${right}' are already joined, and a source can ` +
            "be joined only once. To look it up again on another key, add a " +
            "second Reference Source with its own alias and join that.",
        );
      tableOf.forEach((table, alias) => {
        if (table === rightTable) tableOf.set(alias, leftTable);
      });
    }

    function union(step, params) {
      const left = aliasOf(
        params.union_left_source || params.left_source,
        params.union_left_alias || params.left_alias,
      );
      const right = aliasOf(
        params.union_right_source || params.right_source,
        params.union_right_alias || params.right_alias,
      );
      const output =
        text(params.output_alias) ||
        text(params.output_source_alias) ||
        text(params.output_source);
      if (!left || !right) throw new Blocked("the union needs two sources.");
      if (left === right)
        throw new Blocked(
          "the union combines a source with itself; choose two different sources.",
        );
      if (!output) throw new Blocked("the union has no output name.");
      if (declare(left) === declare(right))
        throw new Blocked(
          `sources '${left}' and '${right}' are already joined.`,
        );
      if (tableOf.has(output) || tableIds.has(output))
        throw new Blocked(
          `the union's output name '${output}' is already used.`,
        );
      if (pseudoSources.has(output.toLowerCase()))
        throw new Blocked("the union's output name is reserved.");
      tableOf.set(output, output);
      tableIds.add(output);
    }

    function referenceSource(step, params, inBranch) {
      if (inBranch)
        throw new Blocked(
          "a Reference Source step can't be inside an IF branch.",
        );
      const alias = aliasOf(
        params.source_file || step.source,
        params.source_alias,
      );
      if (!alias) throw new Blocked("no source is chosen.");
      declare(alias);
    }

    function compileList(items, inBranch) {
      items.forEach((step) => compileStep(step, inBranch));
    }

    function compileStep(original, inBranch) {
      let step = original;
      if (step.enabled === false || attached.has(step)) return;
      const run = stepRun(step);
      let kind = run?.compiler || "";
      if (kind === "else") {
        warn(
          step,
          "this ELSE step has no IF step, so it and its child steps are skipped.",
        );
        return;
      }
      try {
        if (!run)
          throw new Blocked(
            `the step type '${text(step.step_type)}' can't run in File Utility.`,
          );
        if (compilers && !own(compilers, kind))
          throw new Blocked(
            `the step type '${run.label}' names the File Utility compiler '${kind}', which File Utility doesn't have.`,
          );
        if (inBranch && changesRows(kind))
          throw new Blocked(
            "steps that add or remove rows can't be inside an IF branch.",
          );
        let params = paramsFor(step);
        if (kind === "legacy_condition") {
          step = legacyCondition(step, params);
          params = dict(step.params);
          kind = "if_then";
        } else step = { ...step, params };
        if (kind === "reference_source")
          referenceSource(step, params, inBranch);
        else if (kind === "if_then") return ifThen(original, step, params);
        else if (kind === "create_column") createColumn(step, params);
        else if (kind === "format_field") formatField(params);
        else if (kind === "split_field") splitField(params);
        else if (kind === "sort_records") fieldList(params, "sort_fields_json");
        else if (kind === "remove_duplicates") {
          fieldList(params, "duplicate_fields_json");
          if (
            !own(
              duplicateActions,
              text(params.duplicate_action) || "Keep first record",
            )
          )
            throw new Blocked(
              `the duplicate action '${text(params.duplicate_action)}' is not known.`,
            );
        } else if (kind === "join") join(step, params);
        else if (kind === "union_sources") union(step, params);
        else
          throw new Blocked(
            `this version of ATLAS Align can't check the File Utility compiler '${kind}'.`,
          );
      } catch (error) {
        if (!(error instanceof Blocked)) throw error;
        block(original, error.message);
        // A blocked IF skips its child steps; any other step still runs them.
        if (kind === "if_then" || kind === "legacy_condition") return;
      }
      compileList(branchChildren(original), inBranch);
    }

    function ifThen(original, step, params) {
      try {
        when(step, conditions(step));
        const thenText = action(original, params);
        let elseStep = elseFor.get(text(original.id)) || null;
        if (
          elseStep &&
          (text(params.include_else_branch) === "No" ||
            elseStep.enabled === false)
        )
          elseStep = null;
        let elseText = null;
        if (elseStep) {
          try {
            elseText = action(elseStep, paramsFor(elseStep));
          } catch (error) {
            if (!(error instanceof Blocked)) throw error;
            block(elseStep, error.message);
          }
        }
        const thenKids = branchChildren(original, "then");
        let elseKids = branchChildren(original, "else");
        if (elseStep)
          elseKids = [
            ...branchChildren(elseStep, "then"),
            ...branchChildren(elseStep, "else"),
            ...elseKids,
          ];
        if (thenText !== null) freeform(original, thenText, thenKids);
        if (elseStep && elseText !== null) {
          try {
            freeform(elseStep, elseText, elseKids);
          } catch (error) {
            if (!(error instanceof Blocked)) throw error;
            block(elseStep, error.message);
          }
        }
        compileList(thenKids, true);
        compileList(elseKids, true);
      } catch (error) {
        if (!(error instanceof Blocked)) throw error;
        block(original, error.message);
      }
    }

    compileList(rootSteps, false);
    if (!rootSteps.length) block(null, "the audit has no logic steps yet.");

    return {
      runnable: blockers.length === 0,
      blockers,
      warnings,
      contractVersion: rules.contractVersion ?? null,
      compilerVersion: rules.compilerVersion ?? null,
    };
  }

  if (!global.FileUtilityReadiness)
    global.FileUtilityReadiness = Object.freeze({ check, runFor });
})(typeof window !== "undefined" ? window : globalThis);
