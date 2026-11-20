/**
 * Runs ATLAS's own T-SQL and pandas export on the server for any audit.
 *
 * The export builders in js/12b-code-export.js read state.audit and a few
 * browser helpers. Loading them into a node:vm context with state.audit set,
 * and small stand-ins for those helpers, gives the exact text the browser's
 * "Export code" writes, without changing the browser code.
 *
 * Used for the round trip (translated steps → code → compare with the
 * original) and to build the G1 gold set.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");

function scriptList() {
  const engine = JSON.parse(read("js/step-types/engine-manifest.json"));
  return [
    "js/07-phrase-catalog.js",
    "js/02-hierarchy.js",
    "js/02-logic-rendering.js",
    "js/02b-developer-formulas.js",
    ...engine.scripts,
    "js/step-types/definitions.generated.js",
    "js/13-step-type-library.js",
    "js/13a-step-type-runtime.js",
    "js/12b-code-export.js",
  ];
}

let compiled = null;

/** The scripts, compiled once per process. */
function scripts() {
  if (!compiled) {
    compiled = {
      list: scriptList().map(
        (file) => new vm.Script(read(file), { filename: file }),
      ),
      catalog: new vm.Script(
        `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
        { filename: "catalogs/logic_phrase_catalog.json" },
      ),
    };
  }
  return compiled;
}

const quiet = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
const noDocument = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};

function helpers(audit) {
  const sources = audit.sources || [];
  return {
    sourceAliasFor: (source) =>
      sources.find((item) => item.name === source || item.alias === source)
        ?.alias || String(source || ""),
    fieldsForSource: (source) =>
      (audit.fields || [])
        .filter(
          (field) =>
            !source ||
            field.sourceKey === source ||
            field.sourceFile === source ||
            field.sourceAlias === source,
        )
        .map((field, index) => ({
          order: index + 1,
          fieldName: field.rawFieldName || field.name,
          vanityLabel: field.name,
          label: field.name,
          ...field,
        })),
  };
}

const asText = (value) =>
  typeof value === "string" ? value : String(value?.text ?? "");

/**
 * { sql, python } for the audit, as ATLAS's export writes them.
 * The audit is copied, so the caller's object is never changed.
 */
export function exportAuditCode(audit, { timeoutMs = 5000 } = {}) {
  const copy = structuredClone(audit || {});
  let counter = 0;
  const context = vm.createContext({
    state: { audit: copy },
    console: quiet,
    document: noDocument,
    uid: (prefix = "id") => `${prefix}_${++counter}`,
    today: () => new Date().toISOString().slice(0, 10),
    atlasDisplayDocument: () => null,
  });
  const { list, catalog } = scripts();
  for (const script of list) script.runInContext(context);
  catalog.runInContext(context);
  Object.assign(context, helpers(copy));
  return {
    sql: asText(
      vm.runInContext("buildAuditSqlScript()", context, { timeout: timeoutMs }),
    ),
    python: asText(
      vm.runInContext("buildAuditPythonScript()", context, {
        timeout: timeoutMs,
      }),
    ),
  };
}
