import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const auditRoutes = readFileSync(
  new URL("../src/routes/audit-routes.js", import.meta.url),
  "utf8",
);
const source = [
  auditRoutes,
  readFileSync(
    new URL("../src/routes/preview-routes.js", import.meta.url),
    "utf8",
  ),
  readFileSync(
    new URL("../src/routes/workflow-routes.js", import.meta.url),
    "utf8",
  ),
].join("\n");
for (const route of [
  "/api/audits/:auditId/previews/revisions/:revisionId",
  "/api/audits/:auditId/previews/revisions/:revisionId/restoration",
  "/api/audits/:auditId/previews/steps/:stepId/revisions/:revisionId/restoration",
  "/api/audits/:auditId/previews/approval-requests/:requestId",
  "/api/audits/:auditId/previews/publications/:versionNumber",
])
  test(`registers read-only ${route}`, () => assert.ok(source.includes(route)));
test("restore routes delegate token verification to the atomic repository path", () => {
  const normalized = auditRoutes.replaceAll("\r\n", "\n");
  const auditRoute = normalized.slice(
    normalized.indexOf(
      'router.post(\n  "/api/audits/:auditId/revisions/:revisionId/restore"',
    ),
  );
  assert.ok(auditRoute.length > 1);
  assert.doesNotMatch(
    auditRoute.slice(
      0,
      auditRoute.indexOf('router.get(\n  "/api/audits/:auditId/steps'),
    ),
    /verifyRestorationPreview/,
  );
  assert.match(auditRoute, /previewToken: req\.body\.previewToken/);
});

test("registers recipient-bound Inbox approval review route", () => {
  assert.match(source, /\/api\/inbox\/:itemId\/approval-review/);
  assert.match(source, /Cache-Control.*no-store/);
});
