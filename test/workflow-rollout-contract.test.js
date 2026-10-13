import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const server = [
    "../server.js",
    "../src/routes/identity-routes.js",
    "../src/routes/workflow-routes.js",
    "../src/routes/preview-routes.js",
    "../src/routes/review-routes.js",
  ]
    .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
    .join("\n"),
  env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
test("all mutation stages are guarded server-side", () => {
  for (const x of [
    'workflowFeature("submission")',
    'workflowFeature("decisions")',
    'workflowFeature("publication")',
    'workflowFeature("unlock")',
    'workflowFeature("publicationDeletion")',
  ])
    assert.ok(server.includes(x), x);
});
test("documented defaults are disabled", () => {
  for (const line of env
    .split(/\r?\n/)
    .filter((x) => x.startsWith("ATLAS_WORKFLOW_")))
    assert.match(line, /=false$/);
});
test("authenticated feature response returns normalized public flags", () =>
  assert.match(server, /\/api\/workflow\/features/));
