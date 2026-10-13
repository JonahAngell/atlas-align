import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAndValidateCsv,
  CsvValidationError,
} from "../src/field-library.js";
import { FIELD_LIBRARY_COLUMNS } from "../src/schema.js";

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
  assert.doesNotMatch(discussionMigration, /\bBEGIN\b|\bCOMMIT\b/i);
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
test("rejects a prototype replacement header", () => {
  const headers = [...FIELD_LIBRARY_COLUMNS];
  headers[0] = "__proto__";

  assert.throws(
    () => parseAndValidateCsv(csv([validRow], headers)),
    CsvValidationError,
  );
});
