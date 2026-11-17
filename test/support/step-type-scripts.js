/**
 * The scripts that make step type definitions work in a test that loads only
 * some of index.html: the engine, the bundled repository definitions, the
 * step type library and the runtime. Built-in code for a type that moved into
 * a definition is gone, so these tests need the definitions to see its
 * output.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);

const ENGINE = JSON.parse(
  readFileSync(new URL("js/step-types/engine-manifest.json", ROOT), "utf8"),
);

/** Engine scripts plus the bundled definitions, in index.html order. */
export const STEP_TYPE_ENGINE_SCRIPTS = Object.freeze([
  ...ENGINE.scripts,
  "js/step-types/definitions.generated.js",
]);

/** The library and runtime, loaded after the app's own formula code. */
export const STEP_TYPE_RUNTIME_SCRIPTS = Object.freeze([
  "js/13-step-type-library.js",
  "js/13a-step-type-runtime.js",
]);

/** Every step type script, for tests that add them after their own files. */
export const STEP_TYPE_SCRIPTS = Object.freeze([
  ...STEP_TYPE_ENGINE_SCRIPTS,
  ...STEP_TYPE_RUNTIME_SCRIPTS,
]);

/** Runs every step type script in a vm context. */
export function loadStepTypeScripts(context, files = STEP_TYPE_SCRIPTS) {
  for (const file of files)
    vm.runInContext(readFileSync(new URL(file, ROOT), "utf8"), context, {
      filename: file,
    });
  return context;
}
