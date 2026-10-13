import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const review = fs.readFileSync(
  new URL("../js/27-audit-review-mode.js", import.meta.url),
  "utf8",
);
const inbox = fs.readFileSync(
  new URL("../js/25-inbox.js", import.meta.url),
  "utf8",
);
test("review UI exposes final summary and returned feedback entry", () => {
  assert.match(review, /final-summary/);
  assert.match(review, /openReturnedFeedback/);
  assert.match(inbox, /itemType === "Returned Review"/);
  assert.match(inbox, /reviewSessionId/);
});
test("Reviewer Mode uses append-only discussion routes", () => {
  assert.match(review, /\/items\/\$\{item\.id\}\/discussions/);
  assert.match(
    review,
    /\/review-discussions\/\$\{current\.thread\.id\}\/messages/,
  );
  assert.doesNotMatch(
    review,
    /method:\s*["'](?:PUT|PATCH|DELETE)["'][\s\S]{0,120}review-discussions/,
  );
});

test("returned review opens capability-limited analyst feedback in context", () => {
  assert.match(review, /mode: "analyst-feedback"/);
  assert.match(review, /ATLASReviewFeedback/);
  assert.match(review, /data-review-final-action/);
});

test("discussion controls follow server-returned capabilities", () => {
  assert.match(review, /payload\.capabilities/);
  assert.match(review, /capabilities\.canReply/);
  assert.match(review, /capabilities\.canCreate/);
  assert.match(review, /capabilities\.canResolve/);
  assert.match(review, /capabilities\.canReopen/);
  assert.match(review, /approved discussion is read-only/);
});

test("returned feedback distinguishes deleted objects and participant context", () => {
  assert.match(review, /Deleted object/);
  assert.match(review, /canonical history/);
  assert.match(review, /actorContext/);
});
