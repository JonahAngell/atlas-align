import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = [
  "../server.js",
  "../src/routes/audit-routes.js",
  "../src/routes/workflow-routes.js",
  "../src/routes/review-routes.js",
]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
for (const route of [
  "/api/audits/:auditId/revisions/:revisionId/restore",
  "/api/audits/:auditId/steps/:stepId/revisions/:revisionId/restore",
  "/api/audits/:auditId/submit",
  "/api/audits/:auditId/approval-requests/:requestId/approve",
  "/api/audits/:auditId/approval-requests/:requestId/deny",
  "/api/audits/:auditId/publish",
  "/api/audits/:auditId/unlock",
])
  test(`registers ${route}`, () => assert.ok(source.includes(route)));
test("restore routes pass expected revision and preview token", () => {
  assert.match(source, /expectedRevisionId: req\.body\.expectedRevisionId/);
  assert.match(source, /previewToken: req\.body\.previewToken/);
});

test("registers candidate and unread routes", () => {
  assert.match(source, /approver-candidates/);
  assert.match(source, /inbox\/unread-count/);
  assert.match(source, /ATLAS_ADMIN_ROLE/);
  assert.match(
    readFileSync(
      new URL("../src/00-global-variables.js", import.meta.url),
      "utf8",
    ),
    /atlas-admin-team/,
  );
  assert.match(source, /isAssignedAnalyst/);
});

test("legacy direct approval route fails closed in favor of review finalization", () => {
  const repository = readFileSync(
    new URL("../src/audit-workflow-repository.js", import.meta.url),
    "utf8",
  );
  assert.match(
    repository,
    /Approval must be completed through the item-level review session/,
  );
  assert.match(source, /review-sessions\/:sessionId\/finalize-approval/);
});
