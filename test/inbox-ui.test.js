import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../js/25-inbox.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("Inbox uses recipient-scoped route and read-only preview", () => {
  assert.match(s, /\/api\/inbox/);
  assert.match(s, /showApprovalReview/);
  assert.doesNotMatch(
    s,
    /atlasApplyLoadedAudit|scheduleAutosave|atlasMarkDatabaseDirty/,
  );
});
test("mark read uses dedicated route", () =>
  assert.match(s, /\/read.*method:\s*"POST"/s));

test("Inbox consumes the items array from the response payload", () => {
  assert.match(
    s,
    /Array\.isArray\(payload\?\.items\) \? payload\.items : \[\]/,
  );
  assert.match(s, /beforeId = batch\.length \? batch\[batch\.length - 1\]\.id/);
  assert.doesNotMatch(s, /items\.push\(\.\.\.payload\)/);
});

test("topbar Inbox uses authoritative unread count and existing navigation", () => {
  assert.match(s, /\/api\/inbox\/unread-count/);
  assert.match(s, /showSection\("inbox"\)/);
  assert.match(s, /refreshUnreadCount/);
});

test("topbar and sidebar Inbox controls use the same mailbox icon", () => {
  const icons = readFileSync(new URL("../js/00-icons.js", import.meta.url), "utf8");
  const sidebar = index.match(
    /data-section="inbox"[\s\S]*?data-atlas-icon="([^"]+)"/,
  );
  const topbar = index.match(
    /id="atlasTopbarInbox"[\s\S]*?data-atlas-icon="([^"]+)"/,
  );
  assert.equal(sidebar?.[1], "inbox");
  assert.equal(topbar?.[1], sidebar?.[1]);
  assert.match(icons, /inbox:\s*`<rect[^`]*><path d="m4 7 8 6 8-6"\/>`/);
  assert.equal(icons.match(/inbox:/g)?.length, 1);
  assert.doesNotMatch(index, /<svg[\s\S]*<\/svg>/);
  assert.doesNotMatch(index, /topbar-inbox-icon[^>]*>▣/);
  assert.match(index, /id="atlasTopbarInboxBadge"/);
});

test("Inbox review remains identity-bound, stale-safe, and visibly busy", () => {
  assert.match(s, /inboxItemId: Number\(item\.id\)/);
  assert.match(s, /openGeneration/);
  assert.match(s, /aria-busy/);
  assert.match(s, /showApprovalReview\?\.\(\"view\",/);
});

test("Inbox opening is server-validated before Reviewer Mode and rejects stale identity", () => {
  const workflow = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  );
  const review = readFileSync(
    new URL("../js/27-audit-review-mode.js", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /atlasWorkflowPreviewRequest\(bound\)/);
  assert.match(
    workflow,
    /submittedRevisionId: Number\(preview\.review\.submittedRevisionId\)/,
  );
  assert.match(workflow, /activeGeneration !== atlasApprovalReviewGeneration/);
  assert.match(review, /loadedAuditId !== auditId/);
  assert.match(
    review,
    /loadedRevisionId !== Number\(context\.submittedRevisionId\)/,
  );
});

test("detached Inbox review navigation suppresses ordinary active-audit workflow lookup", () => {
  const workflow = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /!window\.ATLASAuditReview\?\.isActive\?\.\(\)/);
});

test("Inbox review workflow identity remains bound to the validated review context", () => {
  const workflow = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  );
  assert.match(s, /auditId: item\.auditId/);
  assert.match(
    workflow,
    /window\.ATLASAuditReview\?\.context\?\.\(\)\?\.auditId/,
  );
  assert.doesNotMatch(s, /state\.audit\s*=/);
});
