import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  ),
  index = readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  overview = readFileSync(
    new URL("../sections/audit-overview.html", import.meta.url),
    "utf8",
  );
test("workflow UI uses server capabilities and exact tokens", () => {
  assert.match(ui, /capabilities/);
  assert.match(ui, /expectedRevisionId/);
  assert.match(ui, /expectedApprovalId/);
  assert.match(ui, /expectedPublicationId/);
});
test("scripts load after history and before bootstrap", () => {
  assert.ok(
    index.indexOf("19-audit-version-history.js") <
      index.indexOf("24-audit-workflow-ui.js"),
  );
  assert.ok(
    index.indexOf("25-inbox.js") < index.indexOf("06-events-bootstrap.js"),
  );
});

test("Refresh uses a handled event-listener path", () => {
  assert.match(overview, /id="atlasWorkflowRefresh"/);
  assert.doesNotMatch(overview, /onclick="ATLASWorkflow\.refresh\(\)"/);
  assert.match(ui, /getElementById\("atlasWorkflowRefresh"\)/);
  assert.match(ui, /addEventListener\("click"/);
});

test("workflow identity is review-aware and stale reads use the same resolver", () => {
  assert.match(ui, /window\.ATLASAuditReview\?\.isActive\?\.\(\)/);
  assert.match(ui, /window\.ATLASAuditReview\?\.context\?\.\(\)\?\.auditId/);
  assert.match(ui, /state\?\.auditPersistence\?\.auditId/);
  assert.match(ui, /sequence !== atlasWorkflowLoadSequence/);
  assert.match(ui, /auditId !== atlasActiveAuditId\(\)/);
  assert.match(ui, /getElementById\("atlasWorkflowRefresh"\)/);
  assert.match(
    ui,
    /addEventListener\("click", \(\) => atlasLoadWorkflowSummary\(\)\)/,
  );
});

test("Reviewer Mode independently locks mutations and has distinct guidance", () => {
  assert.match(
    ui,
    /if \(window\.ATLASAuditReview\?\.isActive\?\.\(\)\) return true/,
  );
  assert.match(ui, /Reviewer Mode: this submitted audit revision is read-only/);
  assert.match(ui, /ATLAS_REVIEW_ALLOWED_SELECTORS/);
  for (const selector of [
    "data-review-decision",
    "data-review-thread",
    "data-review-filter",
    "data-review-final-action",
    "data-review-exit",
  ])
    assert.match(ui, new RegExp(selector));
});

test("submission uses the shared Visual Picker and structured approver identity", () => {
  assert.match(ui, /ATLASVisualPicker\.open/);
  assert.match(ui, /approver-candidates/);
  assert.doesNotMatch(ui, /id="atlasSubmitApprover" required/);
});

test("approver picker consumes the original entry and guards malformed selections", () => {
  assert.doesNotMatch(ui, /entry\.original\.user/);
  assert.match(ui, /const user = entry\?\.user \|\| entry/);
  assert.match(ui, /!user\?\.id \|\| !user\?\.username/);
  assert.match(
    ui,
    /The selected approver could not be resolved\. Refresh the picker and try again\./,
  );
  const validation = ui.indexOf("!user?.id || !user?.username");
  const selection = ui.indexOf("onSelect(user);", validation);
  const close = ui.indexOf("ATLASVisualPicker.close();", selection);
  assert.ok(validation >= 0 && selection > validation && close > selection);
});

test("approval review accepts explicit identity and renders submitted revision", () => {
  assert.match(ui, /atlasApprovalReviewContext/);
  assert.match(ui, /submittedRevision\.document/);
  assert.match(ui, /Inspect submitted revision/);
  assert.match(ui, /atlasApprovalReviewGeneration/);
});

test("workflow card uses shared structured final actions", () => {
  assert.match(ui, /Approve Audit/);
  assert.match(ui, /Return to Analyst/);
  assert.match(ui, /data-workflow-action="return"/);
  assert.match(ui, /atlasRunStructuredReviewAction\("approve"\)/);
  assert.match(ui, /atlasRunStructuredReviewAction\("return"\)/);
  assert.match(ui, /ATLASAuditReview\?\.performFinalAction/);
  assert.doesNotMatch(ui, /data-workflow-action="deny"/);
  assert.doesNotMatch(ui, /atlasShowApprovalReview\("deny"\)/);
});

test("approval request and final actions render only from explicit capabilities", () => {
  assert.match(ui, /atlasWorkflowCan\("canViewApprovalRequest"\)/);
  assert.match(ui, /atlasWorkflowCan\("canRescindApprovalRequest"\)/);
  assert.match(ui, /atlasWorkflowCan\("canApprove"\)/);
  assert.doesNotMatch(
    ui,
    /\$\{w\.currentRequestId \? '<button[^']*view-request/,
  );
});

test("workflow identity requires accepted persistence revision outside review mode", () => {
  assert.match(
    ui,
    /if \(!persistedAuditId \|\| !persistence\?\.revisionId\) return null/,
  );
  assert.doesNotMatch(ui, /state\?\.audit\?\.id \|\|/);
});
