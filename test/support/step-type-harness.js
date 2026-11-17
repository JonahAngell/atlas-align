/**
 * Step type output harness.
 *
 * Loads every browser script that index.html loads, in the same order, into a
 * Node vm with a permissive DOM stand-in. The real final functions run, after
 * every wrapper layer, so this records what the app actually produces for a
 * step: English, automatic notes, Developer Logic, the guided editor, the
 * Requirements Preview, the SQL and Python scripts, qTest rows, Audit Issues,
 * and the text-import reading of the English sentence.
 *
 * The Dynamic Step Type Builder refactor must keep these outputs unchanged.
 * Time and random IDs are fixed so two runs give identical results.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

// Async shell scripts that need a real page and a server.
const SKIPPED_SCRIPTS = new Set([
  "js/00-html-partials-loader.js",
  "js/06-events-bootstrap.js",
]);

const FIXED_NOW = Date.parse("2026-11-16T12:00:00.000Z");

/** Script paths in index.html load order. */
export function appScriptPaths() {
  const html = read("index.html");
  return [...html.matchAll(/src="\.\/(js\/[^"]+\.js)"/g)]
    .map((match) => match[1])
    .filter((path) => !SKIPPED_SCRIPTS.has(path));
}

/** An object that accepts any property read, call, or write. */
function permissive(name = "stub") {
  const target = function () {
    return permissive(`${name}()`);
  };
  return new Proxy(target, {
    get(fn, property) {
      if (property === Symbol.toPrimitive) return () => "";
      if (property === Symbol.iterator) return function* () {};
      if (property === "then") return undefined;
      if (property === "length") return 0;
      if (property === "toString" || property === "valueOf") return () => "";
      return permissive(`${name}.${String(property)}`);
    },
    set() {
      return true;
    },
  });
}

/** A Date whose current time is fixed. */
function fixedDateClass() {
  const RealDate = Date;
  return class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FIXED_NOW]));
    }
    static now() {
      return FIXED_NOW;
    }
  };
}

/** Serves repository files to the app's fetch calls. */
async function repoFetch(url) {
  const path = String(url)
    .replace(/^[a-z]+:\/\/[^/]+\//i, "")
    .replace(/^\.?\//, "")
    .split("?")[0];
  let bytes;
  try {
    bytes = readFileSync(new URL(path, ROOT));
  } catch {
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(bytes.toString("utf8")),
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  };
}

/**
 * Loads the whole browser app into a fresh vm context, or only `scripts`
 * (repository paths, in load order) when given. `globals` replaces entries of
 * the stand-in window (document, fetch, ...) before any script runs.
 */
export async function loadApp({
  scripts = appScriptPaths(),
  globals = {},
} = {}) {
  let uuid = 0;
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const context = {
    console: {
      log() {},
      info() {},
      debug() {},
      warn() {},
      error: (...args) => console.error(...args),
    },
    Date: fixedDateClass(),
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    queueMicrotask,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    requestIdleCallback: () => 0,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    structuredClone,
    crypto: {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
      getRandomValues: (array) => array.fill(7),
    },
    document: permissive("document"),
    navigator: permissive("navigator"),
    history: permissive("history"),
    location: {
      pathname: "/",
      search: "",
      hash: "",
      href: "http://localhost/",
      origin: "http://localhost",
    },
    localStorage: storage,
    sessionStorage: storage,
    fetch: repoFetch,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => permissive("style"),
    ResizeObserver: observer,
    MutationObserver: observer,
    IntersectionObserver: observer,
    HTMLElement: class {},
    Element: class {},
    Node: class {},
    Event: class {},
    CustomEvent: class {},
    Blob: class {},
  };
  Object.assign(context, globals);
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  context.Math = vm.runInContext("Math", context);
  vm.runInContext("Math.random = () => 0.5;", context);
  for (const path of scripts)
    vm.runInContext(read(path), context, { filename: path });
  vm.runInContext(
    `phraseCatalog = ${read("catalogs/logic_phrase_catalog.json")};`,
    context,
  );
  await vm.runInContext(
    "window.ATLASAuditIssues?.catalogReady?.catch?.(() => null)",
    context,
  );
  return context;
}

const run = (context, code) => vm.runInContext(code, context);

/** JSON round trip so vm objects compare as plain data. */
const plain = (value) =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

/** Runs one recorder; a thrown error is recorded instead of stopping. */
function safely(fn) {
  try {
    return plain(fn());
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

async function safelyAsync(fn) {
  try {
    return plain(await fn());
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

/** Editor markup with whitespace and generated sequence IDs normalized. */
function normalizeHtml(html) {
  return String(html || "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/(atlas-choice-popover-|choice-popover-)\d+/g, "$1N")
    .trim();
}

/**
 * Records every per-step and per-audit output for one audit document. The
 * audit is loaded through normalizeLoadedAudit, the same path as a JSON
 * import or a database load.
 */
export async function recordAudit(context, document) {
  context.__snapshotInput = structuredClone(document);
  run(
    context,
    `state.audit = normalizeLoadedAudit(__snapshotInput, "repo");
     state.auditSelected = true;
     state.selectedStepId = null;
     window.ATLASAuditIssues?.invalidate?.();`,
  );
  const entries = safely(() =>
    run(context, "hierarchicalStepEntries()").map((entry) => ({
      id: entry.step.id,
      number: entry.number,
      level: entry.level,
      branchLabel: entry.branchLabel,
    })),
  );
  const steps = run(context, "state.audit.steps");
  const stepRecords = [];
  for (let index = 0; index < steps.length; index += 1) {
    context.__snapshotStep = steps[index];
    context.__snapshotIndex = index;
    const english = safely(() => run(context, "analystLogic(__snapshotStep)"));
    context.__snapshotEnglish = typeof english === "string" ? english : "";
    stepRecords.push({
      id: steps[index].id,
      stepType: steps[index].step_type,
      english,
      autoNotes: safely(() =>
        run(
          context,
          "noteText({ ...__snapshotStep, notes: '' }, __snapshotIndex)",
        ),
      ),
      developer: safely(() => run(context, "developerLogic(__snapshotStep)")),
      formulas: safely(() =>
        run(context, "atlasDeveloperFormulas(__snapshotStep)"),
      ),
      editorHtml: safely(() =>
        normalizeHtml(run(context, "renderGuidedBuilder(__snapshotStep)")),
      ),
      textImport: safely(() => {
        const parsed = run(
          context,
          "__snapshotEnglish ? atlasParseImportedLogicText(__snapshotEnglish) : null",
        );
        if (!parsed) return null;
        return parsed.ok
          ? { ok: true, stepType: parsed.stepType, params: parsed.params }
          : { ok: false };
      }),
      normalizedStep: safely(() => ({
        step_type: steps[index].step_type,
        type: steps[index].type,
        title: steps[index].title,
        params: steps[index].params,
      })),
    });
  }
  return {
    entries,
    steps: stepRecords,
    preview: safely(() => run(context, "previewRows()")),
    sqlScript: safely(() => run(context, "buildAuditSqlScript()")),
    pythonScript: safely(() => run(context, "buildAuditPythonScript()")),
    qtest: safely(() => run(context, "qtestSectionsFromLogicSteps()")),
    issues: await safelyAsync(async () => {
      const issues = run(context, "window.ATLASAuditIssues?.current?.()");
      const list = issues?.issues || issues?.items || issues || [];
      return (Array.isArray(list) ? list : []).map((issue) => ({
        key: issue.stableKey || issue.key || issue.ruleId,
        severity: issue.severity,
        message: issue.message || issue.title || "",
      }));
    }),
  };
}
