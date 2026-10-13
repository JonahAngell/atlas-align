import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(
  new URL("../js/19a-audit-history-browser.js", import.meta.url),
  "utf8",
);
test("timeline maps established event types and retains unknown types", () => {
  for (const x of [
    "approval.submission_requested",
    "approval.request_approved",
    "approval.request_denied",
    "approval.request_invalidated",
    "approval.invalidated_by_restoration",
    "audit.restored",
    "step.restored",
    "audit.published",
    "audit.published_unlocked",
    "publication.sent_to_recently_deleted",
  ])
    assert.ok(s.includes(x), x);
  assert.match(s, /replace\(\/\[._\]\//);
});
test("linked revisions and publications suppress duplicate standalone rows", () => {
  assert.match(s, /rids\.add/);
  assert.match(s, /pids\.add/);
  assert.match(s, /!rids\.has/);
  assert.match(s, /!pids\.has/);
});
test("pagination preserves the activity cursor", () => {
  assert.match(s, /beforeId/);
  assert.match(s, /activityCursor/);
  assert.match(s, /activityComplete/);
});
