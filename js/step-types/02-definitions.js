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

  const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1]);
  const TEMPLATE_ROOTS = Object.freeze([
    "param",
    "subtype",
    "stepNumber",
    "parent",
    "step",
    "format",
  ]);
  const SUBJECT_KEYS = ["param", "stepField"];
  const TEST_KEYS = ["equals", "notEquals", "in", "blank", "notBlank"];
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
          "needs exactly one of equals, notEquals, in, blank or notBlank",
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

  /** english/autoNotes template for a subtype, falling back to `default`. */
  function template(definition, section, subtype = "") {
    const set = definition?.[section];
    if (!set) return null;
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
    };
    const addTriple = (path, triple) =>
      Object.entries(triple || {}).forEach(([key, value]) =>
        add(`${path}/${key}`, value),
      );
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
    const addFields = (path, list) =>
      (list || []).forEach((field, index) =>
        add(`${path}/${index}/valueTemplate`, field.valueTemplate),
      );
    addFields("/fields", definition.fields);
    (definition.subtypes?.options || []).forEach((option, index) =>
      addFields(`/subtypes/options/${index}/fields`, option.fields),
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
  // Validation: JSON Schema first, then cross-references and templates.
  // ---------------------------------------------------------------------------

  /**
   * Returns { ok, errors: [{ path, message, code }] }.
   * Options: schema (required), helpers (names the caller supplies),
   * blocks (known block names), handlers (known migration handler names),
   * supportedSchemaVersions.
   */
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
        if (seen.has(field.param))
          add(
            `${path}/${index}/param`,
            `"${field.param}" is used by two fields`,
          );
        seen.add(field.param);
        params.add(field.param);
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
    const checkConditionParams = (condition, path) => {
      conditionProblems(condition, path, errors);
      conditionParams(condition).forEach((param) => {
        if (!params.has(param))
          add(path, `"${param}" is not a field of this step type`);
      });
    };
    fieldEntries.forEach(([field, path]) => {
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
      if (!rule.require && !rule.check)
        add(path, "a rule needs require or check");
      if (rule.require && !params.has(rule.require))
        add(
          `${path}/require`,
          `"${rule.require}" is not a field of this step type`,
        );
      if (rule.when && rule.when !== "always")
        checkConditionParams(rule.when, `${path}/when`);
      if (rule.check) checkConditionParams(rule.check, `${path}/check`);
    });
    (definition.export.rules || []).forEach((rule, index) =>
      checkConditionParams(rule.when, `/export/rules/${index}/when`),
    );

    ["english", "autoNotes"].forEach((section) =>
      Object.keys(definition[section]?.bySubtype || {}).forEach((key) => {
        if (!subtypeValues.has(key))
          add(`/${section}/bySubtype/${key}`, `"${key}" is not a subtype`);
      }),
    );
    Object.keys(definition.formulas.bySubtype || {}).forEach((key) => {
      if (!subtypeValues.has(key))
        add(`/formulas/bySubtype/${key}`, `"${key}" is not a subtype`);
    });
    // A behavior block writes its own English, so its definition may leave
    // the template blank.
    const needsEnglish = !definition.block;
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

    const templateApi = global.ATLASStepTypes.templates;
    templates(definition).forEach(({ path, template: source }) => {
      templateApi
        .check(source, {
          helpers: options.helpers || [],
          roots: TEMPLATE_ROOTS,
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
    return { ok: errors.length === 0, errors };
  }

  const api = Object.freeze({
    SUPPORTED_SCHEMA_VERSIONS,
    TEMPLATE_ROOTS,
    matches,
    isBlank,
    subtypeOf,
    subtypeOption,
    template,
    formulas,
    fields,
    exportFor,
    templates,
    validate,
  });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.definitions = api;
})(typeof window !== "undefined" ? window : globalThis);
