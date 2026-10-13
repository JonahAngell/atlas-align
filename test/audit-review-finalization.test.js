import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);
test("approved review finalization preserves the documented transaction and lock order", () => {
  assert.match(source, /finalizeApprovedAuditReview/);
  assert.match(
    source,
    /Lock order: review session, audit, request, submitted revision/,
  );
  assert.match(source, /SQL\.lockFinalReviewSession/);
  assert.match(source, /SQL\.lockFinalAudit/);
  assert.match(source, /SQL\.lockFinalApprovalRequest/);
  assert.match(source, /SQL\.shareLockSubmittedRevision/);
  assert.match(source, /SQL\.createAuditApproval/);
  assert.match(source, /SQL\.createAuditPublication/);
  assert.match(source, /SQL\.publishAudit/);
  assert.match(source, /query\("COMMIT"\)/);
  assert.match(source, /query\("ROLLBACK"\)/);
});
test("publication uses the locked submitted revision document", () => {
  assert.match(source, /structuredClone\(submitted\.document \|\| \{\}\)/);
  assert.match(source, /completeDocument\.status = "Complete"/);
  assert.match(source, /const completeDocumentHash = hash\(completeDocument\)/);
});
test("final approval locks and rejects open applicable discussion threads", () => {
  assert.match(
    source,
    /reviewThreadSummary\(client, sessionId, \{\s*lock: true,\s*\}\)/,
  );
  assert.match(
    source,
    /Every applicable review discussion must be resolved before approval/,
  );
  assert.match(source, /summary\.decisionEligible && threadSummary\.eligible/);
});
