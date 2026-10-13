import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/audit-workflow-repository.js", import.meta.url),
  "utf8",
);
test("workflow mutations retain explicit transactions and row locking", () => {
  assert.match(source, /query\("BEGIN"\)/);
  assert.match(source, /FOR UPDATE OF a/);
  assert.match(source, /query\("ROLLBACK"\)/);
});
test("activity writer supports affected step and JSON metadata", () => {
  assert.match(source, /export async function recordAuditActivityWithClient/);
  assert.match(source, /affected_step_id/);
  assert.match(source, /fields\.affectedStepId/);
  assert.match(source, /JSON\.stringify\(fields\.metadata/);
});
test("restoration invalidation clears draft-revision publication pointer", () => {
  assert.match(source, /working_from_publication_id=CASE WHEN \$2 THEN NULL/);
  assert.match(source, /\[auditRow\.id, restoration\]/);
});
test("invalidation event carries restoration correlation metadata", () => {
  assert.match(source, /approval\.invalidated_by_restoration/);
  assert.match(source, /sourceStepRevisionId/);
  assert.match(source, /placementAdjustment/);
});

test("Inbox review lookup validates recipient and authoritative request relationships", () => {
  assert.match(source, /getInboxApprovalReviewContext/);
  assert.match(source, /recipient_user_id=\$2/);
  assert.match(source, /currentRequestId/);
  assert.match(source, /canApprove/);
});

test("workflow summary calculates request relationship capabilities from the active request", () => {
  assert.match(source, /current_request_approver_user_id/);
  assert.match(source, /selectedApprover: currentRequest\?\.selectedApprover/);
  assert.match(
    source,
    /currentRequest\.submittedRevisionId === Number\(a\.current_revision_id\)/,
  );
});
