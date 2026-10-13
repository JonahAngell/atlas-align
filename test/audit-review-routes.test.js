import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = [
  "../server.js",
  "../src/routes/review-routes.js",
  "../src/routes/workflow-routes.js",
]
  .map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
test("review routes are authenticated and feature gated", () => {
  assert.match(s, /review-session/);
  assert.match(s, /review-sessions\/:sessionId\/draft/);
  assert.match(s, /bulkApproveAuditReview/);
  assert.match(s, /requireCurrentUser/);
  assert.match(s, /workflowFeature\("reads"\)/);
});

test("final summary projects the same public workflow feature availability used by route guards", () => {
  assert.match(s, /final-summary/);
  assert.match(s, /features: publicWorkflowFeatureFlags\(workflowFlags\)/);
  assert.match(s, /finalize-approval/);
  assert.match(s, /workflowFeature\("publication"\)/);
});
