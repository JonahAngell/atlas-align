import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

const source = readFileSync(
  new URL("../js/16-page-shell.js", import.meta.url),
  "utf8",
);
const renderer = functionSource(
  source,
  "renderMyAudits",
  "atlasRenderAssignmentAvatar",
);

test("declares and authorizes Deleted Items mode before use", () => {
  const declaration = renderer.indexOf("deletedMode =");
  const firstConditionalUse = renderer.indexOf("deletedMode ?");
  assert.notEqual(declaration, -1);
  assert.notEqual(firstConditionalUse, -1);
  assert.ok(declaration < firstConditionalUse);
  assert.match(renderer, /requestedDeletedMode && canManageDeletedAudits/);
});

test("keeps active and deleted collections, status, and errors separate", () => {
  assert.match(
    renderer,
    /audits = deletedMode \? deletedAudits : activeAudits/,
  );
  assert.match(renderer, /state\.deletedAuditsStatus/);
  assert.match(renderer, /state\.databaseAuditsStatus/);
  assert.match(renderer, /state\.deletedAuditsError/);
  assert.match(renderer, /state\.databaseAuditsError/);
  assert.match(renderer, /all: activeAudits\.length/);
});

test("renders mode-specific actions without mixing active and deleted rows", () => {
  assert.match(renderer, /if \(deletedMode\)/);
  assert.match(renderer, /restore\.dataset\.restoreDeletedAudit/);
  assert.match(renderer, /remove\.dataset\.permanentlyDeleteAudit/);
  assert.match(renderer, /open\.dataset\.openDatabaseAudit/);
});

test("fails closed when Deleted Items is requested without capability", () => {
  assert.match(
    renderer,
    /requestedDeletedMode && !canManageDeletedAudits[\s\S]*\? "all"/,
  );
  assert.match(renderer, /filter === "deleted" && !canManageDeletedAudits/);
});
