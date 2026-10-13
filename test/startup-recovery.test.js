import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const state = readFileSync(
  new URL("../js/01-state-dom.js", import.meta.url),
  "utf8",
);
const persistence = readFileSync(
  new URL("../js/04-persistence.js", import.meta.url),
  "utf8",
);
const bootstrap = readFileSync(
  new URL("../js/06-events-bootstrap.js", import.meta.url),
  "utf8",
);
const database = readFileSync(
  new URL("../js/18-audit-database.js", import.meta.url),
  "utf8",
);

test("startup readiness is explicit and independent from audit selection", () => {
  assert.match(state, /startupReady: false/);
  assert.match(state, /document\.body\.dataset\.atlasReady/);
  assert.match(bootstrap, /atlasSetApplicationReady\(false\)/);
  assert.match(bootstrap, /atlasSetApplicationReady\(true\)/);
  assert.ok(
    bootstrap.indexOf('showSection("my-audits")') <
      bootstrap.indexOf("atlasSetApplicationReady(true)"),
  );
});

test("startup inspects recovery without silently applying it", () => {
  assert.match(persistence, /function inspectAutosaveRecovery\(/);
  assert.match(persistence, /function atlasIsMeaningfulRecoveryRecord\(/);
  assert.match(persistence, /function atlasApplyRecoveryCandidate\(/);
  assert.match(bootstrap, /await inspectAutosaveRecovery\(\)/);
  assert.doesNotMatch(bootstrap, /await restoreAutosave\(\)/);
});

test("new audit selection follows an accepted POST response", () => {
  assert.match(database, /async function atlasCreateAuditDocument\(/);
  assert.match(database, /await atlasAuditApi\("\/api\/audits"/);
  assert.match(database, /atlasApplyLoadedAudit\(payload, "database"/);
  assert.ok(
    database.indexOf('await atlasAuditApi("/api/audits"') <
      database.indexOf('atlasApplyLoadedAudit(payload, "database"'),
  );
  assert.match(
    bootstrap,
    /await atlasCreateAuditDocument\(candidate, "Created audit"\)/,
  );
});
