import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);
test("review repository defines deterministic identity and request-bound persistence", () => {
  assert.match(s, /buildAuditReviewItems/);
  assert.match(s, /stableItemKey/);
  assert.match(s, /semanticFingerprint/);
  assert.match(s, /approval_request_id/);
  assert.match(s, /submitted_revision_id/);
  assert.match(s, /draft_version/);
  assert.match(s, /classifyCanonicalChanges/);
  assert.match(s, /canonicalObjectKey/);
});
test("decision validation requires notes", () => {
  assert.match(s, /Request changes/);
  assert.match(s, /Needs discussion/);
  assert.match(s, /A reviewer note is required/);
});

test("review item responses include authoritative discussion summaries", () => {
  assert.match(s, /discussionState/);
  assert.match(s, /discussionMessageCount/);
  assert.match(s, /atlas_audit_discussion_threads/);
  assert.match(s, /atlas_audit_discussion_messages/);
});

test("review responses expose authoritative camelCase session lifecycle", () => {
  assert.match(s, /sessionStatus: s\.rows\[0\]\.session_status/);
  const start = s.indexOf(
    "session: {",
    s.indexOf("export async function getAuditReview"),
  );
  const end = s.indexOf("document:", start);
  assert.ok(start >= 0 && end > start);
  const sessionProjection = s.slice(start, end);
  assert.doesNotMatch(sessionProjection, /session_status\s*:/);
});
