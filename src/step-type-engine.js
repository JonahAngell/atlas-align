/**
 * The step type engine on the server. The engine is a set of classic browser
 * scripts (js/step-types/ plus the library and runtime that name the helpers,
 * blocks and migration handlers definitions may use). They run here in their
 * own vm context so the server checks definitions with exactly the rules the
 * browser uses. Definitions are data: nothing in them is ever run as code.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { documentHash } from "./canonical-json.js";

const ROOT = new URL("../", import.meta.url);
const CATALOG = new URL("catalogs/step-types/", ROOT);
const DEFINITION_FILE = /^[a-z][a-z0-9_]*(\.v\d+)?\.json$/;

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

let cachedEngine = null;

/** Loads the engine scripts once and returns the engine and its names. */
export function loadStepTypeEngine() {
  if (cachedEngine) return cachedEngine;
  const manifest = readJson(
    new URL("js/step-types/engine-manifest.json", ROOT),
  );
  const context = vm.createContext({ console });
  [
    ...manifest.scripts,
    "js/13-step-type-library.js",
    "js/13a-step-type-runtime.js",
  ].forEach((file) =>
    vm.runInContext(readFileSync(new URL(file, ROOT), "utf8"), context, {
      filename: file,
    }),
  );
  const runtime = context.ATLASStepTypeRuntime;
  const palette = readJson(new URL("controls.json", CATALOG));
  cachedEngine = Object.freeze({
    engineVersion: manifest.engineVersion,
    schemaVersions: [...manifest.schemaVersions],
    engine: context.ATLASStepTypes,
    options: Object.freeze({
      helpers: [...runtime.HELPER_NAMES],
      blocks: [...runtime.BLOCK_NAMES],
      handlers: [...runtime.HANDLER_NAMES],
      controls: [...runtime.FIELD_CONTROLS],
      palette,
    }),
  });
  return cachedEngine;
}

/**
 * Reads catalogs/step-types/: the schema and every file the manifest lists.
 * A file that cannot be read, or whose content no longer matches the hash
 * the manifest recorded, is returned in `rejected` instead of `definitions`.
 */
export function readRepositoryStepTypes(catalog = CATALOG) {
  const schema = readJson(new URL("schema.json", catalog));
  const manifest = readJson(new URL("manifest.json", catalog));
  const definitions = [];
  const rejected = [];
  (Array.isArray(manifest?.definitions) ? manifest.definitions : []).forEach(
    (entry) => {
      const reject = (code, message) =>
        rejected.push({
          id: String(entry?.id || ""),
          version: Number.isInteger(entry?.version) ? entry.version : null,
          file: String(entry?.file || ""),
          errors: [{ path: "/", code, message }],
        });
      if (!DEFINITION_FILE.test(String(entry?.file || "")))
        return reject("load", `"${entry?.file}" is not a definition file name`);
      let definition;
      try {
        definition = readJson(new URL(entry.file, catalog));
      } catch (error) {
        return reject(
          "load",
          `${entry.file} could not be read: ${error.message}`,
        );
      }
      if (definition?.id !== entry.id || definition?.version !== entry.version)
        return reject(
          "manifest_mismatch",
          `${entry.file} holds "${definition?.id}" version ${definition?.version}, but the manifest lists "${entry.id}" version ${entry.version}`,
        );
      if (entry.hash && documentHash(definition) !== entry.hash)
        return reject(
          "manifest_mismatch",
          `${entry.file} changed after the manifest was built; run npm run step-types:manifest`,
        );
      definitions.push({ file: entry.file, definition });
    },
  );
  return { schema, definitions, rejected };
}

/**
 * Checks definitions together, as one registry would hold them, so alias
 * clashes between types are caught too. Returns the definitions that passed
 * and the errors of the rest.
 */
export function checkStepTypeDefinitions(schema, definitions) {
  const { engine, options } = loadStepTypeEngine();
  const registry = engine.registry.createRegistry({ ...options, schema });
  const accepted = [];
  const rejected = [];
  definitions.forEach((definition) => {
    const result = registry.add(definition, { origin: "repository" });
    if (result.ok) accepted.push(definition);
    else
      rejected.push({
        id: String(definition?.id || ""),
        version: Number.isInteger(definition?.version)
          ? definition.version
          : null,
        errors: result.errors.map((error) => ({ ...error })),
      });
  });
  return { accepted, rejected };
}
