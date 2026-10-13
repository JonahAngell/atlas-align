import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/audit-repository.js", import.meta.url),
  "utf8",
);
test("ordinary no-op saves remain before workflow invalidation", () => {
  const save = source.slice(
    source.indexOf("export async function saveAudit"),
    source.indexOf("export async function listAuditRevisions"),
  );
  assert.ok(
    save.indexOf("document_sha256 === hash") <
      save.indexOf("invalidateWorkflowAuthorityWithClient"),
  );
});
test("audit restoration locks, verifies, and writes in one transaction", () => {
  const body = source.slice(
    source.indexOf("export async function restoreAuditRevision"),
    source.indexOf("export async function listStepRevisions"),
  );
  assert.ok(
    body.indexOf('client.query("BEGIN")') <
      body.indexOf("lockRestorationAudit"),
  );
  assert.ok(
    body.indexOf("lockRestorationAudit") <
      body.indexOf("verifyRestorationPreviewWithClient"),
  );
  assert.ok(
    body.indexOf("verifyRestorationPreviewWithClient") <
      body.indexOf("persistRestorationWithClient"),
  );
  assert.match(body, /client\.query\("COMMIT"\)/);
});
test("step restoration uses the signed placement and preserves unrelated steps", () => {
  const body = source.slice(
    source.indexOf("export async function restoreStepRevision"),
    source.indexOf("export async function archiveAudit"),
  );
  assert.match(body, /verified\.placementAdjustment/);
  assert.match(body, /document\.steps\[index\] = restoredStep/);
  assert.match(body, /document\.steps\.push\(restoredStep\)/);
  assert.doesNotMatch(body, /placementAdjustment\s*=/);
});
test("equal-content restoration returns unchanged without invalidation", () => {
  assert.match(source, /hash === auditRow\.document_sha256/);
  assert.match(source, /status: "unchanged"/);
});
test("restoration records lineage and placement events", () => {
  assert.match(source, /"audit\.restored"/);
  assert.match(source, /"step\.restored"/);
  assert.match(source, /"step\.orphan_placement_adjusted"/);
  assert.match(source, /restoredFromStepRevisionId/);
});
