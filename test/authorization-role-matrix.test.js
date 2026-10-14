import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAccessForUser } from "../src/audit-authorization.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(here, "fixtures", "authorization-role-matrix.fixture.json"),
    "utf8",
  ),
);
const source = (relativePath) =>
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const uiSource = source("js/24-audit-workflow-ui.js");
const reviewRepositorySource = source("src/audit-review-repository.js");
const workflowRepositorySource = source("src/audit-workflow-repository.js");
const inboxSql = source(
  "sql/audit-workflow-repository/get-inbox-approval-review-context.sql",
);

const auditAt = (workflowStatus) => ({
  ...structuredClone(fixture.audit),
  workflowStatus,
});
const access = (user, workflowStatus, context = {}) =>
  auditAccessForUser(user, auditAt(workflowStatus), context);
const selectedContext = {
  selectedApprover: fixture.request.selectedApprover,
  exactRevision: true,
  exactRequest: true,
};

function assertReviewerActionsHidden(user, label) {
  const capabilities = access(user, "Pending Approval", selectedContext);
  assert.equal(
    capabilities.canApprove,
    false,
    `${label} must not receive canApprove`,
  );
  const cardMarkup = renderWorkflowActionMarkup(
    capabilities,
    fixture.request.id,
  );
  assert.doesNotMatch(
    cardMarkup,
    /View Approval Request|Approve Audit|Return to Analyst/,
  );
}

function renderWorkflowActionMarkup(capabilities, currentRequestId) {
  const can = (name) => Boolean(capabilities?.[name]);
  return `${
    can("canRescindApprovalRequest") && currentRequestId
      ? "<button>Rescind Approval Request</button>"
      : ""
  }${
    can("canApprove") && currentRequestId
      ? "<button>Approve Audit</button><button>Return to Analyst</button>"
      : ""
  }`;
}

function assertDirectReviewDenied(user, context = selectedContext) {
  assert.equal(access(user, "Pending Approval", context).canApprove, false);
  assert.match(
    reviewRepositorySource,
    /This review is not assigned to the signed-in user\./,
    "The authoritative review repository must retain an explicit 403 denial path",
  );
}

test("1 - assigned analyst can submit current Draft", () => {
  assert.equal(access(fixture.users.assignedAnalyst, "Draft").canSubmit, true);
  assert.equal(
    access(fixture.users.assignedAnalyst, "Draft", { exactRevision: false })
      .canSubmit,
    false,
  );
});

test("2 - assigned analyst can rescind exact active request", () => {
  assert.equal(
    access(fixture.users.assignedAnalyst, "Pending Approval", selectedContext)
      .canRescindApprovalRequest,
    true,
  );
  assert.equal(
    access(fixture.users.assignedAnalyst, "Pending Approval", {
      ...selectedContext,
      exactRequest: false,
    }).canRescindApprovalRequest,
    false,
  );
});

test("3 - assigned analyst cannot approve own submission", () => {
  const analystAsApprover = {
    selectedApprover: fixture.users.assignedAnalyst,
    exactRevision: true,
    exactRequest: true,
  };
  assert.equal(
    access(fixture.users.assignedAnalyst, "Pending Approval", analystAsApprover)
      .canApprove,
    false,
  );
});

test("4 - selected reviewer can open assigned review", () => {
  assert.equal(
    access(fixture.users.selectedReviewer, "Pending Approval", selectedContext)
      .canApprove,
    true,
  );
  assert.match(reviewRepositorySource, /openAuditReview/);
  assert.match(reviewRepositorySource, /getApprovalAuthority/);
});

test("5 - selected reviewer can save decisions", () => {
  assert.equal(
    access(fixture.users.selectedReviewer, "Pending Approval", selectedContext)
      .canApprove,
    true,
  );
  assert.match(reviewRepositorySource, /saveAuditReview/);
  assert.match(reviewRepositorySource, /updateReviewItemDecision/);
});

test("6 - selected reviewer can approve or return", () => {
  const capabilities = access(
    fixture.users.selectedReviewer,
    "Pending Approval",
    selectedContext,
  );
  const markup = renderWorkflowActionMarkup(capabilities, fixture.request.id);
  assert.match(markup, /Approve Audit/);
  assert.match(markup, /Return to Analyst/);
  assert.match(reviewRepositorySource, /finalizeApprovedAuditReview/);
  assert.match(reviewRepositorySource, /returnAuditReview/);
});

test("7 - backup analyst cannot see reviewer-only actions", () => {
  assertReviewerActionsHidden(fixture.users.backupAnalyst, "backup analyst");
});

test("8 - developer cannot see reviewer-only actions", () => {
  assertReviewerActionsHidden(fixture.users.developer, "developer");
});

test("9 - unrelated user cannot see View Approval Request", () => {
  assertReviewerActionsHidden(fixture.users.unrelatedUser, "unrelated user");
});

test("10 - unrelated user cannot see Approve Audit", () => {
  assertReviewerActionsHidden(fixture.users.unrelatedUser, "unrelated user");
});

test("11 - unrelated user cannot see Return to Analyst", () => {
  assertReviewerActionsHidden(fixture.users.unrelatedUser, "unrelated user");
});

test("12 - unrelated user direct action is rejected", () => {
  assertDirectReviewDenied(fixture.users.unrelatedUser);
});

test("13 - non-selected eligible user does not inherit review authority", () => {
  assertDirectReviewDenied(fixture.users.unrelatedEligible);
});

test("14 - inbox possession does not independently grant authority", () => {
  assert.equal(
    fixture.inboxItem.recipientUserId,
    fixture.users.unrelatedEligible.id,
  );
  assertDirectReviewDenied(fixture.users.unrelatedEligible);
  assert.match(inboxSql, /approval_requests?/i);
  assert.match(inboxSql, /selected_approver|approver_user_id/i);
});

test("15 - former reviewer cannot act after reassignment", () => {
  const reassignedContext = {
    ...selectedContext,
    selectedApprover: fixture.users.unrelatedEligible,
  };
  assertDirectReviewDenied(fixture.users.selectedReviewer, reassignedContext);
  assert.equal(
    access(
      fixture.users.unrelatedEligible,
      "Pending Approval",
      reassignedContext,
    ).canApprove,
    true,
  );
});

test("16 - disabled or unresolved identity fails closed", () => {
  for (const user of [
    fixture.users.disabledReviewer,
    fixture.users.unresolvedReviewer,
  ]) {
    const capabilities = access(user, "Pending Approval", {
      ...selectedContext,
      selectedApprover: user,
    });
    assert.equal(capabilities.canApprove, false);
  }
});

test("17 - buttons disappear immediately when capability changes", () => {
  const before = access(
    fixture.users.selectedReviewer,
    "Pending Approval",
    selectedContext,
  );
  const after = access(
    fixture.users.selectedReviewer,
    "Draft Revision",
    selectedContext,
  );
  assert.match(
    renderWorkflowActionMarkup(before, fixture.request.id),
    /Approve Audit/,
  );
  assert.doesNotMatch(
    renderWorkflowActionMarkup(after, fixture.request.id),
    /Approve Audit|Return to Analyst/,
  );
  assert.match(uiSource, /atlasRenderWorkflowCard\(\)/);
});

test("18 - hidden actions remain denied when called directly", () => {
  assertReviewerActionsHidden(fixture.users.unrelatedUser, "unrelated user");
  assertDirectReviewDenied(fixture.users.unrelatedUser);
  assert.match(
    workflowRepositorySource,
    /not assigned to the signed-in user\./,
  );
});
