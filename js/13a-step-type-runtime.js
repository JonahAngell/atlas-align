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
 * placeholder key fallback, conditionTree nodes leaf=partial style=bullets|
 * inline|precedence, action part [context] (the chosen action kind's
 * partial, from catalogs/step-types/actions/), plus the helpers, migration handlers and editor blocks
 * of js/13-step-type-library.js. Besides param, subtype, stepNumber, parent,
 * step and format, templates read conditions (the step's normalized
 * condition tree), storedConditions (the tree as stored, which the IF / THEN
 * text and formulas read), elseStep (the managed ELSE of an IF) and ifStep
 * (the IF of an ELSE), and a definition's partials. The helpers a later
 * version replaced with partials (library.replacedHelpers) render the latest
 * definition of their type, so a pinned version still renders.
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
 * ready as soon as this file runs. On a served page loadFromServer() then
 * adds the definitions published in Postgres (GET /api/step-types), keeping
 * the bundle as the fallback. usePinnedVersions() renders a publication with
 * the definition versions it was published with (decision B).
 */
(function initializeStepTypeRuntime(global) {
  "use strict";

  const DIALECTS = ["excel", "sql", "python"];

  const library = global.ATLASStepTypeLibrary || {};
  const HANDLERS = Object.freeze({ ...(library.handlers || {}) });
  /**
   * Behavior blocks. A block a later definition version replaced with fields
   * (library.replacedBlocks: block name -> type id) is kept as a shim that
   * renders through that type's latest definition, so a publication pinned
   * to the old version still renders, with the same output.
   */
  const BLOCKS = Object.freeze({
    ...Object.fromEntries(
      Object.entries(library.replacedBlocks || {}).map(([block, typeId]) => [
        block,
        replacedBlockShim(typeId),
      ]),
    ),
    ...(library.blocks || {}),
  });

  function replacedBlockShim(typeId) {
    const latest = () => registry?.resolve(typeId) || null;
    const through =
      (part) =>
      (step, ...rest) => {
        const definition = latest();
        // A latest definition that is itself a block cannot stand in.
        if (!definition || definition.block) return undefined;
        return part(definition, step, ...rest);
      };
    return Object.freeze({
      // The latest definition's migration handlers bring the step up to date.
      normalize: through((definition, step) => {
        step.params = step.params || {};
        (definition.migrations || [])
          .filter((migration) => migration.op === "handler")
          .forEach((migration) =>
            HANDLERS[migration.name]?.(step, {
              definition,
              params: step.params,
            }),
          );
        normalizeComposites(definition, step);
      }),
      editor: through((definition, step) => renderEditorWith(definition, step)),
      english: through((definition, step) => englishWith(definition, step)),
      formulas: through((definition, step) => formulasWith(definition, step)),
      createdColumns: through(
        (definition, step) => createdColumnsWith(definition, step) || [],
      ),
      qtestAction: through((definition, step) =>
        qtestActionWith(definition, step),
      ),
      qtestOutcomes: through((definition, step, context) =>
        qtestOutcomesWith(definition, step, context),
      ),
    });
  }
  /**
   * Replaced helpers (library.replacedHelpers): each renders the latest
   * definition of its type, with the data of the template that called it,
   * through the partial (or the formulas) named there. The library's own
   * helper is the fallback when that definition has no such partial.
   */
  function replacedHelperShims() {
    const own = library.helpers || {};
    let depth = 0;
    const shim = (name, entry) =>
      function replacedHelper(args, hash = {}, tools = {}) {
        const target =
          (hash.branch !== undefined && entry.branches?.[text(hash.branch)]) ||
          entry;
        const stepType = text(tools.data?.step?.step_type);
        const type = target.fromStep
          ? target.fromStep.includes(stepType)
            ? stepType
            : ""
          : target.type;
        const definition = (type && registry?.resolve(type)) || null;
        const usable =
          definition &&
          !definition.block &&
          depth === 0 &&
          (target.formulas
            ? Boolean(definition.formulas)
            : Object.prototype.hasOwnProperty.call(
                definition.partials || {},
                target.partial,
              ));
        if (!usable) return own[name] ? own[name](args, hash, tools) : "";
        const data = {
          ...(tools.data || {}),
          ...(args[0] && typeof args[0] === "object" ? { param: args[0] } : {}),
        };
        const renderWith = (template, format) =>
          typeof template === "string"
            ? text(
                engine().templates.render(template, data, {
                  helpers: TEMPLATE_HELPERS,
                  partials: definition.partials || {},
                  format,
                }),
              ).trim()
            : "";
        depth += 1;
        try {
          if (!target.formulas)
            return renderWith(
              `{{include "${target.partial}"}}`,
              tools.format || "english",
            );
          const set = definition.formulas;
          if (hash.note !== undefined)
            return (
              (set.notes || [])
                .map((template) => renderWith(template, "english"))
                .filter(Boolean)[Number(hash.note)] || ""
            );
          if (hash.part === "lead") return renderWith(set.lead, "english");
          return DIALECTS.includes(tools.format)
            ? renderWith(set.default?.[tools.format], tools.format)
            : "";
        } finally {
          depth -= 1;
        }
      };
    return Object.fromEntries(
      Object.entries(library.replacedHelpers || {}).map(([name, entry]) => [
        name,
        shim(name, entry),
      ]),
    );
  }

  /**
   * The field controls renderEditor draws, from the control palette
   * (catalogs/step-types/controls.json). A definition that names any other
   * control is rejected, so a palette control marked "planned" cannot be
   * used until this list has it.
   */
  const FIELD_CONTROLS = Object.freeze([
    "source_picker",
    "field_picker",
    "choice",
    "text",
    "textarea",
    "whole_number",
    "toggle",
    "hidden",
    "hint",
    "callout",
    "block",
    "sort_keys",
    "duplicate_keys",
    "readout",
    "math",
    "string_transform",
    "join_type",
    "join_keys",
    "condition_group",
    "action",
  ]);

  let registry = null;
  let readyPromise = null;
  let pinnedVersions = null;
  let revision = 0;
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

  /** Escapes text placed between tags, where quotes need no escaping. */
  function escapeText(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
    revision += 1;
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
    const palette = engine()?.bundled?.controls;
    return {
      helpers: [...HELPER_NAMES],
      blocks: Object.keys(BLOCKS),
      handlers: Object.keys(HANDLERS),
      controls: [...FIELD_CONTROLS],
      ...(palette ? { palette } : {}),
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

  /** The name {{action "qtest"}} gives a kind's qTest template. */
  const QTEST_ACTION_PARTIAL = "export.qtest.action";

  /**
   * The action kind (kind "action", id action_<name>) a then_action_type
   * names, in the version a pinned publication uses, or the freeform kind
   * when the value is blank or names no kind. null without a freeform kind.
   */
  function actionKind(value) {
    if (!registry) return null;
    const find = (name) => {
      const definition = /^[a-z][a-z0-9_]*$/.test(name)
        ? registry.get(`action_${name}`)
        : null;
      return definition?.kind === "action" ? pinned(definition) : null;
    };
    return (isBlank(value) ? null : find(text(value))) || find("freeform");
  }

  /** The latest action kinds, ordered for the action kind picker. */
  function actionKinds() {
    return registry?.actions ? registry.actions() : [];
  }

  /**
   * The version a pinned publication renders `definition`'s type with, or
   * the definition itself when nothing is pinned or the pin is not loaded.
   */
  function pinned(definition) {
    const version = definition ? pinnedVersions?.[definition.id] : undefined;
    if (version === undefined || version === definition.version)
      return definition;
    return registry.get(definition.id, version) || definition;
  }

  /**
   * Loads the published definitions from GET /api/step-types into a registry
   * that also holds the bundled repository definitions, so a type the
   * database lacks still works. The database copy wins for the same id and
   * version. When the request fails the current registry is kept, so the
   * registry is never empty because the server was unavailable.
   */
  function loadFromServer(options = {}) {
    const fetchImpl = options.fetch || global.fetch;
    const bundle = options.bundle || engine()?.bundled;
    const create = engine()?.registry?.createRegistry;
    if (!fetchImpl || !create || !bundle?.schema) return Promise.resolve(null);
    readyPromise = Promise.resolve()
      .then(() =>
        fetchImpl(options.url || "/api/step-types", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      )
      .then((response) => {
        if (!response.ok)
          throw new Error(`/api/step-types returned HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const served = Array.isArray(payload?.definitions)
          ? payload.definitions
          : [];
        const bundled = Array.isArray(bundle.definitions)
          ? bundle.definitions
          : [];
        const latestVersions = {};
        bundled.forEach((definition) => {
          if (
            Number.isInteger(definition?.version) &&
            !(latestVersions[definition.id] >= definition.version)
          )
            latestVersions[definition.id] = definition.version;
        });
        Object.entries(payload?.latest || {}).forEach(([id, version]) => {
          if (Number.isInteger(Number(version)))
            latestVersions[id] = Number(version);
        });
        // A type retired in the builder has no latest version, so it leaves
        // the picker; its steps still render with its highest version.
        (Array.isArray(payload?.retired) ? payload.retired : []).forEach(
          (id) => delete latestVersions[id],
        );
        const loaded = create({
          ...registryOptions(),
          schema: bundle.schema,
          latestVersions,
        });
        served.forEach((row) =>
          loaded.add(row?.definition ?? row, { origin: "database" }),
        );
        bundled.forEach((definition) =>
          loaded.add(definition, { origin: "repository" }),
        );
        if (!loaded.size)
          throw new Error("/api/step-types returned no usable definitions");
        const rejected = loaded.rejected();
        if (rejected.length)
          global.console?.warn?.(
            `${rejected.length} step type definition(s) were not loaded. Fix them in the builder and publish again.`,
            rejected,
          );
        useRegistry(loaded);
        return loaded;
      })
      .catch((error) => {
        global.console?.warn?.(
          "Published step type definitions could not be loaded, so the definitions ATLAS Align was deployed with are used. Reload the page to try again.",
          error,
        );
        return registry;
      });
    return readyPromise;
  }

  function definitionById(id) {
    if (!registry || isBlank(id)) return null;
    return pinned(registry.resolve(String(id))) || null;
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
      pinned(
        registry.resolve(
          isBlank(step.step_type) ? undefined : String(step.step_type),
          isBlank(step.type) ? undefined : String(step.type),
        ),
      ) || null
    );
  }

  /**
   * Decision B: a published or locked audit renders with the definition
   * versions recorded on its publication ({type_id: version}). Pass null to
   * return to the latest versions, which editable audits use. Types the
   * publication does not name use their latest version.
   */
  function usePinnedVersions(versions) {
    const next =
      versions && typeof versions === "object" && Object.keys(versions).length
        ? Object.freeze(
            Object.fromEntries(
              Object.entries(versions)
                .map(([id, version]) => [id, Number(version)])
                .filter(([, version]) => Number.isInteger(version)),
            ),
          )
        : null;
    if (JSON.stringify(next) === JSON.stringify(pinnedVersions)) return;
    pinnedVersions = next;
    notify();
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
    /**
     * A condition tree laid out with the app's structure rules, each single
     * condition rendered by the partial named in leaf= (its context is the
     * condition). style= is bullets (analyst text, the default), inline (one
     * expression with parentheses) or precedence (a formula: AND before OR).
     */
    conditionTree(args, hash, { format, partial }) {
      const conditions = engine().conditions;
      const leafName = text(hash.leaf).trim();
      if (!leafName)
        throw new Error(
          'conditionTree needs leaf="the partial for one condition"',
        );
      if (typeof partial !== "function")
        throw new Error("conditionTree needs an engine with partials");
      const style = text(hash.style || "bullets").trim();
      if (!conditions.STYLES.includes(style))
        throw new Error(
          `conditionTree style must be ${conditions.STYLES.join(", ")}`,
        );
      const nodes = Array.isArray(args[0]) ? args[0] : [];
      const leaf = (node) => partial(leafName, node);
      if (style === "inline") return conditions.inline(nodes, { leaf });
      if (style === "bullets") {
        const phrase = app("renderCatalogPhrase");
        return conditions.bullets(nodes, {
          leaf,
          line: (connector, conditionText) =>
            phrase
              ? phrase("analyst_logic.if_then.condition_line", {
                  connector,
                  condition_text: conditionText,
                })
              : `${connector} ${conditionText}`.trim(),
        });
      }
      const appCombine = app("atlasDevCombine");
      const unwrap = app("atlasDevUnwrap") || ((value) => value);
      const expression = conditions.precedence(nodes, {
        leaf,
        ...(appCombine
          ? {
              combine: (items, connector) =>
                appCombine(items, connector, format),
            }
          : {}),
      });
      return unwrap(expression) || placeholder("condition", "[condition]");
    },
    /**
     * {{action "part" [context]}}: a partial (english, elseEnglish, formula
     * and so on) of the action kind named by then_action_type, freeform when
     * that is blank or names no kind. It renders with the calling template's
     * partials under the kind's own, so a kind can include the step type's
     * condition and frames. With a context (elseStep, say) the kind and the
     * values are that step's, as {{include "name" context}} reads them, and
     * a context that is not a step (no ELSE step, say) has no action, so ""
     * comes back. {{action "qtest" part="kind"}} renders the kind's
     * export.qtest.action template of that name. "" when the kind has no
     * such part.
     */
    action(args, hash, tools) {
      if (typeof tools.partialWith !== "function")
        throw new Error("action needs an engine with partialWith");
      const part = text(args[0]).trim();
      const rest = args.length > 1 ? [args[1]] : [];
      const isStep = (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.prototype.hasOwnProperty.call(value, "param") &&
        value.param !== undefined;
      if (rest.length && !isStep(rest[0])) return "";
      const holder = rest.length
        ? rest[0]
        : isStep(tools.item)
          ? tools.item
          : tools.data;
      const kind = actionKind(holder?.param?.then_action_type);
      if (!kind) return "";
      const set = { ...(kind.partials || {}) };
      let name = part;
      if (part === "qtest") {
        const template = kind.export?.qtest?.action?.[text(hash.part)];
        if (typeof template !== "string") return "";
        name = QTEST_ACTION_PARTIAL;
        set[name] = template;
      } else if (!Object.prototype.hasOwnProperty.call(set, part)) return "";
      return tools.partialWith(set, name, ...rest);
    },
    ...(library.helpers || {}),
    ...replacedHelperShims(),
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

  /**
   * What ATLAS asks of a step's type: { carriesConditions, storesConditions,
   * branches, inverse, orderGroup }, from its (pinned) definition, with the
   * legacy answers for versions that don't say. A generated reference step
   * always sorts with the sources.
   */
  function capabilitiesFor(step) {
    const definitions = engine().definitions;
    if (!definitions?.capabilities || !step) return null;
    const definition = definitionFor(step);
    const found = definitions.capabilities(
      definition,
      definition?.id || step.step_type,
    );
    if (step.autoGeneratedReference) found.orderGroup = 10;
    return found;
  }

  /**
   * What a new step of `typeId` starts with, from the `defaults` of the
   * palette composites its definition places: { blankCondition, params }.
   * blankCondition seeds one blank condition; params fill blank parameters.
   * Field defaults are applied afterwards by normalize().
   */
  function newStepDefaults(typeId) {
    const result = { blankCondition: false, params: {} };
    const definition = definitionById(typeId);
    const controls = engine()?.bundled?.controls?.controls;
    if (!definition || !Array.isArray(controls)) return result;
    (definition.fields || []).forEach((field) => {
      const defaults = controls.find(
        (control) => control.name === field?.control,
      )?.defaults;
      if (!defaults) return;
      if (defaults.blankCondition) result.blankCondition = true;
      Object.entries(defaults.params || {}).forEach(([param, value]) => {
        if (!(param in result.params)) result.params[param] = value;
      });
    });
    return result;
  }

  /** The step's condition tree, normalized, as plain data. */
  function conditionsFor(step) {
    const conditions = engine().conditions;
    if (!conditions || !step) return [];
    // No uid: legacy conditions get blank ids rather than using up app ids.
    const sourceAliasFor = app("sourceAliasFor");
    return conditions.normalizedTree(step, {
      uid: () => "",
      ...(sourceAliasFor ? { sourceAliasFor } : {}),
    });
  }

  /**
   * The step's condition tree as stored (parseStepConditions without ids):
   * not normalized, so value lists and run parameters read as the app's
   * condition text and formulas read them.
   */
  function storedConditionsFor(step) {
    const conditions = engine().conditions;
    if (!conditions || !step) return [];
    const sourceAliasFor = app("sourceAliasFor");
    return conditions.parse(step, {
      uid: () => "",
      ...(sourceAliasFor ? { sourceAliasFor } : {}),
    });
  }

  /** Another step as templates see it: one step away, read-only. */
  function linkedStepData(item) {
    if (!item) return null;
    return {
      id: item.id,
      step_type: item.step_type,
      stepNumber: stepNumberFor(item),
      param: { ...(item.params || {}) },
      conditions: conditionsFor(item),
      storedConditions: storedConditionsFor(item),
    };
  }

  /** The managed ELSE of an IF step (the rule in atlasDevElseStepFor). */
  function elseStepFor(step) {
    const find = app("atlasDevElseStepFor");
    return find ? linkedStepData(find(step)) : null;
  }

  /** The IF step an ELSE belongs to (params.parent_if_step_id). */
  function ifStepFor(step) {
    const parentId = step?.params?.parent_if_step_id;
    if (!parentId) return null;
    const steps = app("atlasDevSteps")?.() || [];
    return linkedStepData(steps.find((item) => item?.id === parentId));
  }

  function templateData(step, definition, format, extra = {}) {
    return {
      ...extra,
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
        conditions: step.conditions,
        action: step.action,
      },
      format,
      conditions: conditionsFor(step),
      storedConditions: storedConditionsFor(step),
      elseStep: elseStepFor(step),
      ifStep: ifStepFor(step),
    };
  }

  function render(template, step, definition, format, escapes = {}, extra) {
    if (typeof template !== "string") return null;
    return engine().templates.render(
      template,
      templateData(step, definition, format, extra),
      {
        helpers: TEMPLATE_HELPERS,
        partials: definition?.partials || {},
        format,
        ...escapes,
      },
    );
  }

  /**
   * One partial of a type's latest definition rendered for a step, e.g. the
   * IF / THEN condition in words (if_then "conditionText") or in one formula
   * dialect ("condition"). "" when the latest definition has no such partial.
   * @param {string} typeId - Step type whose latest definition has the partial.
   * @param {string} name - Partial name.
   * @param {any} step - Step the partial reads (params, conditions).
   * @param {string} [format] - "english", "plain", "excel", "sql" or "python".
   */
  function partial(typeId, name, step, format = "english") {
    const definition = registry?.resolve(typeId) || null;
    if (
      !definition ||
      definition.block ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(text(name)) ||
      !Object.prototype.hasOwnProperty.call(definition.partials || {}, name)
    )
      return "";
    try {
      return text(
        render(`{{include "${name}"}}`, step || {}, definition, format),
      ).trim();
    } catch (error) {
      return renderFailure(definition, name, error);
    }
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
   * Composite controls that keep state of their own up to date on the real
   * step: control -> app function(step).
   */
  const COMPOSITE_NORMALIZERS = Object.freeze({
    condition_group: "atlasNormalizeConditionGroup",
  });

  function normalizeComposites(definition, step) {
    const { definitions } = engine();
    definitions
      .fields(definition, definitions.subtypeOf(definition, step))
      .forEach((field) => app(COMPOSITE_NORMALIZERS[field.control])?.(step));
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
    // Composite controls and behavior blocks finish on the real step, so
    // rewrites that keep state on the step itself (condition mirrors,
    // created fields) still happen.
    normalizeComposites(current, step);
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
    return englishWith(definitionFor(step), step);
  }

  function englishWith(definition, step) {
    if (!definition) return null;
    const fromBlock = blockPart(definition, "english");
    if (fromBlock) return text(fromBlock(step));
    const { definitions } = engine();
    const template = definitions.template(
      definition,
      "english",
      definitions.subtypeOf(definition, step),
      step,
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
    return autoNotesWith(definitionFor(step), step);
  }

  function autoNotesWith(definition, step) {
    // Notes return null to keep the built-in ones, which a block part cannot
    // say, so a replaced block's notes are read from its latest definition.
    const replacedBy = library.replacedBlocks?.[definition?.block];
    if (replacedBy && !BLOCKS[definition.block]?.notes) {
      const latest = registry?.resolve(replacedBy);
      if (latest && !latest.block) return autoNotesWith(latest, step);
    }
    const fromBlock = blockPart(definition, "notes");
    if (fromBlock) return text(fromBlock(step));
    if (!definition?.autoNotes) return null;
    const { definitions } = engine();
    const template = definitions.template(
      definition,
      "autoNotes",
      definitions.subtypeOf(definition, step),
      step,
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
    return formulasWith(definitionFor(step), step);
  }

  function formulasWith(definition, step) {
    if (!definition) return null;
    const fromBlock = blockPart(definition, "formulas");
    if (fromBlock) return fromBlock(step) || null;
    const { definitions } = engine();
    const set = definitions.formulaSet(definition, step);
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
        const triple = set.variant
          ? set.default
          : definitions.formulas(definition, subtype);
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
    // A set that writes only a lead (an ELSE folded into its IF) gives only
    // the lead.
    if (
      result.lead &&
      !notes.length &&
      !set.fallback?.notes?.length &&
      !DIALECTS.some((dialect) => result[dialect])
    )
      return result;
    const complete = DIALECTS.every((dialect) => result[dialect]);
    result.notes = complete
      ? notes
      : [...notes, ...(set.fallback?.notes || [])];
    return result;
  }

  /**
   * Export shape warnings of a definition: each of its tests rendered with
   * the real formulas and checked as the code export would place them.
   */
  function exportShapeWarnings(definition) {
    return engine().definitions.exportShapeWarnings(definition, formulasWith);
  }

  /** Columns the step adds to the data, or null for built-in code. */
  function createdColumns(step) {
    return createdColumnsWith(definitionFor(step), step);
  }

  function createdColumnsWith(definition, step) {
    if (!definition) return null;
    const fromBlock = blockPart(definition, "createdColumns");
    if (fromBlock) return [...new Set((fromBlock(step) || []).filter(Boolean))];
    // A template can write several names, one per line.
    const names = (definition.outputs?.creates || []).flatMap((template) => {
      try {
        return text(render(template, step, definition, "plain"))
          .split("\n")
          .map((name) => name.trim());
      } catch (_error) {
        return [];
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
   * block or its action field, or null so the step counts as having no
   * action of its own.
   */
  function qtestAction(step) {
    const definition = definitionFor(step);
    const fromBlock = blockPart(definition, "qtestAction");
    if (fromBlock) return fromBlock(step) || null;
    return definition ? qtestActionWith(definition, step) : null;
  }

  /**
   * The outcome qTest tests: the definition's `export.qtest.action` (plain
   * templates; kind picks which of the others it has), else, for a type with
   * an action field, its latest version's.
   */
  function qtestActionWith(definition, step) {
    const { definitions } = engine();
    const action = definitions.exportFor(definition, step)?.qtest?.action;
    if (!action?.kind) {
      // An older version with an action field (if_then v2, say) tests the
      // outcome its latest version writes.
      const hasAction = definitions
        .fields(definition, definitions.subtypeOf(definition, step))
        .some((field) => field.control === "action");
      const latest = hasAction ? registry?.resolve(definition.id) : null;
      return latest &&
        latest !== definition &&
        !latest.block &&
        definitions.exportFor(latest, step)?.qtest?.action?.kind
        ? qtestActionWith(latest, step)
        : null;
    }
    const part = (name, template) => {
      try {
        return text(render(template || "", step, definition, "plain"));
      } catch (error) {
        return renderFailure(definition, `qTest ${name}`, error);
      }
    };
    const kind = part("kind", action.kind).trim();
    if (!definitions.QTEST_ACTION_KINDS.includes(kind))
      return {
        kind: "freeform",
        text: renderFailure(
          definition,
          "qTest kind",
          `"${kind}" is not one of ${definitions.QTEST_ACTION_KINDS.join(", ")}`,
        ),
      };
    if (kind === "display_text")
      return {
        kind,
        message: part("message", action.message),
        outputColumn: part("output column", action.outputColumn),
      };
    if (kind === "set_column")
      return {
        kind,
        targetColumn: part("target column", action.targetColumn),
        valueField: part("value field", action.valueField),
        calculated: part("calculated", action.calculated).trim() === "true",
      };
    if (kind === "freeform") return { kind, text: part("text", action.text) };
    return { kind };
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
    return qtestOutcomesWith(definition, step, context);
  }

  function qtestOutcomesWith(definition, step, context = {}) {
    const outcomes = engine().definitions.exportFor(definition, step)?.qtest
      ?.outcomes;
    if (!outcomes) return null;
    try {
      // `record` names the audit record ("Payroll audit record").
      const extra = { record: text(context.record) };
      return [
        render(outcomes.atlas, step, definition, "english", {}, extra),
        render(outcomes.source, step, definition, "english", {}, extra),
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

  /** "atlas-split-part-hint" for split_part: ids a field's markup uses. */
  function fieldId(field, suffix) {
    return `atlas-${text(field.param).replace(/_/g, "-")}-${suffix}`;
  }

  /** The help text's id: the field's helpId, else atlas-<param>-hint. */
  function helpId(field) {
    return field.helpId || fieldId(field, "hint");
  }

  function helpHtml(field) {
    return field.help
      ? `<small id="${escapeHtml(helpId(field))}" class="hint">${escapeText(field.help)}</small>`
      : "";
  }

  /** aria-describedby for a field with help, so readers hear the hint. */
  function describedBy(field) {
    return field.help ? ` aria-describedby="${escapeHtml(helpId(field))}"` : "";
  }

  /**
   * A placeholder attribute. One that shows double quotes, such as
   * e.g., " - ", is written in single quotes so it reads as typed.
   */
  function placeholderAttribute(value) {
    const shown = text(value);
    if (!shown) return "";
    return shown.includes('"') && !shown.includes("'")
      ? ` placeholder='${escapeText(shown)}'`
      : ` placeholder="${escapeHtml(shown)}"`;
  }

  /**
   * The options a new step can choose: hidden options and options whose
   * visibleWhen does not hold are left out, except the saved value, so a
   * saved step still shows what it uses.
   */
  function shownOptions(options, step, selected) {
    const { matches } = engine().definitions;
    return (options || []).filter(
      (option) =>
        option.value === selected ||
        (!option.hidden &&
          (!option.visibleWhen || matches(option.visibleWhen, step))),
    );
  }

  /**
   * Options with a saved value no option lists, such as an operator saved
   * as "is blank/null" or "EQUALS" by older audits. The control saves what
   * it shows, so without this a saved step took the first option on its
   * next edit and changed what it does.
   */
  function withSavedValue(options, selected) {
    if (!selected || options.some((option) => option.value === selected))
      return options;
    return [...options, { value: selected, label: selected }];
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
    layout,
    help,
    legacyOptionSpacing,
  }) {
    const choice = app("atlasChoiceControl");
    const attributes = `data-param="${escapeHtml(param)}"${disabled ? " disabled" : ""}`;
    // A heading without a popover sits above the control, as a label would.
    const above = heading && !popover;
    if (choice)
      return `<div class="atlas-choice-field${layout === "full" ? " full" : ""}">${
        above
          ? `<span class="atlas-choice-heading">${escapeHtml(heading)}</span>`
          : ""
      }${choice({
        options: optionTriples(options),
        selected,
        variant: display || "segment",
        label,
        attributes,
        ...(heading && !above ? { heading } : {}),
        ...(popover ? { popover } : {}),
      })}${help ? `<small class="hint">${escapeText(help)}</small>` : ""}</div>`;
    return selectHtml({
      param,
      label,
      options,
      selected,
      disabled,
      legacyOptionSpacing,
    });
  }

  function selectHtml({
    param,
    label,
    options,
    selected,
    disabled,
    required,
    placeholder: prompt,
    legacyOptionSpacing,
  }) {
    // The legacy editors wrote `<option value="x" >` for an unselected option.
    const unselected = legacyOptionSpacing ? " " : "";
    const first =
      prompt != null && prompt !== ""
        ? `<option value="">${escapeHtml(prompt)}</option>`
        : "";
    return `<label>${escapeHtml(label)}<select data-param="${escapeHtml(param)}"${required ? " required" : ""}${disabled ? " disabled" : ""}>${first}${options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}"${option.value === selected ? " selected" : unselected}>${escapeHtml(option.label)}</option>`,
      )
      .join("")}</select></label>`;
  }

  /**
   * A choice field's options. With optionsFrom, the catalog list at that
   * path decides which values are offered and in what order; an option of
   * the field with the same value gives its label, description and
   * visibility. Field options the catalog does not list follow, so hidden
   * legacy values still show on saved steps. Without the catalog the
   * field's own options are used.
   */
  function choiceOptions(field) {
    const own = field.options || [];
    if (!field.optionsFrom) return own;
    const read = app("getCatalogValue");
    const listed = read ? read(field.optionsFrom, undefined) : undefined;
    if (!Array.isArray(listed)) return own;
    const byValue = new Map(own.map((option) => [option.value, option]));
    const fromCatalog = listed.map((entry) => {
      const value = text(Array.isArray(entry) ? entry[0] : entry);
      const label = text(Array.isArray(entry) ? entry[1] : entry);
      return byValue.get(value) || { value, label };
    });
    const seen = new Set(fromCatalog.map((option) => option.value));
    return [...fromCatalog, ...own.filter((option) => !seen.has(option.value))];
  }

  /**
   * A field picker's Clear button. clearKey (internal) writes the
   * data-clear-concat-field button the Concatenate editor always had.
   */
  function clearButtonHtml(field, value, label) {
    if (!field.clearable) return "";
    const aria = `aria-label="Clear ${escapeHtml(label)}"`;
    if (field.clearKey)
      return `<button type="button" class="secondary small" data-clear-concat-field="${escapeHtml(field.clearKey)}" ${aria} ${value ? "" : "disabled"}>Clear</button>`;
    const source = field.sourceParam
      ? ` data-clear-source-param="${escapeHtml(field.sourceParam)}"`
      : "";
    return `<button type="button" class="secondary small" data-clear-param="${escapeHtml(field.param)}"${source} ${aria}${value ? "" : " disabled"}>Clear</button>`;
  }

  /**
   * Markup of a composite control drawn by an app editor, by control: the
   * app function and whether it reads the step's params or the whole step.
   */
  const COMPOSITE_EDITORS = Object.freeze({
    math: { name: "atlasSourceFieldModeInputs", reads: "params" },
    string_transform: {
      name: "atlasStringTransformModeInputs",
      reads: "params",
    },
    join_type: { name: "atlasRenderJoinTypePickerButton", reads: "step" },
    join_keys: { name: "atlasJoinKeysEditorHtml", reads: "step" },
    condition_group: { name: "atlasConditionGroupEditorHtml", reads: "step" },
    // The action builder also takes the branch it writes: THEN or ELSE.
    action: { name: "atlasActionEditorHtml", reads: "params" },
  });

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

  function blockHtml(name, field, step) {
    const html = BLOCKS[name]?.editor?.(step, field);
    if (typeof html === "string") return html;
    return `<p class="hint">The "${escapeHtml(name || "")}" editor block is not available in this version of ATLAS Align. Update ATLAS Align or remove the block in the step type builder.</p>`;
  }

  function fieldHtml(field, step, definition) {
    const { matches } = engine().definitions;
    const params = step.params || {};
    if (field.visibleWhen && !matches(field.visibleWhen, step)) return "";
    const disabled = field.enabledWhen && !matches(field.enabledWhen, step);
    const value = shownValue(field, step, definition);
    const label = labelText(field);
    const required = field.required ? " required" : "";
    const off = disabled ? " disabled" : "";
    const bind = `data-param="${escapeHtml(field.param)}"`;
    const placeholderText = placeholderAttribute(field.placeholder);
    const full = field.layout === "full" ? " full" : "";
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
        return `<label>${escapeHtml(label)}${input}${clearButtonHtml(field, value, label)}${helpHtml(field)}</label>`;
      }
      case "choice": {
        const selected = value || text(field.default);
        const options = withSavedValue(
          shownOptions(choiceOptions(field), step, selected),
          selected,
        );
        if (field.display === "select")
          return `${selectHtml({
            param: field.param,
            label,
            options,
            selected,
            disabled,
            required: field.required,
            placeholder: field.placeholder,
            legacyOptionSpacing: field.legacyOptionSpacing === true,
          })}${helpHtml(field)}`;
        return `${choiceHtml({
          param: field.param,
          label,
          heading: field.heading,
          popover: field.popover,
          options,
          selected,
          display: field.display,
          disabled,
          layout: field.layout,
          help: field.help,
          legacyOptionSpacing: field.legacyOptionSpacing === true,
        })}`;
      }
      case "textarea":
        return `<label${full ? ' class="full"' : ""}>${escapeHtml(label)}<textarea ${bind}${placeholderText}${required}${describedBy(field)}${off}>${escapeHtml(value)}</textarea>${helpHtml(field)}</label>`;
      case "whole_number": {
        const min = Number.isInteger(field.min) ? ` min="${field.min}"` : "";
        const max = Number.isInteger(field.max) ? ` max="${field.max}"` : "";
        return `<label>${escapeHtml(label)}<input type="number" ${bind} inputmode="numeric"${min}${max} step="1" value="${escapeHtml(value)}"${placeholderText}${required}${describedBy(field)}${off}>${helpHtml(field)}</label>`;
      }
      case "toggle":
        return `<label class="step-type-toggle"><input type="checkbox" ${bind}${value === "Yes" ? " checked" : ""}${describedBy(field)}${off}> ${escapeHtml(label)}${helpHtml(field)}</label>`;
      case "hidden":
        return `<input type="hidden" ${bind} value="${escapeHtml(value)}">`;
      case "hint":
        return `<p class="hint${full}${field.className ? ` ${escapeHtml(field.className)}` : ""}">${escapeText(field.help || field.label || "")}</p>`;
      case "callout": {
        // The template's own text is escaped as text and each value fully,
        // so a value cannot add markup.
        let message = "";
        try {
          message = text(
            render(field.message, step, definition, "plain", {
              escapeText,
              escapeValue: escapeHtml,
            }),
          );
        } catch (error) {
          message = escapeText(renderFailure(definition, "callout", error));
        }
        return message.trim()
          ? `<div class="logic-editor-callout${full}" role="note">${message}</div>`
          : "";
      }
      case "readout": {
        // Read-only text that tells the reader what a fixed setting is.
        let shown = "";
        try {
          shown = text(render(field.message, step, definition, "plain"));
        } catch (error) {
          shown = renderFailure(definition, "readout", error);
        }
        return `<label>${escapeHtml(label)}<input value="${escapeHtml(shown)}" readonly${describedBy(field)}>${helpHtml(field)}</label>`;
      }
      case "math":
      case "string_transform":
      case "join_type":
      case "join_keys":
      case "condition_group":
      case "action": {
        const editor = COMPOSITE_EDITORS[field.control];
        // The two composites with switchable features also take the
        // definition's features: {nesting: false} or {freeform: false}.
        const switchable =
          field.control === "condition_group" || field.control === "action";
        const html = app(editor.name)?.(
          editor.reads === "step" ? { ...step, params } : params,
          ...(field.control === "action" ? [field.branch || "THEN"] : []),
          ...(switchable ? [{ ...(field.features || {}) }] : []),
        );
        return typeof html === "string"
          ? html
          : `<p class="hint">The ${escapeHtml(field.control)} editor is not available in this version of ATLAS Align.</p>`;
      }
      case "block":
        return blockHtml(field.block, field, step);
      case "sort_keys":
      case "duplicate_keys":
        return blockHtml(field.control, field, step);
      default: {
        const suggestions = Array.isArray(field.suggestions)
          ? field.suggestions
          : [];
        const listId = fieldId(field, "options");
        const maxLength = Number.isInteger(field.maxLength)
          ? ` maxlength="${field.maxLength}"`
          : "";
        const list = suggestions.length ? ` list="${escapeHtml(listId)}"` : "";
        const datalist = suggestions.length
          ? `<datalist id="${escapeHtml(listId)}">${suggestions
              .map((item) => `<option value="${escapeHtml(item)}"></option>`)
              .join("")}</datalist>`
          : "";
        return `<label>${escapeHtml(label)}<input ${bind} value="${escapeHtml(value)}"${maxLength}${list}${placeholderText}${required}${describedBy(field)}${off}>${datalist}${helpHtml(field)}</label>`;
      }
    }
  }

  /**
   * Parameters whose change shows, hides or enables part of a field-based
   * editor: the subtype and every param a visibleWhen or enabledWhen reads.
   * The editor redraws when one of them changes.
   */
  function rerenderParams() {
    if (!registry) return [];
    const found = new Set();
    const collect = (condition) => {
      if (!condition || typeof condition !== "object") return;
      if (condition.param !== undefined) found.add(String(condition.param));
      (condition.all || []).forEach(collect);
      (condition.any || []).forEach(collect);
      collect(condition.not);
    };
    registry.list({ includeLegacy: true }).forEach((definition) => {
      if (definition.block) return;
      if (definition.subtypes?.param) found.add(definition.subtypes.param);
      const lists = [
        definition.fields || [],
        ...(definition.subtypes?.options || []).map(
          (option) => option.fields || [],
        ),
      ];
      lists.flat().forEach((field) => {
        collect(field.visibleWhen);
        collect(field.enabledWhen);
        (field.options || []).forEach((option) => collect(option.visibleWhen));
      });
    });
    return [...found].sort();
  }

  /** The editor form for a step, or null for built-in editors. */
  function renderEditor(step) {
    return renderEditorWith(definitionFor(step), step);
  }

  /**
   * Tab buttons and one panel per tab. The tab last chosen stays open; the
   * first tab opens until one is chosen.
   */
  function tabsHtml(tabs, panels) {
    const chosen = text(app("atlasActiveLogicEditorTab")?.());
    const open = tabs.some((tab) => tab.id === chosen) ? chosen : tabs[0].id;
    const active = (tab) => (tab.id === open ? "active" : "");
    const buttons = tabs
      .map(
        (tab) =>
          `<button type="button" class="logic-editor-tab ${active(tab)}" data-editor-tab="${escapeHtml(tab.id)}"> ${escapeText(tab.label)} </button>`,
      )
      .join("");
    const bodies = tabs
      .map(
        (tab) =>
          `<div class="logic-editor-tab-panel ${active(tab)}" data-editor-panel="${escapeHtml(tab.id)}">${panels.get(tab.id).join("")}</div>`,
      )
      .join("");
    return `<div class="logic-editor-tabs">${buttons}</div>${bodies}`;
  }

  function renderEditorWith(definition, step) {
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
    const frame = definition.editorFrame || {};
    const tabs = Array.isArray(frame.tabs) ? frame.tabs : [];
    // Each tab's fields, in order; without tabs every field is in one list.
    const panels = new Map(tabs.map((tab) => [tab.id, []]));
    // Shown fields with layout "pair" next to each other share one row.
    let pair = [];
    let pairClass = "";
    let pairPanel = parts;
    const flushPair = () => {
      if (pair.length)
        pairPanel.push(
          `<div class="logic-picker-pair${pairClass ? ` ${escapeHtml(pairClass)}` : ""}">${pair.join("")}</div>`,
        );
      pair = [];
      pairClass = "";
    };
    definitions.fields(definition, subtype).forEach((field) => {
      const html = fieldHtml(field, step, definition);
      if (!html) return;
      const panel = panels.get(field.tab) || parts;
      if (field.layout !== "pair" || panel !== pairPanel) flushPair();
      if (field.layout !== "pair") return panel.push(html);
      if (!pair.length) {
        pairClass = field.pairClass || "";
        pairPanel = panel;
      }
      pair.push(html);
    });
    flushPair();
    if (tabs.length) parts.push(tabsHtml(tabs, panels));
    // The same markup as the built-in editors, so the look does not change.
    let heading = definition.label;
    if (frame.heading) {
      try {
        heading = text(render(frame.heading, step, definition, "plain"));
      } catch (error) {
        heading = renderFailure(definition, "heading", error);
      }
    }
    const className = frame.className ? ` ${escapeHtml(frame.className)}` : "";
    const title =
      frame.heading === false ? "" : `<h4>${escapeHtml(heading)}</h4>`;
    const form = `<div class="guided-builder${className}">${title}${parts.join("")}</div>`;
    return frame.standalone
      ? form
      : `<div class="selected-source-only-builder">${form}</div>`;
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
      if (!field.required || field.requiredIssue === false) return;
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
    FIELD_CONTROLS,
    HANDLER_NAMES: Object.freeze(Object.keys(HANDLERS)),
    load,
    loadBundled,
    loadFromServer,
    ready: () => readyPromise || Promise.resolve(registry),
    useRegistry,
    usePinnedVersions,
    pinnedVersions: () => pinnedVersions,
    actionKind,
    actionKinds,
    revision: () => revision,
    registry: () => registry,
    onChange,
    definitionById,
    definitionFor,
    normalize,
    english,
    partial,
    storedConditions: storedConditionsFor,
    capabilities: capabilitiesFor,
    newStepDefaults,
    autoNotes,
    formulas,
    exportShapeWarnings,
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
    rerenderParams,
    validate,
  });
  global.ATLASStepTypeRuntime = api;

  // The bundled repository definitions make the registry ready at once, and
  // a served page then swaps in the published definitions from the server.
  // Without a bundle, pages fetch catalogs/step-types/. Node tests that load
  // only some scripts have no engine and skip all of this.
  const served = /^https?:$/.test(String(global.location?.protocol || ""));
  if (engine()?.registry) {
    if (loadBundled()) {
      if (served && typeof global.fetch === "function") loadFromServer();
    } else if (typeof global.fetch === "function") load();
  }
})(typeof window !== "undefined" ? window : globalThis);
