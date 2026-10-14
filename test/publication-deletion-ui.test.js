import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(
    new URL("../js/26-recently-deleted-publications.js", import.meta.url),
    "utf8",
  ),
  workflow = readFileSync(
    new URL("../js/24-audit-workflow-ui.js", import.meta.url),
    "utf8",
  );
test("delete UI is capability driven and sends exact confirmation fields", () => {
  assert.match(workflow, /canDeletePublication/);
  for (const value of ["expectedPublicationId", "expectedRevisionId", "reason"])
    assert.ok(ui.includes(value), value);
});
test("delete UI is separate from audit archive", () => {
  assert.doesNotMatch(ui, /archiveAudit|Deleted Items|atlasArchive/);
});
test("first release has no permanent delete or restore action", () => {
  assert.doesNotMatch(
    ui,
    /permanent-delete|restore-publication|undo-publication/,
  );
});
