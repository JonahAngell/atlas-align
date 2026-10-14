import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
    new URL("../src/audit-workflow-repository.js", import.meta.url),
    "utf8",
  ),
  transaction = readFileSync(
    new URL("../src/db-transaction.js", import.meta.url),
    "utf8",
  ),
  activitySql = readFileSync(
    new URL(
      "../sql/audit-workflow-repository/record-audit-activity.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  resetSql = readFileSync(
    new URL(
      "../sql/audit-workflow-repository/reset-audit-workflow-authority.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  inboxSql = readFileSync(
    new URL(
      "../sql/audit-workflow-repository/get-inbox-approval-review-context.sql",
      import.meta.url,
    ),
    "utf8",
  );

test("workflow mutations retain explicit transactions and row locking", () => {
  assert.match(transaction, /query\("BEGIN"\)/);
  assert.match(source, /withTransaction\(/);
  assert.match(
    readFileSync(
      new URL(
        "../sql/audit-workflow-repository/lock-audit.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    /FOR UPDATE/,
  );
});

test("activity writer supports affected step and JSON metadata", () => {
  assert.match(source, /export async function recordAuditActivityWithClient/);
  assert.match(activitySql, /affected_step_id/);
  assert.match(source, /fields\.affectedStepId/);
  assert.match(source, /JSON\.stringify\(fields\.metadata/);
});

test("restoration invalidation clears draft-revision publication pointer", () => {
  assert.match(resetSql, /working_from_publication_id\s*=\s*CASE/);
  assert.match(source, /SQL\.resetAuditWorkflowAuthority/);
  assert.match(source, /\[auditRow\.id, restoration\]/);
});

test("invalidation event carries restoration correlation metadata", () => {
  assert.match(source, /approval\.invalidated_by_restoration/);
  assert.match(source, /sourceStepRevisionId/);
  assert.match(source, /placementAdjustment/);
});

test("Inbox review lookup validates recipient and authoritative request relationships", () => {
  assert.match(source, /getInboxApprovalReviewContext/);
  assert.match(inboxSql, /recipient_user_id\s*=\s*\$2/);
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
