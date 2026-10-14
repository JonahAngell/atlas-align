import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(
    new URL("../sections/recently-deleted-publications.html", import.meta.url),
    "utf8",
  ),
  ui = readFileSync(
    new URL("../js/26-recently-deleted-publications.js", import.meta.url),
    "utf8",
  ),
  index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("administration page has Active and Recently Deleted regions", () => {
  assert.match(html, /Active publications/);
  assert.match(html, /Recently Deleted/);
});
test("metadata includes publisher publication and deletion fields", () => {
  for (const value of [
    "auditName",
    "publisherUsername",
    "publishedAt",
    "deletedByUsername",
    "deletedAt",
    "deletionReason",
  ])
    assert.ok(ui.includes(value), value);
});
test("deleted snapshots are rendered without editable audit assignment", () => {
  assert.match(ui, /p\.snapshot/);
  assert.doesNotMatch(ui, /state\.audit\s*=/);
  assert.doesNotMatch(
    ui,
    /capture\(|scheduleAutosave\(|atlasApplyLoadedAudit\(/,
  );
});
test("classic module loads after workflow and before bootstrap", () =>
  assert.ok(
    index.indexOf("24-audit-workflow-ui.js") <
      index.indexOf("26-recently-deleted-publications.js") &&
      index.indexOf("26-recently-deleted-publications.js") <
        index.indexOf("06-events-bootstrap.js"),
  ));
