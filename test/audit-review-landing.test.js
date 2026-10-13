import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../js/27-audit-review-mode.js", import.meta.url),
  "utf8",
);
const workflowSource = readFileSync(
  new URL("../js/24-audit-workflow-ui.js", import.meta.url),
  "utf8",
);
test("review entry bypasses the landing dialog", () => {
  assert.doesNotMatch(source, /renderLanding\(/);
  assert.doesNotMatch(source, /aria-modal=\"true\"/);
  assert.match(
    source,
    /showSection\(pageMap\[review\.session\.resumeSection\]/,
  );
  assert.match(source, /atlasReviewerModeShell/);
});
test("review saving remains dirty-only and single-flight", () => {
  assert.match(source, /if \(!review \|\| !dirty\.size\) return review/);
  assert.match(source, /if \(savePromise\) return savePromise/);
  assert.match(source, /expectedVersion: expected/);
  assert.match(source, /error\.status === 409/);
});

test("workflow View Approval Request resolves current request identity", () => {
  assert.match(
    workflowSource,
    /const workflow = await atlasLoadWorkflowSummary/,
  );
  assert.match(workflowSource, /auditId: workflow\.auditId/);
  assert.match(workflowSource, /requestId: workflow\.currentRequestId/);
  assert.match(
    workflowSource,
    /ATLASAuditReview\.open\(atlasApprovalReviewContext\(bound\)\)/,
  );
});
