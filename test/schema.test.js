import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAndValidateCsv,
  CsvValidationError,
} from "../src/field-library.js";
import { FIELD_LIBRARY_COLUMNS } from "../src/00-global-variables.js";

const csv = (rows, headers = FIELD_LIBRARY_COLUMNS) =>
  Buffer.from(
    [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n"),
    "utf8",
  );
const validRow = FIELD_LIBRARY_COLUMNS.map((column) =>
  column === "ID" ? "1" : "",
);
test("accepts exact schema", () => {
  const parsed = parseAndValidateCsv(csv([validRow]));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.headers.length, 33);
});
test("accepts UTF-8 BOM", () => {
  const parsed = parseAndValidateCsv(
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv([validRow])]),
  );
  assert.equal(parsed.rows.length, 1);
});
test("rejects a trimmed trailing-space header", () => {
  const headers = [...FIELD_LIBRARY_COLUMNS];
  headers[10] = "Sample Value 1";
  assert.throws(
    () => parseAndValidateCsv(csv([validRow], headers)),
    CsvValidationError,
  );
});
test("rejects duplicate IDs", () => {
  assert.throws(() => parseAndValidateCsv(csv([validRow, validRow])), /unique/);
});
test("rejects blank IDs", () => {
  const row = [...validRow];
  row[32] = "";
  assert.throws(() => parseAndValidateCsv(csv([row])), /blank/);
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../.launch/migrations/20260911123000_add_audit_workflow_approval_publication_schema.sql",
);
const migration = readFileSync(migrationPath, "utf8");

test("Phase 1 migration creates required workflow tables and audit controls", () => {
  for (const table of [
    "atlas_audit_approval_requests",
    "atlas_inbox_items",
    "atlas_audit_approvals",
    "atlas_audit_publications",
    "atlas_audit_activity_events",
  ])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  for (const column of [
    "workflow_status",
    "current_approval_request_id",
    "current_approval_id",
    "current_publication_id",
    "published_locked",
    "revision_cycle_number",
    "working_from_publication_id",
  ])
    assert.match(migration, new RegExp(`ADD COLUMN ${column}\\b`));
});

test("Phase 1 migration constrains cross-audit revision-bound relationships", () => {
  assert.match(migration, /UNIQUE \(id, audit_id\)/);
  assert.match(migration, /FOREIGN KEY \(submitted_revision_id, audit_id\)/);
  assert.match(migration, /FOREIGN KEY \(approved_revision_id, audit_id\)/);
  assert.match(migration, /FOREIGN KEY \(approval_request_id, audit_id\)/);
  assert.match(migration, /UNIQUE \(audit_id, version_number\)/);
});

test("Phase 1 migration implements deterministic non-synthetic legacy mapping", () => {
  assert.match(migration, /Requirement Gathering/);
  assert.match(migration, /Ready for Review/);
  assert.match(migration, /Complete/);
  assert.match(migration, /revision_cycle_number = 0/);
  assert.match(migration, /current_publication_id = NULL/);
  assert.doesNotMatch(
    migration,
    /INSERT INTO atlas_audit_(approval_requests|approvals|publications|activity_events)/,
  );
  assert.doesNotMatch(migration, /INSERT INTO atlas_inbox_items/);
});

test("Phase 1 migration constrains statuses, hashes, JSON objects, and state combinations", () => {
  assert.match(
    migration,
    /workflow_status IN \('Draft', 'Pending Approval', 'Approved', 'Published', 'Draft Revision'\)/,
  );
  assert.match(
    migration,
    /request_status IN \('Pending', 'Approved', 'Denied', 'Invalidated', 'Superseded'\)/,
  );
  assert.match(migration, /snapshot_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /jsonb_typeof\(snapshot\) = 'object'/);
  assert.match(migration, /atlas_publication_deletion_state_check/);
});

const canonicalMigration = readFileSync(
  resolve(
    here,
    "../.launch/migrations/20260915150000_add_canonical_review_object_metadata.sql",
  ),
  "utf8",
);
test("Package 2D.1 migration is additive and legacy compatible", () => {
  for (const column of [
    "canonical_object_key",
    "identity_version",
    "is_deleted",
    "change_type",
    "change_reason_codes",
    "prior_object_summary",
    "submitted_object_summary",
  ])
    assert.match(canonicalMigration, new RegExp(`ADD COLUMN ${column}\\b`));
  assert.doesNotMatch(canonicalMigration, /UPDATE atlas_audit_review_items/i);
  assert.doesNotMatch(
    canonicalMigration,
    /DELETE FROM atlas_audit_review_items/i,
  );
  assert.doesNotMatch(canonicalMigration, /\bBEGIN\b|\bCOMMIT\b/i);
});

const discussionMigration = readFileSync(
  resolve(
    here,
    "../.launch/migrations/20260915170000_add_persistent_audit_review_discussions.sql",
  ),
  "utf8",
);
test("Package 2D.2 creates separate persistent discussion records", () => {
  for (const table of [
    "atlas_audit_review_objects",
    "atlas_audit_review_item_objects",
    "atlas_audit_discussion_threads",
    "atlas_audit_discussion_messages",
    "atlas_audit_discussion_transitions",
  ])
    assert.match(discussionMigration, new RegExp(`CREATE TABLE ${table}\\b`));
});
test("Package 2D.2 preserves legacy notes and immutable histories", () => {
  assert.doesNotMatch(discussionMigration, /UPDATE atlas_audit_review_items/i);
  assert.doesNotMatch(
    discussionMigration,
    /INSERT INTO atlas_audit_discussion_messages[\s\S]*reviewer_note/i,
  );
  assert.doesNotMatch(
    discussionMigration,
    /UPDATE atlas_audit_discussion_messages/i,
  );
  assert.doesNotMatch(
    discussionMigration,
    /UPDATE atlas_audit_discussion_transitions/i,
  );
  assert.doesNotMatch(
    discussionMigration.slice(
      0,
      discussionMigration.indexOf("-- migrate:down"),
    ),
    /\bBEGIN\b|\bCOMMIT\b/i,
  );
});
test("Package 2D.2 constrains audit scoped relationships and one thread per object", () => {
  assert.match(
    discussionMigration,
    /UNIQUE \(audit_id, canonical_object_key, identity_version\)/,
  );
  assert.match(discussionMigration, /UNIQUE \(review_object_id\)/);
  assert.match(
    discussionMigration,
    /FOREIGN KEY \(review_object_id, audit_id\)/,
  );
  assert.match(discussionMigration, /FOREIGN KEY \(thread_id, audit_id\)/);
});
const runsMigration = readFileSync(
  resolve(
    here,
    "../.launch/migrations/20261116120000_create_atlas_audit_runs.sql",
  ),
  "utf8",
);
const runsUp = runsMigration.slice(0, runsMigration.indexOf("-- migrate:down"));
test("File Utility run history is one additive, audit scoped table", () => {
  assert.match(runsUp, /CREATE TABLE IF NOT EXISTS atlas_audit_runs\b/);
  assert.match(runsUp, /FOREIGN KEY \(revision_id, audit_id\)/);
  assert.match(runsUp, /FOREIGN KEY \(publication_id, audit_id\)/);
  assert.match(
    runsUp,
    /status IN \('running', 'succeeded', 'failed', 'blocked'\)/,
  );
  assert.match(runsUp, /CHECK \(is_draft OR publication_id IS NOT NULL\)/);
  assert.doesNotMatch(
    runsUp,
    /\b(ALTER TABLE|UPDATE atlas_\w+|INSERT INTO|DELETE FROM)\b/i,
  );
  assert.doesNotMatch(runsUp, /\bBEGIN\b|\bCOMMIT\b/i);
  assert.match(runsMigration, /DROP TABLE IF EXISTS atlas_audit_runs/);
});
const runVersionsMigration = readFileSync(
  resolve(
    here,
    "../.launch/migrations/20261119120000_add_atlas_audit_run_step_type_versions.sql",
  ),
  "utf8",
);
const [runVersionsUp, runVersionsDown] =
  runVersionsMigration.split("-- migrate:down");
test("runs record their step type versions in one nullable column", () => {
  assert.match(
    runVersionsUp,
    /ALTER TABLE atlas_audit_runs\s+ADD COLUMN IF NOT EXISTS step_type_versions jsonb,/,
  );
  // Nullable with no default: older runs and older File Utility builds
  // leave it empty rather than claiming no step types were used.
  assert.doesNotMatch(runVersionsUp, /step_type_versions jsonb NOT NULL/);
  assert.doesNotMatch(runVersionsUp, /DEFAULT/);
  assert.match(
    runVersionsUp,
    /CHECK \(step_type_versions IS NULL OR jsonb_typeof\(step_type_versions\) = 'object'\)/,
  );
  assert.doesNotMatch(
    runVersionsUp,
    /\b(UPDATE atlas_\w+|INSERT INTO|DELETE FROM|DROP)\b/i,
  );
  assert.doesNotMatch(runVersionsUp, /\bBEGIN\b|\bCOMMIT\b/i);
  assert.match(
    runVersionsDown,
    /DROP CONSTRAINT IF EXISTS ck_atlas_audit_runs_step_type_versions_object/,
  );
  assert.match(runVersionsDown, /DROP COLUMN IF EXISTS step_type_versions/);
});
test("rejects a prototype replacement header", () => {
  const headers = [...FIELD_LIBRARY_COLUMNS];
  headers[0] = "__proto__";

  assert.throws(
    () => parseAndValidateCsv(csv([validRow], headers)),
    CsvValidationError,
  );
});
