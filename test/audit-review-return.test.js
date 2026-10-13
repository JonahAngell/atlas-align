import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const repository = fs.readFileSync(
  new URL("../src/audit-review-repository.js", import.meta.url),
  "utf8",
);
const sql = fs.readFileSync(
  new URL(
    "../sql/audit-review-repository/deny-approval-request.sql",
    import.meta.url,
  ),
  "utf8",
);
test("return remains transactional and available for every active Draft review", () => {
  assert.match(repository, /returnEligible: true/);
  assert.match(repository, /earlyReturnEligible: true/);
  assert.doesNotMatch(repository, /early\s*\?\s*summary\.earlyReturnEligible/);
  assert.match(repository, /ROLLBACK/);
});
test("structured return records the effective reviewer and checks the request update", () => {
  assert.match(repository, /const actor = reviewActor\(user\)/);
  assert.match(repository, /actor\.userId/);
  assert.match(repository, /actor\.username/);
  assert.match(repository, /deniedRequest\.rowCount !== 1/);
});
test("structured return SQL uses the approval-request schema", () => {
  assert.match(sql, /decision_actor_user_id = \$2/);
  assert.match(sql, /decision_actor_username = \$3/);
  assert.match(sql, /decision_at = now\(\)/);
  assert.match(sql, /updated_at = now\(\)/);
  assert.match(sql, /reviewer_response = 'Returned through item-level review'/);
  assert.match(sql, /request_status = 'Pending'/);
  assert.match(sql, /RETURNING id/);
  assert.doesNotMatch(sql, /decided_at/);
});
