import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = readFileSync(
    new URL("../src/audit-workflow-repository.js", import.meta.url),
    "utf8",
  ),
  transaction = readFileSync(
    new URL("../src/db-transaction.js", import.meta.url),
    "utf8",
  ),
  audit = readFileSync(
    new URL("../src/audit-repository.js", import.meta.url),
    "utf8",
  ),
  publicationVersionSql = readFileSync(
    new URL(
      "../sql/audit-workflow-repository/next-publication-version.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  lockSql = readFileSync(
    new URL("../sql/audit-workflow-repository/lock-audit.sql", import.meta.url),
    "utf8",
  ),
  restorationSql = readFileSync(
    new URL(
      "../sql/audit-repository/insert-restoration-audit-revision.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  migration = readFileSync(
    new URL(
      "../.launch/migrations/20260911123000_add_audit_workflow_approval_publication_schema.sql",
      import.meta.url,
    ),
    "utf8",
  );

test("workflow schema is additive and relational", () => {
  for (const x of [
    "atlas_audit_approval_requests",
    "atlas_audit_approvals",
    "atlas_audit_publications",
    "atlas_inbox_items",
    "atlas_audit_activity_events",
  ])
    assert.ok(migration.includes(x), x);
});

test("publication numbers allocate against all retained versions", () =>
  assert.match(publicationVersionSql, /max\(version_number\)/i));

test("workflow mutations use explicit transactions and row locks", () => {
  assert.match(transaction, /BEGIN/);
  assert.match(repo, /withTransaction\(/);
  assert.match(lockSql, /FOR UPDATE/);
});

test("restoration creates revision rather than replacing historical document", () => {
  assert.match(audit, /insertRestorationAuditRevision/);
  assert.match(restorationSql, /INSERT INTO\s+atlas_audit_revisions/i);
  assert.match(restorationSql, /restored_from_revision_id/);
});
