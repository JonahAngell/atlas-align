/**
 * Step type registry: the validated, versioned set of step type definitions.
 *
 * Definitions are immutable once added. Adding the same id and version again
 * is accepted only when the content is identical; a different body is
 * rejected, never overwritten. Rejected definitions are kept with their
 * errors so admins can see why a type is missing.
 *
 * Classic-script usage:
 *   const registry = await ATLASStepTypes.registry.loadFromRepository({ fetch });
 *   registry.resolve("union_sources");   // definition, via aliases
 *   registry.list();                     // active types for the picker
 */
(function initializeStepTypeRegistry(global) {
  "use strict";

  const DEFAULT_BASE_URL = "./catalogs/step-types/";

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
        .join(",")}}`;
    return JSON.stringify(value);
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  /**
   * Options: schema (required), helpers, blocks, handlers, importHandlers
   * (names used to check definitions), supportedSchemaVersions, and
   * latestVersions ({id: version}, from the server): the version each type
   * uses when none is asked for. Without it the highest version is used. A
   * type held only for pinned publications (not in latestVersions) still
   * resolves but is left out of list().
   */
  function createRegistry(options = {}) {
    if (!options.schema)
      throw new Error("createRegistry() needs the definition schema");
    global.ATLASStepTypes.schema.assertSupported(options.schema);
    const byId = new Map(); // id -> Map(version -> definition)
    const aliasOwner = new Map(); // "step_type:x" / "type:x" -> id
    const rejected = [];
    const latestVersions =
      options.latestVersions && typeof options.latestVersions === "object"
        ? { ...options.latestVersions }
        : null;

    const reject = (definition, origin, errors) => {
      rejected.push({
        id: typeof definition?.id === "string" ? definition.id : "",
        version: Number.isInteger(definition?.version)
          ? definition.version
          : null,
        origin,
        errors,
      });
      return { ok: false, errors };
    };

    function add(input, { origin = "repository" } = {}) {
      let definition;
      try {
        definition = JSON.parse(JSON.stringify(input));
      } catch (_error) {
        return reject(input, origin, [
          { path: "/", code: "schema", message: "is not JSON data" },
        ]);
      }
      const result = global.ATLASStepTypes.definitions.validate(
        definition,
        options,
      );
      if (!result.ok) return reject(definition, origin, result.errors);

      const versions = byId.get(definition.id);
      const existing = versions?.get(definition.version);
      if (existing) {
        if (stableJson(existing) === stableJson(definition))
          return { ok: true, errors: [] };
        return reject(definition, origin, [
          {
            path: "/version",
            code: "version_conflict",
            message: `version ${definition.version} of "${definition.id}" is already registered with different content; publish a new version instead`,
          },
        ]);
      }

      const conflicts = [];
      const claims = [];
      const aliases = definition.aliases || {};
      (aliases.step_type || []).forEach((alias) => {
        if (byId.has(alias))
          conflicts.push(
            `step_type alias "${alias}" is the id of another step type`,
          );
        claims.push(`step_type:${alias}`);
      });
      (aliases.type || []).forEach((alias) => claims.push(`type:${alias}`));
      claims.forEach((key) => {
        const owner = aliasOwner.get(key);
        if (owner && owner !== definition.id)
          conflicts.push(
            `${key.replace(":", ' alias "')}" already belongs to "${owner}"`,
          );
      });
      if (
        !byId.has(definition.id) &&
        aliasOwner.has(`step_type:${definition.id}`)
      )
        conflicts.push(
          `id "${definition.id}" is already a step_type alias of "${aliasOwner.get(`step_type:${definition.id}`)}"`,
        );
      if (conflicts.length)
        return reject(
          definition,
          origin,
          conflicts.map((message) => ({
            path: "/aliases",
            code: "alias_conflict",
            message,
          })),
        );

      claims.forEach((key) => aliasOwner.set(key, definition.id));
      if (!versions) byId.set(definition.id, new Map());
      byId.get(definition.id).set(definition.version, deepFreeze(definition));
      return { ok: true, errors: [] };
    }

    /** One version of a type, or its latest version when `version` is omitted. */
    function get(id, version) {
      const versions = byId.get(id);
      if (!versions) return null;
      if (version !== undefined) return versions.get(Number(version)) || null;
      const latest = latestVersions?.[id];
      return (
        (latest !== undefined && versions.get(Number(latest))) ||
        versions.get(Math.max(...versions.keys())) ||
        null
      );
    }

    function versions(id) {
      return [...(byId.get(id)?.keys() || [])].sort((a, b) => a - b);
    }

    /**
     * The latest definition a saved step belongs to: its step_type as an id or
     * step_type alias, then its legacy `type` as an alias or id.
     */
    function resolve(stepType, legacyType, version) {
      const pick = (id) => (id ? get(id, version) || get(id) : null);
      if (stepType)
        return pick(
          byId.has(stepType)
            ? stepType
            : aliasOwner.get(`step_type:${stepType}`),
        );
      if (legacyType)
        return pick(
          aliasOwner.get(`type:${legacyType}`) ||
            (byId.has(legacyType) ? legacyType : null),
        );
      return null;
    }

    /** Latest versions, ordered for the step type picker. */
    function list({ includeLegacy = false } = {}) {
      return [...byId.keys()]
        .filter((id) => !latestVersions || latestVersions[id] !== undefined)
        .map((id) => get(id))
        .filter((definition) => includeLegacy || definition.status !== "legacy")
        .sort(
          (a, b) =>
            (a.order ?? Number.MAX_SAFE_INTEGER) -
              (b.order ?? Number.MAX_SAFE_INTEGER) ||
            a.label.localeCompare(b.label),
        );
    }

    /** Records a definition that could not even be read, e.g. a missing file. */
    function recordRejection({
      id = "",
      version = null,
      origin = "repository",
      errors = [],
    }) {
      rejected.push({ id, version, origin, errors: [...errors] });
    }

    return Object.freeze({
      add,
      reject: recordRejection,
      get,
      versions,
      resolve,
      list,
      rejected: () =>
        rejected.map((entry) => ({ ...entry, errors: [...entry.errors] })),
      get size() {
        return byId.size;
      },
    });
  }

  async function fetchJson(fetchImpl, url) {
    const response = await fetchImpl(url, { credentials: "same-origin" });
    if (!response.ok)
      throw new Error(`${url} returned HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Builds a registry from catalogs/step-types/: schema.json, manifest.json and
   * each definition file the manifest lists. A file that fails to load or
   * check is recorded in rejected() and the rest still load. Throws only when
   * the schema or manifest cannot be read.
   */
  async function loadFromRepository(options = {}) {
    const fetchImpl = options.fetch || global.fetch;
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const [schema, manifest] = await Promise.all([
      fetchJson(fetchImpl, `${baseUrl}schema.json`),
      fetchJson(fetchImpl, `${baseUrl}manifest.json`),
    ]);
    const registry = createRegistry({ ...options, schema });
    const entries = Array.isArray(manifest?.definitions)
      ? manifest.definitions
      : [];
    const loaded = await Promise.all(
      entries.map(async (entry) => {
        if (!/^[a-z][a-z0-9_]*(\.v\d+)?\.json$/.test(String(entry?.file || "")))
          return {
            entry,
            error: `"${entry?.file}" is not a definition file name`,
          };
        try {
          return {
            entry,
            definition: await fetchJson(fetchImpl, `${baseUrl}${entry.file}`),
          };
        } catch (error) {
          return { entry, error: error.message };
        }
      }),
    );
    loaded.forEach(({ entry, definition, error }) => {
      const reject = (code, message) =>
        registry.reject({
          id: typeof entry?.id === "string" ? entry.id : "",
          version: Number.isInteger(entry?.version) ? entry.version : null,
          origin: "repository",
          errors: [{ path: "/", code, message }],
        });
      if (error) return reject("load", error);
      if (definition?.id !== entry.id || definition?.version !== entry.version)
        return reject(
          "manifest_mismatch",
          `${entry.file} holds "${definition?.id}" version ${definition?.version}, but the manifest lists "${entry.id}" version ${entry.version}`,
        );
      registry.add(definition, { origin: "repository" });
    });
    return registry;
  }

  const api = Object.freeze({ createRegistry, loadFromRepository, stableJson });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.registry = api;
})(typeof window !== "undefined" ? window : globalThis);
