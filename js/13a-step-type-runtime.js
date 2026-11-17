/**
 * 13a-step-type-runtime.js
 *
 * Connects the step type engine (js/step-types/) to ATLAS Align. Every owner
 * of step type behavior asks this module first and keeps its own code as the
 * fallback:
 *
 *   normalizeCatalogStep    normalize(step, index)    migrations and defaults
 *   legacyTypeFromStepType  definitionById(id)        legacy `type` name
 *   analystLogic            english(step)             English sentence
 *   noteText                autoNotes(step)           automatic notes
 *   atlasDeveloperFormulas  formulas(step)            Excel / SQL / Python
 *   12b code export         scriptRole(step)          SQL and Python script place
 *   qTest export            qtest(step)               section and test type
 *                           qtestAction(step)         outcome the row tests
 *                           qtestOutcomes(step, ctx)  expected outcomes
 *   atlasCreatedColumnNames createdColumns(step)      new output columns
 *   renderGuidedBuilder     renderEditor(step)        editor form
 *   text import             parseText(text)           sentence to step
 *   Audit Issues            validate(step)            validation rules
 *                           builtInChecks(step)       built-in checks it uses
 *   STEP_TYPE_OPTIONS and import titles: typeOptions() and onChange().
 *
 * Each call returns null when no definition claims the step, so a step type
 * that has not moved into a definition behaves exactly as before. Templates
 * are rendered by the engine's own interpreter; nothing here runs definition
 * text as code or inserts it as markup without escaping.
 *
 * Template helpers (all formats): field source name alias=x, column name,
 * quote value, number value, alias source [alias], source source,
 * placeholder key fallback, plus the helpers, migration handlers and editor
 * blocks of js/13-step-type-library.js.
 *
 * A definition that names a behavior `block` gets each part the block has
 * (normalize, editor, english, notes, formulas, createdColumns, qtestAction,
 * qtestOutcomes) from that
 * block, which calls the app's own code; its templates cover the rest. The
 * types that came with ATLAS Align use these blocks so their output does not
 * change.
 *
 * Definitions come from js/step-types/definitions.generated.js (written by
 * `npm run step-types:manifest` from catalogs/step-types/), so the registry is
 * ready as soon as this file runs. load() can replace it from the server.
 */
(function initializeStepTypeRuntime(global) {
  "use strict";

  const DIALECTS = ["excel", "sql", "python"];

  const library = global.ATLASStepTypeLibrary || {};
  const HANDLERS = Object.freeze({ ...(library.handlers || {}) });
  const BLOCKS = Object.freeze({ ...(library.blocks || {}) });

  let registry = null;
  let readyPromise = null;
  const listeners = [];

  const engine = () => global.ATLASStepTypes || null;
  const isBlank = (value) =>
    value == null || (typeof value === "string" && value.trim() === "");
  const text = (value) => (value == null ? "" : String(value));

  /** An app function when it is loaded, so partial test loads still work. */
  function app(name) {
    const fn = global[name];
    return typeof fn === "function" ? fn : null;
  }

  function escapeHtml(value) {
    const esc = app("esc");
    if (esc) return esc(value);
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------------------------------------------------------------------------
  // Registry.
  // ---------------------------------------------------------------------------

  function notify() {
    listeners.forEach((listener) => {
      try {
        listener(registry);
      } catch (error) {
        global.console?.warn?.("A step type listener failed.", error);
      }
    });
  }

  /** Replaces the registry (used by the loader and by tests) and notifies. */
  function useRegistry(next) {
    registry = next || null;
    notify();
    return registry;
  }

  /** Calls `listener(registry)` now and after every registry change. */
  function onChange(listener) {
    if (typeof listener !== "function") return;
    listeners.push(listener);
    try {
      listener(registry);
    } catch (error) {
      global.console?.warn?.("A step type listener failed.", error);
    }
  }

  /**
   * Loads definitions from catalogs/step-types/. A failed load keeps every
   * step type on its built-in code and reports why in the console.
   */
  function load(options = {}) {
    const loader = engine()?.registry?.loadFromRepository;
    if (!loader) return Promise.resolve(null);
    readyPromise = loader({ ...registryOptions(), ...options })
      .then((loaded) => {
        useRegistry(loaded);
        const rejected = loaded.rejected?.() || [];
        if (rejected.length)
          global.console?.warn?.(
            `${rejected.length} step type definition(s) were not loaded. Fix them in the builder and publish again.`,
            rejected,
          );
        return loaded;
      })
      .catch((error) => {
        global.console?.warn?.(
          "Step type definitions could not be loaded, so the built-in step types are used. Reload the page to try again.",
          error,
        );
        return null;
      });
    return readyPromise;
  }

  /** Names the registry checks definitions against. */
  function registryOptions() {
    return {
      helpers: [...HELPER_NAMES],
      blocks: Object.keys(BLOCKS),
      handlers: Object.keys(HANDLERS),
    };
  }

  /**
   * Builds the registry from the bundled repository definitions. Returns null
   * when the bundle or the engine is missing.
   */
  function loadBundled(bundle = engine()?.bundled) {
    const create = engine()?.registry?.createRegistry;
    if (!create || !bundle?.schema || !Array.isArray(bundle.definitions))
      return null;
    try {
      const loaded = create({ ...registryOptions(), schema: bundle.schema });
      bundle.definitions.forEach((definition) =>
        loaded.add(definition, { origin: "repository" }),
      );
      const rejected = loaded.rejected();
      if (rejected.length)
        global.console?.warn?.(
          `${rejected.length} step type definition(s) were not loaded. Fix them in the builder and publish again.`,
          rejected,
        );
      useRegistry(loaded);
      readyPromise = Promise.resolve(loaded);
      return loaded;
    } catch (error) {
      global.console?.warn?.(
        "Step type definitions could not be loaded, so the built-in step types are used. Reload the page to try again.",
        error,
      );
      return null;
    }
  }

  function definitionById(id) {
    if (!registry || isBlank(id)) return null;
    return registry.resolve(String(id)) || null;
  }

  /**
   * A part (normalize, editor, english, notes, formulas, createdColumns) of
   * the definition's behavior block, or null when the block has no such part.
   */
  function blockPart(definition, part) {
    const fn = definition?.block ? BLOCKS[definition.block]?.[part] : null;
    return typeof fn === "function" ? fn : null;
  }

  /** The definition a step belongs to, or null for built-in code. */
  function definitionFor(step) {
    if (!registry || !step) return null;
    return (
      registry.resolve(
        isBlank(step.step_type) ? undefined : String(step.step_type),
        isBlank(step.type) ? undefined : String(step.type),
      ) || null
    );
  }

  // ---------------------------------------------------------------------------
  // Template helpers and data.
  // ---------------------------------------------------------------------------

  function placeholder(key, fallback) {
    const fromCatalog = app("phrasePlaceholder");
    return fromCatalog ? fromCatalog(key, fallback) : fallback;
  }

  function sqlName(name) {
    const appName = app("atlasDevSqlName");
    return appName ? appName(name) : `[${text(name).replace(/]/g, "]]")}]`;
  }

  function pyString(value) {
    const appString = app("atlasDevPyString");
    return appString ? appString(value) : JSON.stringify(text(value));
  }

  function aliasFor(source, alias = "") {
    const appAlias = app("atlasDevSourceAlias");
    return appAlias
      ? appAlias(text(source), text(alias))
      : text(alias).trim() || text(source).trim();
  }

  function quoted(value, format) {
    if (format === "excel") return `"${text(value).replace(/"/g, '""')}"`;
    if (format === "sql") return `'${text(value).replace(/'/g, "''")}'`;
    if (format === "python") return pyString(value);
    if (format === "english") {
      const phrase = app("quotePhraseValue");
      return phrase ? phrase(value) : `"${text(value).trim()}"`;
    }
    return text(value);
  }

  const TEMPLATE_HELPERS = Object.freeze({
    /** A source column: file "wd" column "Name" / [@[Name]] / [Name] / df["Name"]. */
    field(args, hash, { format }) {
      const [source, name] = args;
      const fieldName = text(name).trim();
      const sourceAlias = text(hash.alias).trim();
      if (format === "english") {
        if (!fieldName) return placeholder("field", "[field]");
        const plain = app("tableColumnPlain");
        return plain
          ? plain(text(source), sourceAlias, fieldName)
          : `column "${fieldName}"`;
      }
      if (DIALECTS.includes(format)) {
        const devField = app("atlasDevField");
        if (devField)
          return devField(
            { sourceFile: text(source).trim(), sourceAlias, fieldName },
            format,
          );
        return fieldName
          ? format === "sql"
            ? sqlName(fieldName)
            : format === "python"
              ? `df[${pyString(fieldName)}]`
              : `[@[${fieldName}]]`
          : "[field]";
      }
      return fieldName;
    },
    /** A column the step makes or reads by name alone. */
    column(args, _hash, { format }) {
      const name = text(args[0]).trim();
      if (!name)
        return format === "english" || DIALECTS.includes(format)
          ? placeholder("column_name", "[column name]")
          : "";
      if (format === "english") return `column ${quoted(name, "english")}`;
      if (format === "excel")
        return `[@[${name.replace(/(['[\]#])/g, "'$1")}]]`;
      if (format === "sql") return sqlName(name);
      if (format === "python") return `df[${pyString(name)}]`;
      return name;
    },
    /** A text literal in the current format. */
    quote(args, _hash, { format }) {
      return quoted(args[0], format);
    },
    /** A number literal without leading zeros. */
    number(args) {
      const raw = text(args[0]).trim();
      const value = Number(raw);
      return raw && Number.isFinite(value) ? String(value) : raw;
    },
    /** The alias of a source file: the given alias, else the audit's. */
    alias(args) {
      return aliasFor(args[0], args[1]);
    },
    /** A whole source table: "wd" / wd / [wd] / sources["wd"]. */
    source(args, _hash, { format }) {
      const alias = aliasFor(args[0]);
      if (format === "sql") {
        const appSource = app("atlasDevSqlSource");
        return appSource
          ? appSource(alias)
          : alias
            ? sqlName(alias)
            : "[source]";
      }
      if (format === "python") {
        const appSource = app("atlasDevPySource");
        return appSource ? appSource(alias) : `sources[${pyString(alias)}]`;
      }
      if (format === "excel") {
        const appTable = app("atlasDevExcelTable");
        return appTable ? appTable(alias) : alias;
      }
      if (format === "english") return quoted(alias, "english");
      return alias;
    },
    /** A catalog placeholder such as [field]. */
    placeholder(args) {
      return placeholder(text(args[0]), text(args[1] ?? `[${text(args[0])}]`));
    },
    ...(library.helpers || {}),
  });
  const HELPER_NAMES = Object.freeze(Object.keys(TEMPLATE_HELPERS));

  function stepNumberFor(step) {
    const number = app("atlasDevStepNumber");
    if (!number || !step?.id) return "";
    try {
      return text(number(step.id));
    } catch (_error) {
      return "";
    }
  }

  function parentFor(step) {
    const steps = app("atlasDevSteps")?.() || [];
    const parent = step?.parentId
      ? steps.find((item) => item.id === step.parentId)
      : null;
    return parent
      ? {
          id: parent.id,
          title: parent.title,
          step_type: parent.step_type,
          params: { ...(parent.params || {}) },
        }
      : null;
  }

  function templateData(step, definition, format) {
    return {
      param: { ...(step.params || {}) },
      subtype: engine().definitions.subtypeOf(definition, step),
      stepNumber: stepNumberFor(step),
      parent: parentFor(step),
      step: {
        id: step.id,
        title: step.title,
        source: step.source,
        field: step.field,
        notes: step.notes,
        type: step.type,
        step_type: step.step_type,
      },
      format,
    };
  }

  function render(template, step, definition, format) {
    if (typeof template !== "string") return null;
    return engine().templates.render(
      template,
      templateData(step, definition, format),
      { helpers: TEMPLATE_HELPERS, format },
    );
  }

  /** A sentence that says which template failed and what to do about it. */
  function renderFailure(definition, part, error) {
    return `[${definition.label} ${part} could not be built: ${error?.message || error}. Fix the definition in the step type builder.]`;
  }

  // ---------------------------------------------------------------------------
  // Normalization.
  // ---------------------------------------------------------------------------

  function writeParams(step, next) {
    step.params =
      step.params &&
      typeof step.params === "object" &&
      !Array.isArray(step.params)
        ? step.params
        : {};
    Object.keys(step.params).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(next, key))
        delete step.params[key];
    });
    Object.assign(step.params, next);
  }

  /**
   * Brings a saved step up to its definition: aliases, migrations, the
   * subtype default and field defaults. Returns false when no definition
   * claims the step, so the caller runs its built-in normalization.
   */
  function normalize(step, index = 0) {
    const definition = definitionFor(step);
    if (!definition) return false;
    const { migrateStep } = engine().migrations;
    const definitions = engine().definitions;
    const result = migrateStep(step, registry, {
      helpers: TEMPLATE_HELPERS,
      handlers: HANDLERS,
    });
    const current = result.definition || definition;
    step.step_type = current.id;
    step.type = current.legacyType || result.step.type || "transform";
    writeParams(step, result.step.params || {});
    const subtypes = current.subtypes;
    if (subtypes && isBlank(step.params[subtypes.param]))
      step.params[subtypes.param] = definitions.subtypeOf(current, step);
    definitions
      .fields(current, definitions.subtypeOf(current, step))
      .forEach((field) => {
        if (field.default !== undefined && isBlank(step.params[field.param]))
          step.params[field.param] =
            field.default === null ? "" : String(field.default);
      });
    // A behavior block finishes on the real step, so rewrites that keep state
    // on the step itself (condition mirrors, created fields) still happen.
    blockPart(current, "normalize")?.(step, index);
    if (!step.id) step.id = app("uid")?.("step") || `step_${Date.now()}`;
    step.sortOrder = Number.isFinite(Number(step.sortOrder))
      ? step.sortOrder
      : index + 1;
    // Legacy types are not in the step type picker, so they keep the generic
    // title built-in steps get.
    if (!step.title)
      step.title = current.status === "legacy" ? "Logic Step" : current.label;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Text outputs.
  // ---------------------------------------------------------------------------

  function english(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const fromBlock = blockPart(definition, "english");
    if (fromBlock) return text(fromBlock(step));
    const { definitions } = engine();
    const template = definitions.template(
      definition,
      "english",
      definitions.subtypeOf(definition, step),
    );
    if (template == null) return "";
    try {
      return render(template, step, definition, "english");
    } catch (error) {
      return renderFailure(definition, "English", error);
    }
  }

  /** Automatic notes, or null to keep the built-in notes. */
  function autoNotes(step) {
    const definition = definitionFor(step);
    const fromBlock = blockPart(definition, "notes");
    if (fromBlock) return text(fromBlock(step));
    if (!definition?.autoNotes) return null;
    const { definitions } = engine();
    const template = definitions.template(
      definition,
      "autoNotes",
      definitions.subtypeOf(definition, step),
    );
    if (template == null) return null;
    try {
      return render(template, step, definition, "english");
    } catch (error) {
      return renderFailure(definition, "notes", error);
    }
  }

  /** Drops one pair of parentheses around a whole expression. */
  function unwrap(expression) {
    const appUnwrap = app("atlasDevUnwrap");
    return appUnwrap ? appUnwrap(expression) : expression;
  }

  function wrapFormula(shape, dialect, rendered, target) {
    if (!rendered) return "";
    if (shape === "assignment") {
      const expression = unwrap(rendered);
      const column = target || placeholder("column_name", "[column name]");
      if (dialect === "excel") return `=${expression}`;
      if (dialect === "sql") return `${expression} AS ${sqlName(column)}`;
      return `df[${pyString(column)}] = ${expression}`;
    }
    if (shape === "filter") {
      if (dialect === "excel") return `=${rendered}`;
      if (dialect === "sql") return `WHERE ${rendered}`;
      return `mask = ${rendered}\ndf = df[mask]`;
    }
    return rendered;
  }

  /**
   * { lead, excel, sql, python, notes } in the shape the code export and
   * Developer Logic expect, or null to keep the built-in formulas.
   */
  function formulas(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const fromBlock = blockPart(definition, "formulas");
    if (fromBlock) return fromBlock(step) || null;
    const { definitions } = engine();
    const set = definition.formulas || { shape: "none" };
    const subtype = definitions.subtypeOf(definition, step);
    const result = {};
    let notes = [];
    try {
      const lead = render(set.lead, step, definition, "english");
      if (lead) result.lead = lead;
      if (set.shape !== "none") {
        const target = text(
          render(set.target, step, definition, "plain"),
        ).trim();
        const triple = definitions.formulas(definition, subtype);
        DIALECTS.forEach((dialect) => {
          const expression = text(
            render(triple[dialect], step, definition, dialect),
          ).trim();
          const code = wrapFormula(set.shape, dialect, expression, target);
          if (code) result[dialect] = code;
        });
      }
      notes = (set.notes || [])
        .map((template) =>
          text(render(template, step, definition, "english")).trim(),
        )
        .filter(Boolean);
    } catch (error) {
      return {
        lead: renderFailure(definition, "Developer Logic", error),
        notes: [],
      };
    }
    const complete = DIALECTS.every((dialect) => result[dialect]);
    result.notes = complete
      ? notes
      : [...notes, ...(set.fallback?.notes || [])];
    return result;
  }

  /** Columns the step adds to the data, or null for built-in code. */
  function createdColumns(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const fromBlock = blockPart(definition, "createdColumns");
    if (fromBlock) return [...new Set((fromBlock(step) || []).filter(Boolean))];
    const names = (definition.outputs?.creates || []).map((template) => {
      try {
        return text(render(template, step, definition, "plain")).trim();
      } catch (_error) {
        return "";
      }
    });
    return [...new Set(names.filter(Boolean))];
  }

  // ---------------------------------------------------------------------------
  // Export.
  // ---------------------------------------------------------------------------

  function exportSettings(step) {
    const definition = definitionFor(step);
    return definition ? engine().definitions.exportFor(definition, step) : null;
  }

  function scriptRole(step) {
    return exportSettings(step)?.scriptRole || null;
  }

  /** The qTest section and test type: { section, testType }. */
  function qtest(step) {
    const settings = exportSettings(step);
    if (!settings) return null;
    const { outcomes: _outcomes, ...placement } = settings.qtest || {};
    return placement;
  }

  /**
   * The outcome qTest tests ({ kind, ... }) from the definition's behavior
   * block, or null so the step counts as having no action of its own.
   */
  function qtestAction(step) {
    const fromBlock = blockPart(definitionFor(step), "qtestAction");
    return fromBlock ? fromBlock(step) || null : null;
  }

  /**
   * The two expected outcomes on the qTest row: [ATLAS outcome, source data
   * outcome]. A behavior block answers first, then `export.qtest.outcomes`.
   * Null when neither is set, so the outcome comes from the step's action.
   * `context.record` names the audit record ("Payroll audit record").
   */
  function qtestOutcomes(step, context = {}) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const fromBlock = blockPart(definition, "qtestOutcomes");
    if (fromBlock) {
      const found = fromBlock(step, context);
      return Array.isArray(found) ? found.map(text) : null;
    }
    const outcomes = exportSettings(step)?.qtest?.outcomes;
    if (!outcomes) return null;
    try {
      return [
        render(outcomes.atlas, step, definition, "english"),
        render(outcomes.source, step, definition, "english"),
      ].map((value) => text(value).trim());
    } catch (error) {
      const failure = renderFailure(definition, "qTest outcome", error);
      return [failure, failure];
    }
  }

  // ---------------------------------------------------------------------------
  // Picker lists.
  // ---------------------------------------------------------------------------

  /** Active definitions for the step type picker, in builder order. */
  function typeOptions() {
    if (!registry) return [];
    return registry.list().map((definition) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description || "",
      order: Number.isInteger(definition.order) ? definition.order : 1000,
      category: definition.category || "",
    }));
  }

  /**
   * Merges built-in [value, label, order] entries with the registry. A
   * definition with a built-in id takes its label and position. A built-in
   * without an order gets 10, 20, 30... by position.
   */
  function mergeTypeOptions(builtIns = []) {
    const merged = new Map();
    builtIns.forEach(([value, label, order], index) =>
      merged.set(value, {
        value,
        label,
        order: Number.isFinite(order) ? order : (index + 1) * 10,
        index,
      }),
    );
    typeOptions().forEach((option, index) =>
      merged.set(option.id, {
        value: option.id,
        label: option.label,
        order: option.order,
        index: builtIns.length + index,
      }),
    );
    return [...merged.values()]
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map(({ value, label }) => [value, label]);
  }

  /** { id: label } for every definition, legacy ones included. */
  function importTitles() {
    if (!registry) return {};
    return Object.fromEntries(
      registry
        .list({ includeLegacy: true })
        .map((definition) => [definition.id, definition.label]),
    );
  }

  // ---------------------------------------------------------------------------
  // Text import: a sentence written by the English template.
  // ---------------------------------------------------------------------------

  const QUOTED = '"([^"]*)"';
  const regexEscape = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  function paramOf(node) {
    return node?.type === "path" &&
      node.path.length === 2 &&
      node.path[0] === "param"
      ? node.path[1]
      : null;
  }

  /**
   * A matcher for templates made of text and simple value outputs. Returns
   * null for templates with blocks or other helpers; those types need a
   * textImport handler instead.
   */
  function sentenceMatcher(template) {
    let tree;
    try {
      tree = engine().templates.parse(template);
    } catch (_error) {
      return null;
    }
    const captures = [];
    let pattern = "";
    for (const node of tree.children) {
      if (node.type === "text") {
        pattern += regexEscape(node.value);
        continue;
      }
      if (node.type !== "output") return null;
      const value = node.value;
      const direct = paramOf(value);
      if (direct) {
        captures.push({ kind: "text", param: direct });
        pattern += "(.+?)";
        continue;
      }
      if (value?.type !== "call") return null;
      const params = value.args.map(paramOf);
      if (params.some((param) => !param)) return null;
      if (["quote", "column"].includes(value.name) && params.length === 1) {
        captures.push({ kind: "text", param: params[0] });
        pattern += value.name === "column" ? `column\\s+${QUOTED}` : QUOTED;
      } else if (value.name === "number" && params.length === 1) {
        captures.push({ kind: "text", param: params[0] });
        pattern += "(-?\\d+(?:\\.\\d+)?)";
      } else if (value.name === "field" && params.length === 2) {
        captures.push({ kind: "source", param: params[0] });
        captures.push({
          kind: "field",
          param: params[1],
          sourceParam: params[0],
        });
        pattern += `file\\s+${QUOTED}\\s+column\\s+${QUOTED}`;
      } else if (value.name === "source" && params.length === 1) {
        captures.push({ kind: "source", param: params[0] });
        pattern += QUOTED;
      } else return null;
    }
    const trimmed = pattern.replace(/(\\\.)+$/, "").replace(/(\\s\+)+$/, "");
    return { regex: new RegExp(`^${trimmed}\\.?$`, "i"), captures };
  }

  /**
   * Reads a sentence written by a definition's English template. Returns
   * { stepType, title, params, captures: [{ kind, param, label, value, sourceParam }] }
   * or null when no importable definition matches.
   */
  function parseText(sentence) {
    if (!registry) return null;
    const value = text(sentence).trim();
    if (!value) return null;
    for (const definition of registry.list({ includeLegacy: true })) {
      if (definition.textImport?.fromEnglish !== true) continue;
      const candidates = [];
      const subtypes = definition.subtypes;
      if (subtypes)
        subtypes.options.forEach((option) => {
          const template = engine().definitions.template(
            definition,
            "english",
            option.value,
          );
          if (template != null)
            candidates.push({ subtype: option.value, template });
        });
      else if (definition.english?.default != null)
        candidates.push({ subtype: "", template: definition.english.default });
      for (const candidate of candidates) {
        const matcher = sentenceMatcher(candidate.template);
        const match = matcher?.regex.exec(value);
        if (!match) continue;
        const params = {};
        if (subtypes && candidate.subtype)
          params[subtypes.param] = candidate.subtype;
        const labels = new Map(
          engine()
            .definitions.fields(definition, candidate.subtype)
            .map((field) => [field.param, field.label || field.param]),
        );
        const captures = matcher.captures.map((capture, index) => ({
          ...capture,
          label: labels.get(capture.param) || capture.param,
          value: match[index + 1] ?? "",
        }));
        captures.forEach((capture) => {
          params[capture.param] = capture.value.trim();
        });
        return {
          stepType: definition.id,
          title: definition.label,
          params,
          captures,
        };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Editor.
  // ---------------------------------------------------------------------------

  function optionTriples(options = []) {
    return options.map((option) => [
      option.value,
      option.label,
      option.description || "",
    ]);
  }

  function labelText(field) {
    return field.label || field.param;
  }

  function helpHtml(field) {
    return field.help
      ? `<small class="hint">${escapeHtml(field.help)}</small>`
      : "";
  }

  function choiceHtml({
    param,
    label,
    heading,
    popover,
    options,
    selected,
    display,
    disabled,
  }) {
    const choice = app("atlasChoiceControl");
    const attributes = `data-param="${escapeHtml(param)}"${disabled ? " disabled" : ""}`;
    if (choice)
      return `<div class="atlas-choice-field">${choice({
        options: optionTriples(options),
        selected,
        variant: display || "segment",
        label,
        attributes,
        ...(heading ? { heading } : {}),
        ...(popover ? { popover } : {}),
      })}</div>`;
    return `<label>${escapeHtml(label)}<select ${attributes}>${options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
      )
      .join("")}</select></label>`;
  }

  /** The parameter's value, or the field's valueTemplate while it is blank. */
  function shownValue(field, step, definition) {
    const value = text(step.params?.[field.param]);
    if (value || !field.valueTemplate) return value;
    try {
      return text(render(field.valueTemplate, step, definition, "plain"));
    } catch (_error) {
      return value;
    }
  }

  function blockHtml(field, step) {
    const html = BLOCKS[field.block]?.editor?.(step, field);
    if (typeof html === "string") return html;
    return `<p class="hint">The "${escapeHtml(field.block || "")}" editor block is not available in this version of ATLAS Align. Update ATLAS Align or remove the block in the step type builder.</p>`;
  }

  function fieldHtml(field, step, definition) {
    const { matches } = engine().definitions;
    const params = step.params || {};
    if (field.visibleWhen && !matches(field.visibleWhen, step)) return "";
    const disabled = field.enabledWhen && !matches(field.enabledWhen, step);
    const value = shownValue(field, step, definition);
    const label = labelText(field);
    const required = field.required ? ' aria-required="true"' : "";
    const off = disabled ? " disabled" : "";
    const bind = `data-param="${escapeHtml(field.param)}"`;
    const placeholderText = field.placeholder
      ? ` placeholder="${escapeHtml(field.placeholder)}"`
      : "";
    switch (field.control) {
      case "source_picker": {
        const picker = app("sourceInputFromOptions");
        const input = picker
          ? picker({
              name: field.param,
              value,
              placeholder: field.placeholder || "Select source file",
            })
          : `<input ${bind} value="${escapeHtml(value)}"${placeholderText}${required}${off}>`;
        return `<label>${escapeHtml(label)}${input}${helpHtml(field)}</label>`;
      }
      case "field_picker": {
        const picker = app("fieldInputFromOptions");
        const input = picker
          ? picker({
              name: field.param,
              value,
              placeholder: field.placeholder || "Select field",
              sourceFile: field.sourceParam
                ? text(params[field.sourceParam])
                : "",
            })
          : `<input ${bind} value="${escapeHtml(value)}"${placeholderText}${required}${off}>`;
        return `<label>${escapeHtml(label)}${input}${helpHtml(field)}</label>`;
      }
      case "choice":
        return `${choiceHtml({
          param: field.param,
          label,
          heading: field.heading,
          popover: field.popover,
          options: field.options || [],
          selected: value || text(field.default),
          display: field.display,
          disabled,
        })}${helpHtml(field)}`;
      case "textarea":
        return `<label>${escapeHtml(label)}<textarea ${bind}${placeholderText}${required}${off}>${escapeHtml(value)}</textarea>${helpHtml(field)}</label>`;
      case "whole_number": {
        const min = Number.isInteger(field.min) ? ` min="${field.min}"` : "";
        const max = Number.isInteger(field.max) ? ` max="${field.max}"` : "";
        return `<label>${escapeHtml(label)}<input type="number" inputmode="numeric" step="1"${min}${max} ${bind} value="${escapeHtml(value)}"${placeholderText}${required}${off}>${helpHtml(field)}</label>`;
      }
      case "toggle":
        return `<label class="step-type-toggle"><input type="checkbox" ${bind}${value === "Yes" ? " checked" : ""}${off}> ${escapeHtml(label)}${helpHtml(field)}</label>`;
      case "hidden":
        return `<input type="hidden" ${bind} value="${escapeHtml(value)}">`;
      case "hint":
        return `<p class="hint">${escapeHtml(field.help || field.label || "")}</p>`;
      case "block":
        return blockHtml(field, step);
      default:
        return `<label>${escapeHtml(label)}<input ${bind} value="${escapeHtml(value)}"${placeholderText}${required}${off}>${helpHtml(field)}</label>`;
    }
  }

  /** The editor form for a step, or null for built-in editors. */
  function renderEditor(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const fromBlock = blockPart(definition, "editor");
    if (fromBlock) {
      const html = fromBlock(step);
      if (typeof html === "string") return html;
      return `<p class="hint">The "${escapeHtml(definition.block)}" editor block is not available in this version of ATLAS Align. Update ATLAS Align or pick another block in the step type builder.</p>`;
    }
    const { definitions } = engine();
    const subtype = definitions.subtypeOf(definition, step);
    const parts = [];
    const subtypes = definition.subtypes;
    if (subtypes)
      parts.push(
        choiceHtml({
          param: subtypes.param,
          label: subtypes.label || "Type",
          options: subtypes.options.filter(
            (option) =>
              !(subtypes.hidden || []).includes(option.value) ||
              option.value === subtype,
          ),
          selected: subtype,
          display: subtypes.control === "list" ? "cards" : subtypes.control,
        }),
      );
    definitions
      .fields(definition, subtype)
      .forEach((field) => parts.push(fieldHtml(field, step, definition)));
    // The same markup as the built-in editors, so the look does not change.
    return `<div class="selected-source-only-builder"><div class="guided-builder"><h4>${escapeHtml(definition.label)}</h4>${parts.join("")}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Validation.
  // ---------------------------------------------------------------------------

  /**
   * Issues from the definition's validation rules and required fields:
   * [{ id, severity, title, message, param, label }]. Null when no definition
   * claims the step.
   */
  /**
   * The Audit Issues checks a step type turns on with `builtIn` rules, for
   * this step: ["conditions", "action", ...]. Null when no definition claims
   * the step.
   */
  function builtInChecks(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const { definitions } = engine();
    return (definition.validation || [])
      .filter(
        (rule) =>
          rule.builtIn &&
          (!rule.when ||
            rule.when === "always" ||
            definitions.matches(rule.when, step)),
      )
      .map((rule) => rule.builtIn);
  }

  function validate(step) {
    const definition = definitionFor(step);
    if (!definition) return null;
    const { definitions } = engine();
    const params = step.params || {};
    const issues = [];
    const subtype = definitions.subtypeOf(definition, step);
    definitions.fields(definition, subtype).forEach((field) => {
      if (!field.required) return;
      if (field.visibleWhen && !definitions.matches(field.visibleWhen, step))
        return;
      if (isBlank(params[field.param]))
        issues.push({
          id: `required-${field.param}`,
          severity: "warning",
          param: field.param,
          label: labelText(field),
          title: `${definition.label} step needs attention`,
          message: `${definition.label}: ${labelText(field)} is required. Fill it in on the step.`,
        });
    });
    (definition.validation || []).forEach((rule, index) => {
      if (rule.builtIn) return;
      if (
        rule.when &&
        rule.when !== "always" &&
        !definitions.matches(rule.when, step)
      )
        return;
      const missing = rule.require && isBlank(params[rule.require]);
      const failed = rule.check && !definitions.matches(rule.check, step);
      if (missing || failed) {
        const field = rule.require
          ? definitions
              .fields(definition, subtype)
              .find((item) => item.param === rule.require)
          : null;
        issues.push({
          id: rule.id || `rule-${index + 1}`,
          severity: rule.severity,
          param: rule.require || "",
          label: field ? labelText(field) : rule.require || "",
          title: `${definition.label} step needs attention`,
          message: rule.message,
        });
      }
    });
    return issues;
  }

  const api = Object.freeze({
    HELPER_NAMES,
    TEMPLATE_HELPERS,
    BLOCK_NAMES: Object.freeze(Object.keys(BLOCKS)),
    HANDLER_NAMES: Object.freeze(Object.keys(HANDLERS)),
    load,
    loadBundled,
    ready: () => readyPromise || Promise.resolve(registry),
    useRegistry,
    registry: () => registry,
    onChange,
    definitionById,
    definitionFor,
    normalize,
    english,
    autoNotes,
    formulas,
    createdColumns,
    scriptRole,
    qtest,
    qtestAction,
    qtestOutcomes,
    builtInChecks,
    typeOptions,
    mergeTypeOptions,
    importTitles,
    parseText,
    renderEditor,
    validate,
  });
  global.ATLASStepTypeRuntime = api;

  // The bundled repository definitions make the registry ready at once.
  // Without a bundle, pages fetch catalogs/step-types/. Node tests that load
  // only some scripts have no engine and skip both.
  if (
    engine()?.registry &&
    !loadBundled() &&
    typeof global.fetch === "function"
  )
    load();
})(typeof window !== "undefined" ? window : globalThis);
