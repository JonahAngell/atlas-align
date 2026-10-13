import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);
test("draft save uses atomic concurrency and releases before refresh", () => {
  const body = source.slice(
    source.indexOf("export async function saveAuditReview"),
    source.indexOf("export async function bulkApproveAuditReview"),
  );
  assert.match(body, /draft_version=\$2::bigint/);
  assert.match(body, /RETURNING draft_version/);
  assert.match(body, /RETURNING id/);
  assert.ok(
    body.indexOf("c.release()") < body.indexOf("return getAuditReview"),
  );
});
test("draft save validates direct items and required notes", () => {
  assert.match(source, /Generated review items cannot be decided directly/);
  assert.match(source, /A reviewer note is required for this decision/);
});
