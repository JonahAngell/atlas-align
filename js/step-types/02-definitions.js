/**
 * Step type definitions: conditions, checks beyond the JSON Schema, and the
 * accessors that pick the right template, fields and export role for a
 * subtype.
 *
 * Classic-script usage:
 *   const { definitions } = ATLASStepTypes;
 *   const result = definitions.validate(definition, { schema, helpers: [...] });
 *   definitions.matches({ param: "format", equals: "text" }, step);
 *   definitions.template(definition, "english", "text");
 */
(function initializeStepTypeDefinitions(global) {
  "use strict";

  const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2]);
  /** Helper hash keys that name a partial: {helper: key}. */
  const PARTIAL_HASHES = Object.freeze({ conditionTree: "leaf" });
  /** The schema version that added `partials`. */
  const PARTIALS_SCHEMA_VERSION = 2;
  const TEMPLATE_ROOTS = Object.freeze([
    "param",
    "subtype",
    "stepNumber",
    "parent",
    "step",
    "format",
    "conditions",
    "storedConditions",
    "elseStep",
    "ifStep",
  ]);
  /** The templates of export.qtest.action, each rendered as plain text. */
  const QTEST_ACTION_TEMPLATES = Object.freeze([
    "kind",
    "message",
    "outputColumn",
    "targetColumn",
    "valueField",
    "calculated",
    "text",
  ]);
  /** The kinds export.qtest.action's kind template may render. */
  const QTEST_ACTION_KINDS = Object.freeze([
    "display_text",
    "do_not_display",
    "set_column",
    "freeform",
    "none",
  ]);
  /**
   * The partials of the step type that includes an action kind, which the
   * kind's own partials may include: the condition in one dialect, and the
   * frames a kind's formula sits in (a filter, a column value, the freeform
   * match).
   */
  const ACTION_HOST_PARTIALS = Object.freeze([
    "condition",
    "filter",
    "valueFormula",
    "freeformFormula",
  ]);
  /** Step type keys an action kind does not have. */
  const STEP_ONLY_KEYS = Object.freeze([
    "category",
    "legacyType",
    "aliases",
    "migrations",
    "subtypes",
    "editorFrame",
    "block",
    "outputs",
    "branches",
    "inverse",
    "orderGroup",
    "referenceChild",
    "english",
    "formulas",
    "autoNotes",
    "textImport",
  ]);
  /** Field controls an action kind's fields can't use. */
  const ACTION_FIELD_LIMITS = Object.freeze(["condition_group", "action"]);
  /** Extra values qTest outcome templates may read: the record wording. */
  const OUTCOME_ROOTS = Object.freeze(["record"]);
  const SUBJECT_KEYS = ["param", "stepField"];
  /** Controls that write params of their own besides their field's param. */
  const COMPOSITE_CONTROLS = Object.freeze([
    "sort_keys",
    "duplicate_keys",
    "condition_group",
    "action",
    "math",
    "string_transform",
    "join_type",
    "join_keys",
  ]);
  const TEST_KEYS = [
    "equals",
    "notEquals",
    "in",
    "blank",
    "notBlank",
    "positiveWholeNumber",
    "equalsIgnoreCase",
  ];
  const GROUP_KEYS = ["all", "any", "not"];

  const own = (target, key) =>
    target &&
    typeof target === "object" &&
    Object.prototype.hasOwnProperty.call(target, key)
      ? target[key]
      : undefined;

  const isBlank = (value) =>
    value == null || (typeof value === "string" && value.trim() === "");

  const scalarText = (value) => (value == null ? "" : String(value));

  // ---------------------------------------------------------------------------
  // Conditions: {param|stepField, equals|notEquals|in|blank|notBlank},
  // {all: [...]}, {any: [...]}, {not: {...}}.
  // ---------------------------------------------------------------------------

  /** True when `condition` holds for a step ({ params, ...stepFields }). */
  function matches(condition, step = {}) {
    if (condition == null || condition === "always") return true;
    if (Array.isArray(condition.all))
      return condition.all.every((item) => matches(item, step));
    if (Array.isArray(condition.any))
      return condition.any.some((item) => matches(item, step));
    if (condition.not) return !matches(condition.not, step);
    const value =
      condition.param !== undefined
        ? own(step.params || {}, condition.param)
        : own(step, condition.stepField);
    if (condition.blank) return isBlank(value);
    if (condition.notBlank) return !isBlank(value);
    if (condition.positiveWholeNumber) {
      const typed = scalarText(value).trim();
      return /^\d+$/.test(typed) && Number(typed) > 0;
    }
    if (Object.prototype.hasOwnProperty.call(condition, "equalsIgnoreCase"))
      return (
        scalarText(value).toUpperCase() ===
        scalarText(condition.equalsIgnoreCase).toUpperCase()
      );
    if (Object.prototype.hasOwnProperty.call(condition, "equals"))
      return scalarText(value) === scalarText(condition.equals);
    if (Object.prototype.hasOwnProperty.call(condition, "notEquals"))
      return scalarText(value) !== scalarText(condition.notEquals);
    if (Array.isArray(condition.in))
      return condition.in.map(scalarText).includes(scalarText(value));
    return false;
  }

  /** Shape problems the JSON Schema cannot express, e.g. two tests at once. */
  function conditionProblems(condition, path, problems) {
    if (!condition || condition === "always" || typeof condition !== "object")
      return;
    const keys = Object.keys(condition);
    const groups = keys.filter((key) => GROUP_KEYS.includes(key));
    const subjects = keys.filter((key) => SUBJECT_KEYS.includes(key));
    const tests = keys.filter((key) => TEST_KEYS.includes(key));
    if (groups.length) {
      if (groups.length > 1 || subjects.length || tests.length)
        problems.push({
          path,
          code: "condition",
          message:
            "use only one of all, any or not, without param or stepField",
        });
      (condition.all || []).forEach((item, index) =>
        conditionProblems(item, `${path}/all/${index}`, problems),
      );
      (condition.any || []).forEach((item, index) =>
        conditionProblems(item, `${path}/any/${index}`, problems),
      );
      if (condition.not)
        conditionProblems(condition.not, `${path}/not`, problems);
      return;
    }
    if (subjects.length !== 1)
      problems.push({
        path,
        code: "condition",
        message: "needs exactly one of param or stepField",
      });
    if (tests.length !== 1)
      problems.push({
        path,
        code: "condition",
        message:
          "needs exactly one of equals, equalsIgnoreCase, notEquals, in, blank, notBlank or positiveWholeNumber",
      });
  }

  function conditionParams(condition, found = []) {
    if (!condition || typeof condition !== "object") return found;
    if (condition.param) found.push(condition.param);
    (condition.all || []).forEach((item) => conditionParams(item, found));
    (condition.any || []).forEach((item) => conditionParams(item, found));
    if (condition.not) conditionParams(condition.not, found);
    return found;
  }

  // ---------------------------------------------------------------------------
  // Accessors.
  // ---------------------------------------------------------------------------

  /** The subtype value stored on a step, or the definition's default. */
  function subtypeOf(definition, step = {}) {
    const subtypes = definition?.subtypes;
    if (!subtypes) return "";
    const stored = own(step.params || {}, subtypes.param);
    if (!isBlank(stored)) return String(stored);
    return subtypes.default ?? subtypes.options[0]?.value ?? "";
  }

  function subtypeOption(definition, subtype) {
    return (
      definition?.subtypes?.options.find(
        (option) => option.value === subtype,
      ) || null
    );
  }

  /** The first variant whose `when` holds for the step, or null. */
  function variantFor(list, step) {
    if (!Array.isArray(list) || !step) return null;
    return list.find((variant) => matches(variant.when, step)) || null;
  }

  /**
   * english/autoNotes template: the first matching variant when a step is
   * given, else the subtype's, falling back to `default`.
   */
  function template(definition, section, subtype = "", step = null) {
    const set = definition?.[section];
    if (!set) return null;
    const variant = variantFor(set.variants, step);
    if (variant) return variant.template;
    const specific = own(set.bySubtype || {}, subtype);
    if (specific !== undefined) return specific;
    return set.default ?? null;
  }

  /** {excel, sql, python} for a subtype; each dialect falls back separately. */
  function formulas(definition, subtype = "") {
    const set = definition?.formulas || {};
    const specific = own(set.bySubtype || {}, subtype) || {};
    const fallback = set.default || {};
    const result = {};
    ["excel", "sql", "python"].forEach((dialect) => {
      const value = specific[dialect] ?? fallback[dialect];
      if (value !== undefined) result[dialect] = value;
    });
    return result;
  }

  /**
   * The formula set for a step: the definition's formulas with the first
   * matching variant's shape, target, formulas and notes laid over them.
   */
  function formulaSet(definition, step = null) {
    const set = definition?.formulas || { shape: "none" };
    const variant = variantFor(set.variants, step);
    if (!variant) return set;
    const { when: _when, ...override } = variant;
    const dialects = {};
    ["excel", "sql", "python"].forEach((dialect) => {
      if (override[dialect] !== undefined)
        dialects[dialect] = override[dialect];
      delete override[dialect];
    });
    return {
      ...set,
      ...override,
      variant: true,
      default: dialects,
      bySubtype: {},
    };
  }

  /** Base fields followed by the selected subtype's own fields. */
  function fields(definition, subtype = "") {
    return [
      ...(definition?.fields || []),
      ...(subtypeOption(definition, subtype)?.fields || []),
    ];
  }

  /** Script role and qTest settings after subtype overrides and rules. */
  function exportFor(definition, step = {}) {
    const base = definition?.export || { scriptRole: "none" };
    const option = subtypeOption(definition, subtypeOf(definition, step));
    const result = {
      scriptRole: base.scriptRole,
      qtest: { ...(base.qtest || {}) },
    };
    const apply = (override) => {
      if (!override) return;
      if (override.scriptRole) result.scriptRole = override.scriptRole;
      if (override.qtest) Object.assign(result.qtest, override.qtest);
    };
    apply(option?.export);
    (base.rules || []).forEach((rule) => {
      if (matches(rule.when, step)) apply(rule);
    });
    return result;
  }

  // The handler File Utility used for a type before definitions carried an
  // export.fileUtility block: its own id, except these two.
  /**
   * What the rest of ATLAS asks of a step type, for versions written before
   * the definition said so itself: the types that carry a stored condition
   * without a condition_group field, IF / THEN's THEN and ELSE children and
   * linked inverse, and the business order groups.
   */
  const LEGACY_CAPABILITIES = Object.freeze({
    // IF / THEN's version 1 was a behavior block with no condition_group.
    conditionGroup: Object.freeze(["if_then"]),
    storedConditions: Object.freeze(["else", "filter_rows", "flag_records"]),
    branches: Object.freeze({ if_then: Object.freeze(["then", "else"]) }),
    inverse: Object.freeze(["if_then"]),
    referenceChild: Object.freeze(["if_then", "create_column"]),
    orderGroups: Object.freeze({
      reference_source: 10,
      join: 20,
      create_column: 30,
    }),
  });
  const DEFAULT_ORDER_GROUP = 40;

  /**
   * { carriesConditions, storesConditions, branches, inverse, orderGroup,
   * referenceChild } for `definition` (or, with no definition, for the type id `typeId`).
   * storesConditions: the step keeps its conditions in a condition_group
   * field; carriesConditions also covers the legacy types that store one
   * condition in their own params. branches lists the children it has
   * ("then", "else"); inverse turns on Create or Open Linked Inverse;
   * referenceChild offers the type in a Reference step's child menu.
   * Definition keys win over the legacy answers.
   */
  function capabilities(definition, typeId = definition?.id) {
    const id = typeof typeId === "string" ? typeId : "";
    const own = definition && typeof definition === "object" ? definition : {};
    const allFields = [
      ...(own.fields || []),
      ...(own.subtypes?.options || []).flatMap((option) => option.fields || []),
    ];
    const storesConditions =
      allFields.some((field) => field?.control === "condition_group") ||
      LEGACY_CAPABILITIES.conditionGroup.includes(id);
    const branches = Array.isArray(own.branches)
      ? [...own.branches]
      : [...(LEGACY_CAPABILITIES.branches[id] || [])];
    return {
      carriesConditions:
        storesConditions || LEGACY_CAPABILITIES.storedConditions.includes(id),
      storesConditions,
      branches,
      inverse:
        typeof own.inverse === "boolean"
          ? own.inverse
          : LEGACY_CAPABILITIES.inverse.includes(id),
      orderGroup: Number.isInteger(own.orderGroup)
        ? own.orderGroup
        : LEGACY_CAPABILITIES.orderGroups[id] || DEFAULT_ORDER_GROUP,
      referenceChild:
        typeof own.referenceChild === "boolean"
          ? own.referenceChild
          : LEGACY_CAPABILITIES.referenceChild.includes(id),
    };
  }

  const LEGACY_FILE_UTILITY_COMPILERS = Object.freeze({
    filter_rows: "legacy_condition",
    flag_records: "legacy_condition",
  });

  /**
   * How File Utility runs `definition`: { compiler, status, when, params,
   * legacy }, or null when it can't. The definition's export.fileUtility
   * block decides. A version written before the block existed falls back to
   * the contract's legacyStepTypes entry for its id (stepTypes in a version
   * 1 contract), with legacy true. `params` maps the compiler's params to
   * the step's own.
   */
  function fileUtilityFor(definition, contract = {}) {
    const block = definition?.export?.fileUtility;
    if (block && typeof block === "object")
      return {
        compiler: String(block.compiler || ""),
        status: block.status || "supported",
        when: block.when || "",
        params: { ...(block.params || {}) },
        legacy: false,
      };
    const id = typeof definition?.id === "string" ? definition.id : "";
    const list = contract?.legacyStepTypes || contract?.stepTypes || {};
    if (!id || !Object.prototype.hasOwnProperty.call(list, id)) return null;
    return {
      compiler: LEGACY_FILE_UTILITY_COMPILERS[id] || id,
      status: list[id]?.status || "supported",
      when: list[id]?.when || "",
      params: {},
      legacy: true,
    };
  }

  /** Script roles whose formulas the code export places as a row test. */
  const ROW_TEST_ROLES = Object.freeze(["condition", "else", "filter", "flag"]);

  /**
   * Why the code export could not place a step's formulas, the rule
   * atlasCodeClassify (js/12b) uses: for a row-test role the SQL must start
   * with "WHERE " or name a column with "AS [", and an ELSE needs SQL or a
   * lead. Formulas with a note are exempt, because the export shows the note
   * as the reason (freeform actions). [] when the export can place them.
   */
  function exportShapeProblems(role, formulas) {
    if (!ROW_TEST_ROLES.includes(role)) return [];
    const result = formulas && typeof formulas === "object" ? formulas : {};
    if ((Array.isArray(result.notes) ? result.notes : []).some(Boolean))
      return [];
    const sql = String(result.sql || "");
    if (!sql.trim()) {
      if (role === "else" && String(result.lead || "").trim()) return [];
      return [
        {
          code: "export_shape",
          message: `a ${role} step needs SQL${role === "else" ? " or a lead" : ""} for the code export`,
        },
      ];
    }
    if (sql.startsWith("WHERE ") || /\bAS \[/.test(sql)) return [];
    return [
      {
        code: "export_shape",
        message: `the code export cannot place this ${role} step: its SQL must start with "WHERE " or name a column with "AS [", or the formulas need a note`,
      },
    ];
  }

  /**
   * Export shape warnings for each of a definition's tests: each case's
   * sample step is rendered with renderFormulas(definition, step) and
   * checked with exportShapeProblems. They never stop loading or publishing.
   */
  function exportShapeWarnings(definition, renderFormulas) {
    if (typeof renderFormulas !== "function") return [];
    const cases = Array.isArray(definition?.tests) ? definition.tests : [];
    const warnings = [];
    cases.forEach((testCase, index) => {
      const step = {
        id: `test_${index + 1}`,
        ...(testCase?.step || {}),
        step_type: definition.id,
        params: { ...(testCase?.params || {}) },
      };
      const role = exportFor(definition, step).scriptRole;
      if (!ROW_TEST_ROLES.includes(role)) return;
      let formulas;
      try {
        formulas = renderFormulas(definition, step);
      } catch {
        return;
      }
      exportShapeProblems(role, formulas || {}).forEach((problem) =>
        warnings.push({
          path: `/tests/${index}`,
          code: problem.code,
          message: `test "${testCase?.name || index + 1}": ${problem.message}`,
        }),
      );
    });
    return warnings;
  }

  /** Every template in a definition with its JSON pointer. */
  function templates(definition) {
    const found = [];
    const add = (path, value) => {
      if (typeof value === "string") found.push({ path, template: value });
    };
    const addSet = (path, set) => {
      if (!set) return;
      add(`${path}/default`, set.default);
      Object.entries(set.bySubtype || {}).forEach(([key, value]) =>
        add(`${path}/bySubtype/${key}`, value),
      );
      (set.variants || []).forEach((variant, index) =>
        add(`${path}/variants/${index}/template`, variant.template),
      );
    };
    const addTriple = (path, triple) =>
      Object.entries(triple || {}).forEach(([key, value]) =>
        add(`${path}/${key}`, value),
      );
    Object.entries(definition.partials || {}).forEach(([name, value]) => {
      if (typeof value === "string") add(`/partials/${name}`, value);
      else
        Object.entries(value || {}).forEach(([form, text]) =>
          add(`/partials/${name}/${form}`, text),
        );
    });
    addSet("/english", definition.english);
    addSet("/autoNotes", definition.autoNotes);
    const formulaSet = definition.formulas || {};
    add("/formulas/target", formulaSet.target);
    add("/formulas/lead", formulaSet.lead);
    addTriple("/formulas/default", formulaSet.default);
    Object.entries(formulaSet.bySubtype || {}).forEach(([key, value]) =>
      addTriple(`/formulas/bySubtype/${key}`, value),
    );
    (formulaSet.notes || []).forEach((value, index) =>
      add(`/formulas/notes/${index}`, value),
    );
    (formulaSet.variants || []).forEach((variant, index) => {
      const path = `/formulas/variants/${index}`;
      add(`${path}/target`, variant.target);
      addTriple(path, {
        excel: variant.excel,
        sql: variant.sql,
        python: variant.python,
      });
      (variant.notes || []).forEach((value, noteIndex) =>
        add(`${path}/notes/${noteIndex}`, value),
      );
    });
    const addFields = (path, list) =>
      (list || []).forEach((field, index) => {
        add(`${path}/${index}/valueTemplate`, field.valueTemplate);
        add(`${path}/${index}/message`, field.message);
      });
    addFields("/fields", definition.fields);
    add("/editorFrame/heading", definition.editorFrame?.heading);
    (definition.subtypes?.options || []).forEach((option, index) =>
      addFields(`/subtypes/options/${index}/fields`, option.fields),
    );
    const addOutcomes = (path, qtest) => {
      add(`${path}/outcomes/atlas`, qtest?.outcomes?.atlas);
      add(`${path}/outcomes/source`, qtest?.outcomes?.source);
      QTEST_ACTION_TEMPLATES.forEach((key) =>
        add(`${path}/action/${key}`, qtest?.action?.[key]),
      );
    };
    addOutcomes("/export/qtest", definition.export?.qtest);
    (definition.export?.rules || []).forEach((rule, index) =>
      addOutcomes(`/export/rules/${index}/qtest`, rule.qtest),
    );
    (definition.subtypes?.options || []).forEach((option, index) =>
      addOutcomes(
        `/subtypes/options/${index}/export/qtest`,
        option.export?.qtest,
      ),
    );
    add("/outputs/assigns", definition.outputs?.assigns);
    (definition.outputs?.creates || []).forEach((value, index) =>
      add(`/outputs/creates/${index}`, value),
    );
    (definition.migrations || []).forEach((migration, index) =>
      add(`/migrations/${index}/template`, migration.template),
    );
    return found;
  }

  // ---------------------------------------------------------------------------
  // The control palette (catalogs/step-types/controls.json).
  // ---------------------------------------------------------------------------

  /** Field keys every control reads; the palette's commonProperties. */
  const ALWAYS_ALLOWED = Object.freeze(["param", "control"]);

  /**
   * What a field sets that its control does not read, and features or
   * option keys the palette does not list for that control. Empty when no
   * palette is given.
   */
  function paletteProblems(field, path, palette) {
    if (!palette || !Array.isArray(palette.controls)) return [];
    const control = palette.controls.find(
      (item) => item.name === field.control,
    );
    if (!control) return [`"${field.control}" is not in the control palette`];
    const problems = [];
    const allowed = new Set([
      ...ALWAYS_ALLOWED,
      ...(palette.commonProperties || []).map((item) => item.name),
      ...(control.properties || []),
      ...(control.internalProperties || []),
      ...(control.features?.length ? ["features"] : []),
    ]);
    Object.keys(field).forEach((key) => {
      if (!allowed.has(key))
        problems.push(`the ${control.name} control does not read "${key}"`);
    });
    // Only a feature the app editors honor can be switched. A planned one is
    // not built, so it is off everywhere and cannot be named.
    const features = new Map(
      (control.features || []).map((item) => [item.name, item]),
    );
    Object.keys(field.features || {}).forEach((name) => {
      const feature = features.get(name);
      if (!feature)
        problems.push(`the ${control.name} control has no feature "${name}"`);
      else if (feature.status === "planned")
        problems.push(
          `the ${control.name} feature "${name}" is planned and not built yet`,
        );
      else if (feature.switchable !== true)
        problems.push(
          `the ${control.name} feature "${name}" cannot be switched off yet`,
        );
    });
    if (control.optionProperties) {
      const optionKeys = new Set(control.optionProperties);
      (field.options || []).forEach((option, index) =>
        Object.keys(option).forEach((key) => {
          if (!optionKeys.has(key))
            problems.push(
              `options/${index} sets "${key}", which a choice option does not read`,
            );
        }),
      );
    }
    return problems;
  }

  // ---------------------------------------------------------------------------
  // Validation: JSON Schema first, then cross-references and templates.
  // ---------------------------------------------------------------------------

  /**
   * Returns { ok, errors: [{ path, message, code }] }.
   * Options: schema (required), helpers (names the caller supplies),
   * blocks (known block names), handlers (known migration handler names),
   * controls (field controls the caller renders), palette (the control
   * palette, which limits each field to its control's properties and
   * features), fileUtilityCompilers (the compiler names in the File
   * Utility contract, which limits export.fileUtility.compiler to them),
   * supportedSchemaVersions, renderFormulas (definition, step)
   * => formulas: when given, the result also has warnings, the
   * export shape problems of the definition's tests (exportShapeWarnings).
   */
  /** True for an action kind (kind "action"), false for a step type. */
  function isAction(definition) {
    return definition?.kind === "action";
  }

  /**
   * The keys a step type or an action kind needs or can't have, which the
   * schema can't tell apart: a step type needs english, formulas, export and
   * export.scriptRole; an action kind is action_<name>, has an english
   * partial and none of the step type keys.
   */
  function kindProblems(definition) {
    const problems = [];
    const add = (path, message, code = "schema") =>
      problems.push({ path, message, code });
    const fileUtility = definition.export?.fileUtility;
    if (!isAction(definition)) {
      ["english", "formulas", "export"].forEach((key) => {
        if (definition[key] === undefined) add(`/${key}`, "is required");
      });
      if (definition.export && definition.export.scriptRole === undefined)
        add("/export/scriptRole", "is required");
      if (fileUtility && fileUtility.compiler === undefined)
        add("/export/fileUtility/compiler", "is required");
      ["name", "complete", "picker", "editor"].forEach((key) => {
        if (definition[key] !== undefined)
          add(`/${key}`, "is only for an action kind", "definition");
      });
      if (fileUtility?.action !== undefined)
        add(
          "/export/fileUtility/action",
          "is only for an action kind; a step type names a compiler",
          "definition",
        );
      return problems;
    }
    if (definition.name === undefined) add("/name", "is required");
    else if (definition.id !== `action_${definition.name}`)
      add("/id", `must be action_${definition.name}`, "definition");
    if (typeof definition.partials?.english === "undefined")
      add("/partials/english", "is required");
    STEP_ONLY_KEYS.forEach((key) => {
      if (definition[key] !== undefined)
        add(`/${key}`, "is only for a step type", "definition");
    });
    if (definition.export?.scriptRole !== undefined)
      add("/export/scriptRole", "is only for a step type", "definition");
    if (definition.export?.rules !== undefined)
      add("/export/rules", "is only for a step type", "definition");
    if (fileUtility?.compiler !== undefined)
      add(
        "/export/fileUtility/compiler",
        "is only for a step type; an action kind names an action",
        "definition",
      );
    const choice = definition.picker?.choice;
    if (choice === definition.name)
      add("/picker/choice", "names this kind itself", "definition");
    (definition.fields || []).forEach((field, index) => {
      if (ACTION_FIELD_LIMITS.includes(field.control))
        add(
          `/fields/${index}/control`,
          `an action kind can't place ${field.control}`,
          "definition",
        );
    });
    return problems;
  }

  function validate(definition, options = {}) {
    const errors = [];
    const supported =
      options.supportedSchemaVersions || SUPPORTED_SCHEMA_VERSIONS;
    if (
      definition &&
      typeof definition === "object" &&
      definition.schemaVersion !== undefined &&
      !supported.includes(definition.schemaVersion)
    )
      return {
        ok: false,
        errors: [
          {
            path: "/schemaVersion",
            code: "unsupported_schema_version",
            message: `schema version ${definition.schemaVersion} needs a newer ATLAS Align (this one reads ${supported.join(", ")})`,
          },
        ],
      };
    if (!options.schema)
      throw new Error("validate() needs the definition schema");
    global.ATLASStepTypes.schema
      .validate(options.schema, definition)
      .forEach((error) => errors.push({ ...error, code: "schema" }));
    if (errors.length) return { ok: false, errors };
    kindProblems(definition).forEach((error) => errors.push(error));
    if (errors.length) return { ok: false, errors };

    const add = (path, message, code = "definition") =>
      errors.push({ path, message, code });
    const subtypeValues = new Set();
    const subtypes = definition.subtypes;
    if (subtypes) {
      subtypes.options.forEach((option, index) => {
        if (subtypeValues.has(option.value))
          add(
            `/subtypes/options/${index}/value`,
            `"${option.value}" is listed twice`,
          );
        subtypeValues.add(option.value);
      });
      if (
        subtypes.default !== undefined &&
        !subtypeValues.has(subtypes.default)
      )
        add(
          "/subtypes/default",
          `"${subtypes.default}" is not one of the options`,
        );
      (subtypes.hidden || []).forEach((value, index) => {
        if (!subtypeValues.has(value))
          add(
            `/subtypes/hidden/${index}`,
            `"${value}" is not one of the options`,
          );
      });
    }

    if (
      definition.block &&
      options.blocks &&
      !options.blocks.includes(definition.block)
    )
      add("/block", `unknown block "${definition.block}"`);

    const params = new Set(subtypes ? [subtypes.param] : []);
    const checkFields = (list, path) => {
      const seen = new Set();
      list.forEach((field, index) => {
        // sharesParam (internal) lets a second field show the same param in
        // another mode, as some built-in editors did.
        if (seen.has(field.param) && !field.sharesParam)
          add(
            `${path}/${index}/param`,
            `"${field.param}" is used by two fields`,
          );
        seen.add(field.param);
        params.add(field.param);
        if (options.controls && !options.controls.includes(field.control))
          add(
            `${path}/${index}/control`,
            `the "${field.control}" control is not available in this version of ATLAS Align`,
          );
        paletteProblems(field, `${path}/${index}`, options.palette).forEach(
          (message) => add(`${path}/${index}`, message),
        );
        if (field.control === "block") {
          if (!field.block)
            add(`${path}/${index}/block`, "a block field needs a block name");
          else if (options.blocks && !options.blocks.includes(field.block))
            add(`${path}/${index}/block`, `unknown block "${field.block}"`);
        }
        if (
          field.control === "choice" &&
          !field.options?.length &&
          !field.optionsFrom
        )
          add(
            `${path}/${index}`,
            "a choice field needs options or optionsFrom",
          );
        if (
          field.min !== undefined &&
          field.max !== undefined &&
          field.min > field.max
        )
          add(`${path}/${index}/min`, "min is larger than max");
      });
      return seen;
    };
    const baseParams = checkFields(definition.fields, "/fields");
    (subtypes?.options || []).forEach((option, index) => {
      const optionParams = checkFields(
        option.fields || [],
        `/subtypes/options/${index}/fields`,
      );
      optionParams.forEach((param) => {
        if (baseParams.has(param))
          add(
            `/subtypes/options/${index}/fields`,
            `"${param}" is already a base field`,
          );
      });
    });
    if (subtypes && baseParams.has(subtypes.param))
      add(
        "/subtypes/param",
        `"${subtypes.param}" is also a field; the subtype control owns it`,
      );

    const fieldEntries = [
      ...definition.fields.map((field, index) => [field, `/fields/${index}`]),
      ...(subtypes?.options || []).flatMap((option, optionIndex) =>
        (option.fields || []).map((field, index) => [
          field,
          `/subtypes/options/${optionIndex}/fields/${index}`,
        ]),
      ),
    ];
    // A composite control writes the params its palette entry lists. Without
    // a palette those are unknown, so conditions may name any param.
    const allFields = [
      ...definition.fields,
      ...(subtypes?.options || []).flatMap((option) => option.fields || []),
    ];
    let openParams = false;
    allFields.forEach((field) => {
      if (!COMPOSITE_CONTROLS.includes(field.control)) return;
      const entry = options.palette?.controls?.find(
        (item) => item.name === field.control,
      );
      if (!entry) openParams = true;
      else (entry.params || []).forEach((param) => params.add(param));
    });
    const checkConditionParams = (condition, path) => {
      conditionProblems(condition, path, errors);
      // A behavior block owns params the definition does not list.
      conditionParams(condition).forEach((param) => {
        if (!params.has(param) && !definition.block && !openParams)
          add(path, `"${param}" is not a field of this step type`);
      });
    };
    fieldEntries.forEach(([field, path]) => {
      (field.options || []).forEach((option, index) => {
        if (option.visibleWhen)
          checkConditionParams(
            option.visibleWhen,
            `${path}/options/${index}/visibleWhen`,
          );
      });
      if (field.sourceParam && !params.has(field.sourceParam))
        add(
          `${path}/sourceParam`,
          `"${field.sourceParam}" is not a field of this step type`,
        );
      if (field.visibleWhen)
        checkConditionParams(field.visibleWhen, `${path}/visibleWhen`);
      if (field.enabledWhen)
        checkConditionParams(field.enabledWhen, `${path}/enabledWhen`);
    });
    (definition.validation || []).forEach((rule, index) => {
      const path = `/validation/${index}`;
      if (!rule.require && !rule.check && !rule.builtIn)
        add(path, "a rule needs require, check or builtIn");
      if (rule.builtIn && (rule.require || rule.check))
        add(path, "a builtIn rule takes no require or check");
      if (rule.require && !params.has(rule.require))
        add(
          `${path}/require`,
          `"${rule.require}" is not a field of this step type`,
        );
      if (rule.when && rule.when !== "always")
        checkConditionParams(rule.when, `${path}/when`);
      if (rule.check) checkConditionParams(rule.check, `${path}/check`);
    });
    if (definition.inverse === true) {
      const own = capabilities(definition);
      if (!own.branches.length)
        add("/inverse", "a linked inverse needs branches");
      if (!own.storesConditions)
        add("/inverse", "a linked inverse needs a Conditions field");
    }
    const fileUtility = definition.export?.fileUtility;
    if (fileUtility) {
      if (
        fileUtility.compiler !== undefined &&
        options.fileUtilityCompilers &&
        !options.fileUtilityCompilers.includes(fileUtility.compiler)
      )
        add(
          "/export/fileUtility/compiler",
          `File Utility has no "${fileUtility.compiler}" compiler`,
        );
      if (fileUtility.status === "partial" && !fileUtility.when)
        add(
          "/export/fileUtility/when",
          "a partial step type needs when: the cases it runs in",
        );
      // A behavior block owns params the definition does not list.
      Object.entries(fileUtility.params || {}).forEach(([from, to]) => {
        if (!params.has(to) && !definition.block && !openParams)
          add(
            `/export/fileUtility/params/${from}`,
            `"${to}" is not a field of this step type`,
          );
      });
    }
    (definition.export?.rules || []).forEach((rule, index) =>
      checkConditionParams(rule.when, `/export/rules/${index}/when`),
    );
    ["english", "autoNotes", "formulas"].forEach((section) =>
      (definition[section]?.variants || []).forEach((variant, index) =>
        checkConditionParams(
          variant.when,
          `/${section}/variants/${index}/when`,
        ),
      ),
    );

    ["english", "autoNotes"].forEach((section) =>
      Object.keys(definition[section]?.bySubtype || {}).forEach((key) => {
        if (!subtypeValues.has(key))
          add(`/${section}/bySubtype/${key}`, `"${key}" is not a subtype`);
      }),
    );
    Object.keys(definition.formulas?.bySubtype || {}).forEach((key) => {
      if (!subtypeValues.has(key))
        add(`/formulas/bySubtype/${key}`, `"${key}" is not a subtype`);
    });
    // A behavior block writes its own English, so its definition may leave
    // the template blank.
    const needsEnglish =
      !isAction(definition) &&
      !definition.block &&
      !definition.english.variants?.length;
    if (needsEnglish && !definition.english.default && subtypeValues.size) {
      subtypeValues.forEach((value) => {
        if (definition.english.bySubtype?.[value] === undefined)
          add("/english", `no English for subtype "${value}" and no default`);
      });
    }
    if (needsEnglish && !definition.english.default && !subtypeValues.size)
      add("/english/default", "is required");

    (definition.migrations || []).forEach((migration, index) => {
      const path = `/migrations/${index}`;
      const need = {
        setStepType: ["to"],
        default: ["param"],
        set: ["param"],
        rename: ["from", "to"],
        remove: ["param"],
        mapValue: ["param", "map"],
        handler: ["name"],
      }[migration.op];
      need.forEach((key) => {
        if (migration[key] === undefined) add(`${path}/${key}`, "is required");
      });
      if (["default", "set"].includes(migration.op)) {
        const sources = ["value", "valueFrom", "template"].filter(
          (key) => migration[key] !== undefined,
        );
        if (sources.length !== 1)
          add(path, "needs exactly one of value, valueFrom or template");
      }
      if (
        migration.op === "rename" &&
        migration.to &&
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(migration.to)
      )
        add(`${path}/to`, "must be a parameter name");
      if (migration.op === "setStepType" && migration.to === definition.id)
        add(`${path}/to`, "points at this same step type");
      if (
        migration.op === "handler" &&
        options.handlers &&
        !options.handlers.includes(migration.name)
      )
        add(`${path}/name`, `unknown migration handler "${migration.name}"`);
      if (migration.when)
        conditionProblems(migration.when, `${path}/when`, errors);
    });
    if (
      definition.textImport?.handler &&
      options.importHandlers &&
      !options.importHandlers.includes(definition.textImport.handler)
    )
      add(
        "/textImport/handler",
        `unknown import handler "${definition.textImport.handler}"`,
      );

    if (
      definition.partials !== undefined &&
      definition.schemaVersion !== PARTIALS_SCHEMA_VERSION
    )
      add(
        "/partials",
        `partials need schemaVersion ${PARTIALS_SCHEMA_VERSION}`,
        "schema",
      );
    const templateApi = global.ATLASStepTypes.templates;
    // An action kind's partials may include the partials of the step type
    // that renders it (ACTION_HOST_PARTIALS).
    const partialNames = [
      ...Object.keys(definition.partials || {}),
      ...(isAction(definition) ? ACTION_HOST_PARTIALS : []),
    ];
    templates(definition).forEach(({ path, template: source }) => {
      // A partial can be included with any context, so its values are not
      // checked against the roots.
      const roots = path.startsWith("/partials/")
        ? null
        : path.startsWith("/export/qtest/outcomes/")
          ? [...TEMPLATE_ROOTS, ...OUTCOME_ROOTS]
          : TEMPLATE_ROOTS;
      templateApi
        .check(source, {
          helpers: options.helpers || [],
          partials: partialNames,
          partialHashes: PARTIAL_HASHES,
          ...(roots ? { roots } : {}),
        })
        .forEach((problem) =>
          errors.push({
            path,
            code: "template",
            message: `${problem.message} (line ${problem.line}, column ${problem.column})`,
            line: problem.line,
            column: problem.column,
          }),
        );
    });

    const aliases = definition.aliases || {};
    if ((aliases.step_type || []).includes(definition.id))
      add("/aliases/step_type", "lists the step type's own id");
    if (typeof options.renderFormulas === "function")
      return {
        ok: errors.length === 0,
        errors,
        warnings: errors.length
          ? []
          : exportShapeWarnings(definition, options.renderFormulas),
      };
    return { ok: errors.length === 0, errors };
  }

  const api = Object.freeze({
    SUPPORTED_SCHEMA_VERSIONS,
    PARTIALS_SCHEMA_VERSION,
    TEMPLATE_ROOTS,
    QTEST_ACTION_TEMPLATES,
    QTEST_ACTION_KINDS,
    ACTION_HOST_PARTIALS,
    isAction,
    matches,
    isBlank,
    subtypeOf,
    subtypeOption,
    template,
    formulas,
    formulaSet,
    variantFor,
    paletteProblems,
    fields,
    exportFor,
    fileUtilityFor,
    capabilities,
    LEGACY_CAPABILITIES,
    ROW_TEST_ROLES,
    exportShapeProblems,
    exportShapeWarnings,
    templates,
    validate,
  });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.definitions = api;
})(typeof window !== "undefined" ? window : globalThis);
