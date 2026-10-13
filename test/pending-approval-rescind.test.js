import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pending approval is a server-side mutation lock", async () => {
  const repository = await source("src/audit-repository.js");
  assert.match(repository, /AUDIT_PENDING_APPROVAL_LOCKED/);
  assert.match(
    repository,
    /assertAuditDocumentMutationAllowed\(existing\.rows\[0\]\)/,
  );
  assert.match(repository, /assertAuditDocumentMutationAllowed\(auditRow\)/);
});

test("rescind is an assigned-analyst transactional workflow", async () => {
  const workflow = await source("src/audit-workflow-repository.js");
  assert.match(workflow, /export async function rescindAuditApprovalRequest/);
  assert.match(workflow, /canRescindApprovalRequest/);
  assert.match(workflow, /request_status='Rescinded'/);
  assert.match(workflow, /approval\.request_rescinded/);
  assert.match(workflow, /session_status='Rescinded'/);
});

test("browser presents pending approval as read-only with rescission", async () => {
  const ui = await source("js/24-audit-workflow-ui.js");
  assert.match(ui, /function atlasAuditIsWorkflowLocked/);
  assert.match(ui, /data-workflow-action="rescind"/);
  assert.match(ui, /async function atlasRescindApprovalRequest/);
});
