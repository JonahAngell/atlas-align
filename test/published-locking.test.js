import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(
  new URL("../js/24-audit-workflow-ui.js", import.meta.url),
  "utf8",
);
test("published lock covers pages and persistence", () => {
  for (const v of [
    "page-overview",
    "page-fields",
    "page-steps",
    "page-display-fields",
    "scheduleAutosave",
    "atlasMarkDatabaseDirty",
    "atlasScheduleDatabaseWrite",
    "atlasPerformDatabaseWrite",
  ])
    assert.ok(s.includes(v), v);
});
test("history and publications remain", () => {
  assert.match(s, /history/);
  assert.match(s, /publications/);
});
