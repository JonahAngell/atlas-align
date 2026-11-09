import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/audit-repository.js", import.meta.url),
  "utf8",
);
test("ordinary no-op saves remain before workflow invalidation", () => {
  const save = source.slice(
    source.indexOf("export async function saveAudit"),
    source.indexOf("export async function listAuditRevisions"),
  );
  assert.ok(
    save.indexOf("document_sha256 === hash") <
      save.indexOf("invalidateWorkflowAuthorityWithClient"),
  );
});
test("audit restoration locks, verifies, and writes in one transaction", () => {
  const body = source.slice(
    source.indexOf("export async function restoreAuditRevision"),
    source.indexOf("export async function listStepRevisions"),
  );
  assert.ok(
    body.indexOf('client.query("BEGIN")') <
      body.indexOf("lockRestorationAudit"),
  );
  assert.ok(
    body.indexOf("lockRestorationAudit") <
      body.indexOf("verifyRestorationPreviewWithClient"),
  );
  assert.ok(
    body.indexOf("verifyRestorationPreviewWithClient") <
      body.indexOf("persistRestorationWithClient"),
  );
  assert.match(body, /client\.query\("COMMIT"\)/);
});
test("step restoration uses the signed placement and preserves unrelated steps", () => {
  const body = source.slice(
    source.indexOf("export async function restoreStepRevision"),
    source.indexOf("export async function archiveAudit"),
  );
  assert.match(body, /verified\.placementAdjustment/);
  assert.match(body, /document\.steps\[index\] = restoredStep/);
  assert.match(body, /document\.steps\.push\(restoredStep\)/);
  assert.doesNotMatch(body, /placementAdjustment\s*=/);
});
test("equal-content restoration returns unchanged without invalidation", () => {
  assert.match(source, /hash === auditRow\.document_sha256/);
  assert.match(source, /status: "unchanged"/);
});
test("restoration records lineage and placement events", () => {
  assert.match(source, /"audit\.restored"/);
  assert.match(source, /"step\.restored"/);
  assert.match(source, /"step\.orphan_placement_adjusted"/);
  assert.match(source, /restoredFromStepRevisionId/);
});

test("audit creation validates custom IDs and refuses existing ones", () => {
  assert.match(source, /AUDIT_CREATE_ID = \/\^\[A-Za-z0-9_\]\{1,64\}\$\//);
  assert.match(source, /code: "AUDIT_ID_INVALID"/);
  assert.match(
    source,
    /changeType === "create" && existing\.rowCount[\s\S]*?code: "AUDIT_ID_TAKEN"/,
  );
});

function renamePool(auditRow, { takenIds = [] } = {}) {
  const queries = [];
  const client = {
    async query(text, params = []) {
      queries.push({ text, params });
      if (/FOR UPDATE/.test(text))
        return { rowCount: auditRow ? 1 : 0, rows: auditRow ? [auditRow] : [] };
      if (/^SELECT\s+1\s+FROM\s+atlas_audits/.test(text.trim()))
        return { rowCount: takenIds.includes(params[0]) ? 1 : 0, rows: [] };
      if (/INSERT INTO\s+atlas_audit_revisions/i.test(text))
        return {
          rowCount: 1,
          rows: [{ id: 42, created_at: "2026-11-09T00:00:00Z" }],
        };
      if (/document/i.test(text) && params[0] === auditRow?.current_revision_id)
        return {
          rowCount: 1,
          rows: [{ document: { id: auditRow.id, name: "Q3", steps: [] } }],
        };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return {
    pool: { connect: async () => client, query: client.query },
    queries,
  };
}
const renameRow = (overrides = {}) => ({
  id: "OldAudit",
  current_revision_id: 7,
  current_revision_number: 3,
  workflow_status: "Draft",
  published_locked: false,
  archived_at: null,
  ...overrides,
});
const renameUser = {
  id: "u1",
  username: "analyst",
  fullName: "An Analyst",
  email: "a@example.com",
};

test("renaming rejects invalid audit IDs before opening a transaction", async () => {
  const { renameAudit } = await import("../src/audit-repository.js");
  const { pool, queries } = renamePool(renameRow());
  await assert.rejects(
    renameAudit(pool, {
      auditId: "OldAudit",
      newId: "new-audit",
      expectedRevisionId: 7,
      user: renameUser,
    }),
    { status: 400, code: "AUDIT_ID_INVALID" },
  );
  assert.equal(queries.length, 0);
});

test("renaming refuses taken IDs, stale revisions, and locked audits", async () => {
  const { renameAudit } = await import("../src/audit-repository.js");
  const attempt = (row, args, options) => {
    const { pool, queries } = renamePool(row, options);
    return {
      queries,
      run: renameAudit(pool, {
        auditId: "OldAudit",
        newId: "NewAudit",
        expectedRevisionId: 7,
        user: renameUser,
        ...args,
      }),
    };
  };
  let call = attempt(renameRow(), {}, { takenIds: ["NewAudit"] });
  await assert.rejects(call.run, { status: 409, code: "AUDIT_ID_TAKEN" });
  assert.equal(call.queries.at(-1).text, "ROLLBACK");
  await assert.rejects(attempt(renameRow(), { expectedRevisionId: 6 }).run, {
    status: 409,
    currentRevisionId: 7,
  });
  await assert.rejects(
    attempt(
      renameRow({
        workflow_status: "Pending Approval",
        current_approval_request_id: 3,
      }),
    ).run,
    { status: 409, code: "AUDIT_PENDING_APPROVAL_LOCKED" },
  );
  await assert.rejects(
    attempt(renameRow({ workflow_status: "Published", published_locked: true }))
      .run,
    { status: 409, message: /Unlock the published audit/ },
  );
  await assert.rejects(attempt(null).run, { status: 404 });
});

test("renaming updates the ID, records a rename revision and activity, then commits", async () => {
  const { renameAudit } = await import("../src/audit-repository.js");
  const { pool, queries } = renamePool(renameRow());
  const result = await renameAudit(pool, {
    auditId: "OldAudit",
    newId: " NewAudit ",
    expectedRevisionId: 7,
    user: renameUser,
  });
  assert.equal(result.audit.id, "NewAudit");
  assert.deepEqual(
    { ...result.revision },
    {
      id: 42,
      number: 4,
      createdAt: "2026-11-09T00:00:00Z",
      createdByUsername: "analyst",
    },
  );
  const texts = queries.map((q) => q.text);
  const renameAt = texts.findIndex((t) =>
    /UPDATE atlas_audits\s+SET\s+id = \$2/.test(t),
  );
  const revisionAt = texts.findIndex((t) =>
    /INSERT INTO\s+atlas_audit_revisions/i.test(t),
  );
  assert.ok(renameAt > 0 && renameAt < revisionAt);
  assert.deepEqual(queries[renameAt].params, ["OldAudit", "NewAudit"]);
  assert.equal(queries[revisionAt].params[0], "NewAudit");
  assert.equal(queries[revisionAt].params[5], "rename");
  assert.ok(queries.some((q) => q.params.includes("audit.renamed")));
  assert.equal(texts.at(-1), "COMMIT");
});

test("restoring a revision saved before a rename keeps the current audit ID", () => {
  assert.match(
    source,
    /validateAudit\(\{ \.\.\.structuredClone\(document\), id: auditRow\.id \}\)/,
  );
});
