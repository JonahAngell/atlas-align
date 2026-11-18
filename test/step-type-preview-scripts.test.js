/**
 * The Step Type Builder's live preview (Phase 7): the `preview` section of
 * js/step-types/engine-manifest.json lists every ATLAS Align file the builder
 * copies so one browser page can render the real guided editor, English,
 * automatic notes, Developer Logic, formulas, SQL and Python script fragments
 * and qTest rows for a step, without the rest of ATLAS.
 *
 * These tests load only those scripts, with a bare DOM whose lookups find
 * nothing (as on a page without ATLAS's markup) and a fetch that serves only
 * the listed catalogs, then check every output against the recorded step type
 * snapshots of the whole app. A script the list misses shows up as a load
 * failure or a changed output.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import {
  appScriptPaths,
  loadApp,
  recordAudit,
} from "./support/step-type-harness.js";
import { SNAPSHOT_DIR, snapshotCorpus } from "./support/step-type-corpus.js";

const ROOT = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");
const ENGINE = JSON.parse(read("js/step-types/engine-manifest.json"));
const PREVIEW = ENGINE.preview;

/**
 * A page element that holds nothing. Parsing markup is not emulated, so a
 * <template> finds no children, the same as the whole-app snapshots record.
 */
function bareElement() {
  return {
    innerHTML: "",
    textContent: "",
    get content() {
      return bareElement();
    },
    closest: () => null,
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    appendChild: (child) => child,
    append() {},
    remove() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
  };
}

/** A document without ATLAS's markup: every lookup finds nothing. */
function bareDocument() {
  return {
    readyState: "complete",
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    createElement: bareElement,
    addEventListener() {},
    removeEventListener() {},
    body: bareElement(),
    head: bareElement(),
    documentElement: bareElement(),
  };
}

/** Serves only the catalogs the preview list names; records every request. */
function catalogFetch(requests) {
  const served = new Set(PREVIEW.catalogs);
  return async (url) => {
    const file = String(url)
      .replace(/^\.?\//, "")
      .split("?")[0];
    requests.push(file);
    if (!served.has(file))
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      };
    const body = read(file);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  };
}

/** A context with only the preview scripts, loaded the way a page would. */
async function loadPreview() {
  const requests = [];
  const context = await loadApp({
    scripts: PREVIEW.scripts,
    globals: { document: bareDocument(), fetch: catalogFetch(requests) },
  });
  // The page loads the phrase catalog itself instead of the harness copy.
  vm.runInContext("phraseCatalog = {};", context);
  await vm.runInContext("initPhraseCatalog()", context);
  return { context, requests };
}

test("the preview list is in ATLAS load order and every file exists", () => {
  assert.ok(PREVIEW, "engine-manifest.json has a preview section");
  const order = appScriptPaths();
  const positions = PREVIEW.scripts.map((file) => order.indexOf(file));
  assert.ok(
    positions.every((position) => position >= 0),
    `preview scripts not loaded by index.html: ${PREVIEW.scripts.filter((_, i) => positions[i] < 0).join(", ")}`,
  );
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "preview scripts follow index.html order",
  );
  // The engine scripts are part of the page, in their own order.
  const engine = PREVIEW.scripts.filter((file) =>
    ENGINE.scripts.includes(file),
  );
  assert.deepEqual(engine, ENGINE.scripts);
  for (const file of [...PREVIEW.scripts, ...PREVIEW.css, ...PREVIEW.catalogs])
    assert.ok(existsSync(new URL(file, ROOT)), `${file} exists`);
  assert.equal(new Set(PREVIEW.scripts).size, PREVIEW.scripts.length);
});

test("the preview scripts load on a bare page and fetch only the phrase catalog", async () => {
  const { context, requests } = await loadPreview();
  assert.deepEqual(requests, ["catalogs/logic_phrase_catalog.json"]);
  assert.ok(
    vm.runInContext("Object.keys(phraseCatalog).length", context) > 0,
    "phrase catalog loaded",
  );
  assert.ok(
    vm.runInContext("ATLASStepTypeRuntime.registry().size", context) > 0,
  );
});

test("the preview declares the page hooks its editor code calls", async () => {
  // renderValidationPanel?.() still throws when the name was never declared,
  // so the file that declares it has to be on the list.
  const { context } = await loadPreview();
  assert.equal(
    vm.runInContext("typeof renderValidationPanel", context),
    "function",
  );
  assert.doesNotThrow(() =>
    vm.runInContext("renderValidationPanel()", context),
  );
});

const STEP_OUTPUTS = [
  "english",
  "autoNotes",
  "developer",
  "formulas",
  "editorHtml",
];
const AUDIT_OUTPUTS = ["sqlScript", "pythonScript", "qtest"];

/**
 * Records every corpus audit in `context`. Returns generation errors, the
 * outputs that differ from the recorded whole-app snapshots, and the step
 * types the corpus reached.
 */
async function recordCorpus(context) {
  const errors = [];
  const differences = [];
  const covered = new Set();
  for (const { name, document } of snapshotCorpus()) {
    const expected = JSON.parse(
      readFileSync(new URL(`${name}.json`, SNAPSHOT_DIR), "utf8"),
    );
    const actual = JSON.parse(
      JSON.stringify(await recordAudit(context, document)),
    );
    // A legacy type such as union_sources migrates to another type on load,
    // so the saved step_type counts too.
    (document.steps || []).forEach((step) => covered.add(step.step_type));
    const steps = vm.runInContext("state.audit.steps", context);
    actual.steps.forEach((step, index) => {
      context.__previewStep = steps[index];
      const id = vm.runInContext(
        "ATLASStepTypeRuntime.definitionFor(__previewStep)?.id",
        context,
      );
      if (id) covered.add(id);
      for (const key of STEP_OUTPUTS) {
        const label = `${name} ${step.id} (${step.stepType}) ${key}`;
        if (step[key]?.error) errors.push(`${label}: ${step[key].error}`);
        else if (
          JSON.stringify(step[key]) !==
          JSON.stringify(expected.steps[index][key])
        )
          differences.push(label);
      }
      if (!step.editorHtml || typeof step.english !== "string")
        errors.push(`${name} ${step.id} rendered no editor or English`);
    });
    for (const key of AUDIT_OUTPUTS) {
      if (actual[key]?.error)
        errors.push(`${name} ${key}: ${actual[key].error}`);
      else if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))
        differences.push(`${name} ${key}`);
    }
  }
  const types = vm.runInContext(
    "ATLASStepTypeRuntime.registry().list({ includeLegacy: true }).map((d) => d.id)",
    context,
  );
  return {
    errors,
    differences,
    uncovered: [...types].filter((id) => !covered.has(id)),
  };
}

test("on a bare page the preview renders every step type without errors", async () => {
  const { context } = await loadPreview();
  const { errors, uncovered } = await recordCorpus(context);
  assert.deepEqual(errors, []);
  assert.deepEqual(uncovered, [], "every step type has a step in the corpus");
});

test("the preview scripts give exactly the whole app's outputs", async () => {
  // Same stand-in DOM as the snapshots, so any missing script shows up as a
  // changed English, note, Developer Logic, formula, editor, script or qTest
  // output. (The bare page above renders IF conditions the stand-in DOM
  // cannot parse, so its editor markup is richer than the snapshots.)
  const context = await loadApp({ scripts: PREVIEW.scripts });
  const { errors, differences } = await recordCorpus(context);
  assert.deepEqual(errors, []);
  assert.deepEqual(differences, []);
});
