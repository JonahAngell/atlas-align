import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  ),
  h = readFileSync(
    new URL("../sections/publication-preview.html", import.meta.url),
    "utf8",
  );
test("publication sends exact approval and revision", () => {
  assert.match(s, /expectedRevisionId/);
  assert.match(s, /expectedApprovalId/);
  assert.match(s, /versionTitle/);
});
test("publication and exports are separate", () => {
  assert.match(h, /Formal Publication/);
  assert.match(h, />Exports</);
});
