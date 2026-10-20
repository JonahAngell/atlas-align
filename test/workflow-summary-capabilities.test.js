import test from "node:test";
import assert from "node:assert/strict";
import { getAuditWorkflowSummary } from "../src/audit-workflow-repository.js";

const analyst = {
  id: "analyst-1",
  username: "analyst",
  roles: ["atlas-admin-team"],
  resolvedRoleSlugs: ["atlas-admin-team"],
  roleResolutionStatus: "resolved",
};

function poolFor(row) {
  return { query: async () => ({ rowCount: 1, rows: [row] }) };
}

function summaryRow(overrides = {}) {
  return {
    id: "audit-1",
    workflow_status: "Draft",
    current_revision_id: 7,
    current_revision_number: 3,
    document: {
      assignments: { assigned: [{ id: "analyst-1", username: "analyst" }] },
    },
    current_approval_request_id: null,
    ...overrides,
  };
}

test("an assigned analyst can submit a draft that has no approval request", async () => {
  const summary = await getAuditWorkflowSummary(poolFor(summaryRow()), {
    auditId: "audit-1",
    user: analyst,
  });
  assert.equal(summary.capabilities.canSubmit, true);
});

test("a draft reopened after a denied request can be submitted again", async () => {
  const row = summaryRow({
    workflow_status: "Draft Revision",
    current_revision_id: 9,
    current_approval_request_id: 4,
    current_request_status: "Denied",
    current_request_revision_id: 7,
  });
  const summary = await getAuditWorkflowSummary(poolFor(row), {
    auditId: "audit-1",
    user: analyst,
  });
  assert.equal(summary.capabilities.canSubmit, true);
});

test("a pending request still pins rescission to the submitted revision", async () => {
  const pending = (revisionId) =>
    summaryRow({
      workflow_status: "Pending Approval",
      current_revision_id: revisionId,
      current_approval_request_id: 4,
      current_request_status: "Pending",
      current_request_revision_id: 7,
    });
  const exact = await getAuditWorkflowSummary(poolFor(pending(7)), {
    auditId: "audit-1",
    user: analyst,
  });
  const stale = await getAuditWorkflowSummary(poolFor(pending(8)), {
    auditId: "audit-1",
    user: analyst,
  });
  assert.equal(exact.capabilities.canSubmit, false);
  assert.equal(exact.capabilities.canRescindApprovalRequest, true);
  assert.equal(stale.capabilities.canRescindApprovalRequest, false);
});
