import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  ),
  history = readFileSync(
    new URL("../js/19a-audit-history-browser.js", import.meta.url),
    "utf8",
  ),
  deleted = readFileSync(
    new URL("../js/26-recently-deleted-publications.js", import.meta.url),
    "utf8",
  );
test("browser consumes only server returned feature availability", () => {
  assert.match(ui, /summary\.features/);
  assert.match(ui, /atlasWorkflowFeature/);
  assert.doesNotMatch(ui, /process\.env|ATLAS_WORKFLOW_.*_ENABLED/);
});
test("history and deletion entry points are rollout gated", () => {
  assert.match(history, /feature\?\.\("history"\)/);
  assert.match(deleted, /feature\?\.\("publicationDeletion"\)/);
});

test("workflow read failures render recoverable local states", () => {
  assert.match(ui, /atlasWorkflowLoadState = error\.status === 403/);
  assert.match(ui, /Workflow is unavailable/);
  assert.match(ui, /Workflow could not be loaded/);
  assert.match(ui, /return null;/);
});
