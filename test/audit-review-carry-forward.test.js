import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);
test("carry-forward is server-calculated and approve-only", () => {
  assert.match(s, /carryForwardReviewItemsWithClient/);
  assert.match(s, /previous.decision !== "Approve"/);
  assert.match(s, /semanticFingerprint/);
  assert.match(s, /parentItemKey/);
  assert.match(s, /canonicalOrder/);
  assert.match(s, /source_review_item_id/);
});
