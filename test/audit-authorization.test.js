import test from "node:test";
import assert from "node:assert/strict";
import { auditAccessForUser } from "../src/audit-authorization.js";
const audit = (status = "Draft") => ({
  workflowStatus: status,
  assignments: { assigned: [{ id: "analyst", username: "analyst" }] },
});
test("disabled users receive no workflow capabilities", () => {
  const x = auditAccessForUser(
    { id: "analyst", username: "analyst", disabled: true },
    audit(),
  );
  assert.equal(x.canSubmit, false);
  assert.equal(x.canRead, false);
});
test("assigned analyst may submit but cannot approve publish or unlock", () => {
  const u = {
    id: "analyst",
    username: "analyst",
    roles: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  assert.equal(auditAccessForUser(u, audit()).canSubmit, true);
  assert.equal(
    auditAccessForUser(u, audit("Pending Approval"), { selectedApprover: u })
      .canApprove,
    false,
  );
  assert.equal(auditAccessForUser(u, audit("Approved")).canPublish, false);
});
test("verified non-assigned admin team receives state-specific capabilities", () => {
  const u = {
    id: "reviewer",
    username: "reviewer",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  assert.equal(
    auditAccessForUser(u, audit("Pending Approval"), { selectedApprover: u })
      .canApprove,
    true,
  );
  assert.equal(auditAccessForUser(u, audit("Approved")).canPublish, true);
  assert.equal(auditAccessForUser(u, audit("Published")).canUnlock, true);
});
test("role resolution failure closes privileged workflow capabilities", () => {
  const u = {
    id: "reviewer",
    username: "reviewer",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "unavailable",
  };
  assert.equal(auditAccessForUser(u, audit("Approved")).canPublish, false);
});
test("align admin can delete publication even when assigned", () => {
  const u = {
    id: "analyst",
    username: "analyst",
    resolvedRoleSlugs: ["atlas-align-admin"],
    roleResolutionStatus: "resolved",
  };
  assert.equal(
    auditAccessForUser(u, audit("Published")).canDeletePublication,
    true,
  );
});

test("audit mutation requires a verified atlas-admin-team role", () => {
  const readOnly = {
    id: "reader",
    username: "reader",
    resolvedRoleSlugs: ["atlas-align-admin"],
    roleResolutionStatus: "resolved",
  };
  const admin = {
    id: "admin",
    username: "admin",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  for (const capability of ["canCreate", "canEdit", "canRestore", "canArchive"])
    assert.equal(
      auditAccessForUser(readOnly, audit())[capability],
      false,
      capability,
    );
  assert.equal(auditAccessForUser(readOnly, audit()).canRead, true);
  assert.equal(auditAccessForUser(admin, audit()).canCreate, true);
  assert.equal(auditAccessForUser(admin, audit()).canEdit, true);
});

test("approval-request visibility is relationship specific", () => {
  const analyst = {
    id: "analyst",
    username: "analyst",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  const reviewer = {
    id: "reviewer",
    username: "reviewer",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  const unrelated = {
    id: "other",
    username: "other",
    resolvedRoleSlugs: ["atlas-admin-team"],
    roleResolutionStatus: "resolved",
  };
  const context = {
    selectedApprover: reviewer,
    exactRevision: true,
    exactRequest: true,
  };
  assert.equal(
    auditAccessForUser(analyst, audit("Pending Approval"), context)
      .canViewApprovalRequest,
    true,
  );
  assert.equal(
    auditAccessForUser(reviewer, audit("Pending Approval"), context)
      .canViewApprovalRequest,
    true,
  );
  assert.equal(
    auditAccessForUser(unrelated, audit("Pending Approval"), context)
      .canViewApprovalRequest,
    false,
  );
  assert.equal(
    auditAccessForUser(unrelated, audit("Pending Approval"), context)
      .canApprove,
    false,
  );
});

test("missing forbidden and malformed role resolution fail closed", () => {
  for (const roleResolutionStatus of [
    undefined,
    "forbidden",
    "not_found",
    "unavailable",
    "malformed",
  ])
    assert.equal(
      auditAccessForUser(
        {
          id: "admin",
          username: "admin",
          resolvedRoleSlugs: ["atlas-admin-team"],
          roleResolutionStatus,
        },
        audit(),
      ).canCreate,
      false,
      String(roleResolutionStatus),
    );
});
