import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const runner = readFileSync(
  new URL("../js/28-validation-runner.js", import.meta.url),
  "utf8",
);
const definition = readFileSync(
  new URL("../validation/validation-read-only-isolation.js", import.meta.url),
  "utf8",
);
test("Phase 1 runner stays observational", () => {
  assert.doesNotMatch(runner, /window\.fetch\s*=/);
  assert.doesNotMatch(runner, /XMLHttpRequest\.prototype/);
  assert.match(runner, /transaction\(STORE_NAME, "readonly"\)/);
  assert.match(runner, /dbGet\(ATLAS_AUTOSAVE_ID\)/);
});
test("Phase 1 exposes exactly one suite and supported outcomes", () => {
  assert.match(definition, /id: "read-only-isolation"/);
  assert.doesNotMatch(definition, /reviewer-authority|return-state|rescission/);
  for (const status of ["passed", "failed", "blocked"])
    assert.match(runner, new RegExp(status));
});
test("validation script remains before final bootstrap", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(
    index.indexOf("28-validation-runner.js") <
      index.indexOf("06-events-bootstrap.js"),
  );
});

test("validation runner reuses the accessible shared modal contract", () => {
  assert.match(runner, /className = "atlas-visual-picker-root"/);
  assert.match(runner, /class="atlas-visual-picker-backdrop"/);
  assert.match(runner, /class="atlas-visual-picker-dialog"/);
  assert.match(runner, /role="dialog"/);
  assert.match(runner, /aria-modal="true"/);
  assert.match(runner, /aria-labelledby="atlas-validation-title"/);
  assert.match(runner, /tabindex="-1"/);
  assert.match(runner, /data-validation-backdrop/);
  assert.match(runner, /event\.key !== "Tab"/);
});

test("shared modal selectors used by validation are present in generated CSS", () => {
  const generated = readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8",
  );
  assert.match(generated, /\.atlas-visual-picker-root\s*\{/);
  assert.match(generated, /position:\s*fixed/);
  assert.match(generated, /place-items:\s*center/);
  assert.match(generated, /\.atlas-visual-picker-backdrop\s*\{/);
  assert.match(generated, /\.atlas-visual-picker-dialog\s*\{/);
  assert.match(generated, /max-height:\s*min\(780px, calc\(100vh - 48px\)\)/);
});
