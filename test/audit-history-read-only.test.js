import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(
  new URL("../js/19a-audit-history-browser.js", import.meta.url),
  "utf8",
);
test("historical documents remain detached from editable audit state", () => {
  assert.match(s, /atlasHistoryClone/);
  assert.doesNotMatch(s, /state\.audit\s*=/);
  assert.doesNotMatch(s, /atlasApplyLoadedAudit\(/);
});
test("ordinary browsing contains no persistence calls", () => {
  for (const x of [
    "capture(",
    "scheduleAutosave(",
    "saveAutosave(",
    "saveRecoveryDraftOnly(",
    "atlasMarkDatabaseDirty(",
    "atlasScheduleDatabaseWrite(",
    "atlasPerformDatabaseWrite(",
    "atlasFlushDatabaseWrite(",
  ])
    assert.equal(s.includes(x), false, x);
});
test("stale responses are rejected by audit and generation", () => {
  assert.match(s, /requestGeneration/);
  assert.match(s, /auditId\s*!==\s*historyView\.auditId/);
});
test("only restoration delegates to the existing Phase 4 entry point", () =>
  assert.match(s, /atlasRestoreAuditRevision\(historyView\.revisionId\)/));
