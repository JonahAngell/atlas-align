import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const runner = readFileSync(
  new URL("../js/28-validation-runner.js", import.meta.url),
  "utf8",
);
test("validation storage is separate and authenticated-user keyed", () => {
  assert.match(runner, /atlasAlignValidation/);
  assert.match(
    runner,
    /atlas-validation:\$\{availability\.authenticatedUserId\}/,
  );
  assert.doesNotMatch(runner, /atlasAlignAuditLogicBuilder/);
  assert.match(runner, /effectiveProfileId/);
});
