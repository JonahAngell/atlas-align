import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lockAuditRevision,
  unlockPublishedAudit,
} from "../src/audit-workflow-repository.js";

const sql = (name) =>
  readFileSync(
    new URL(`../sql/audit-workflow-repository/${name}.sql`, import.meta.url),
    "utf8",
  );
const SQL = {
  lockAudit: sql("lock-audit"),
  lockSession: sql("lock-draft-review-session-for-rescind"),
  rescindSession: sql("rescind-review-session"),
  invalidateRequest: sql("invalidate-pending-approval-request"),
  resolveInbox: sql("resolve-actionable-inbox-items"),
  lockApproval: sql("lock-approval-for-publication"),
  lockRevision: sql("create-lock-revision"),
  nextVersion: sql("next-publication-version"),
  lockPublication: sql("create-lock-publication"),
  setLocked: sql("set-audit-locked"),
  activity: sql("record-audit-activity"),
  shareLock: sql("share-lock-current-revision"),
  unlockRevision: sql("create-unlock-revision"),
  setDraftRevision: sql("set-audit-draft-revision"),
  publicationVersion: sql("get-publication-version"),
};

const analyst = {
  id: "analyst",
  username: "analyst",
  roles: ["atlas-admin-team"],
  roleResolutionStatus: "resolved",
};
const verifyUser = async () => analyst;

function auditRow(overrides = {}) {
  return {
    id: "audit-1",
    workflow_status: "Draft",
    current_revision_id: 10,
    current_revision_number: 3,
    current_approval_request_id: null,
    current_approval_id: null,
    current_publication_id: null,
    document: {
      id: "audit-1",
      status: "Requirement Gathering",
      assignments: { assigned: [{ id: "analyst", username: "analyst" }] },
    },
    ...overrides,
  };
}

/** A pool whose client answers each statement by its SQL file. */
function fakePool(row, extra = {}) {
  const queries = [];
  const answer = (text, params) => {
    if (text === SQL.lockAudit) return { rowCount: 1, rows: [row] };
    if (text === SQL.lockSession)
      return extra.session
        ? { rowCount: 1, rows: [{ id: 55 }] }
        : { rowCount: 0, rows: [] };
    if (text === SQL.invalidateRequest)
      return { rowCount: 1, rows: [{ id: params[0] }] };
    if (text === SQL.lockApproval)
      return {
        rowCount: 1,
        rows: [
          {
            id: 70,
            approval_status: "Active",
            approving_user_id: "reviewer",
            approving_username: "reviewer",
          },
        ],
      };
    if (text === SQL.lockRevision || text === SQL.unlockRevision)
      return { rowCount: 1, rows: [{ id: 11, revision_number: 4 }] };
    if (text === SQL.nextVersion) return { rowCount: 1, rows: [{ next: 2 }] };
    if (text === SQL.lockPublication)
      return { rowCount: 1, rows: [{ id: 90 }] };
    if (text === SQL.shareLock)
      return {
        rowCount: 1,
        rows: [{ document: { ...row.document }, document_sha256: "x" }],
      };
    if (text === SQL.publicationVersion)
      return { rowCount: 1, rows: [{ version_number: 2 }] };
    return { rowCount: 1, rows: [] };
  };
  return {
    queries,
    async connect() {
      return {
        async query(text, params = []) {
          queries.push({ text, params });
          return answer(text, params);
        },
        release() {},
      };
    },
  };
}
const find = (pool, text) => pool.queries.filter((q) => q.text === text);

test("locking a draft publishes a Complete Manual snapshot and locks the audit", async () => {
  const pool = fakePool(auditRow());
  const result = await lockAuditRevision(pool, {
    auditId: "audit-1",
    expectedRevisionId: 10,
    user: analyst,
    verifyUser,
  });
  assert.equal(pool.queries[0].text, "BEGIN");
  assert.equal(pool.queries.at(-1).text, "COMMIT");
  const [revision] = find(pool, SQL.lockRevision);
  assert.equal(JSON.parse(revision.params[3]).status, "Complete");
  assert.equal(revision.params[1], 4, "the lock revision follows the current one");
  const [publication] = find(pool, SQL.lockPublication);
  assert.match(SQL.lockPublication, /'Manual'/);
  assert.equal(publication.params[4], null, "no approval backs a draft lock");
  assert.equal(JSON.parse(publication.params[5]).status, "Complete");
  assert.equal(publication.params[5], revision.params[3]);
  const [locked] = find(pool, SQL.setLocked);
  assert.deepEqual(locked.params, ["audit-1", 11, 4, 90, null, null]);
  const [activity] = find(pool, SQL.activity);
  assert.equal(activity.params[1], "audit.locked");
  assert.equal(find(pool, SQL.invalidateRequest).length, 0);
  assert.deepEqual(result.publication, { id: 90, versionNumber: 2 });
  assert.equal(result.workflowStatus, "Published");
});

test("locking a pending audit invalidates the request and closes the review session", async () => {
  const pool = fakePool(
    auditRow({
      workflow_status: "Pending Approval",
      current_approval_request_id: 40,
    }),
    { session: true },
  );
  await lockAuditRevision(pool, {
    auditId: "audit-1",
    expectedRevisionId: 10,
    user: analyst,
    verifyUser,
  });
  const [invalidated] = find(pool, SQL.invalidateRequest);
  assert.equal(invalidated.params[0], 40);
  assert.equal(invalidated.params[4], "Audit locked");
  assert.equal(find(pool, SQL.resolveInbox).length, 1);
  assert.deepEqual(find(pool, SQL.rescindSession)[0].params, [55]);
  assert.deepEqual(find(pool, SQL.setLocked)[0].params.slice(4), [null, null]);
});

test("locking an approved audit keeps the active approval as the source", async () => {
  const pool = fakePool(
    auditRow({
      workflow_status: "Approved",
      current_approval_request_id: 40,
      current_approval_id: 70,
    }),
  );
  await lockAuditRevision(pool, {
    auditId: "audit-1",
    expectedRevisionId: 10,
    user: analyst,
    verifyUser,
  });
  const [publication] = find(pool, SQL.lockPublication);
  assert.equal(publication.params[4], 70);
  assert.equal(publication.params[9], "reviewer");
  assert.deepEqual(find(pool, SQL.setLocked)[0].params.slice(4), [40, 70]);
});

test("locking rejects a stale revision, an already locked audit, and non-admin users", async () => {
  await assert.rejects(
    lockAuditRevision(fakePool(auditRow()), {
      auditId: "audit-1",
      expectedRevisionId: 9,
      user: analyst,
      verifyUser,
    }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    lockAuditRevision(
      fakePool(
        auditRow({ workflow_status: "Published", current_publication_id: 90 }),
      ),
      { auditId: "audit-1", expectedRevisionId: 10, user: analyst, verifyUser },
    ),
    /already locked/,
  );
  const viewer = { ...analyst, roles: [] };
  const pool = fakePool(auditRow());
  await assert.rejects(
    lockAuditRevision(pool, {
      auditId: "audit-1",
      expectedRevisionId: 10,
      user: viewer,
      verifyUser: async () => viewer,
    }),
    (error) => error.status === 403,
  );
  assert.equal(pool.queries.at(-1).text, "ROLLBACK");
  assert.equal(find(pool, SQL.lockRevision).length, 0);
});

test("unlocking requires a reason, returns Status to Draft, and records the reason", async () => {
  const locked = auditRow({
    workflow_status: "Published",
    current_publication_id: 90,
    document: { id: "audit-1", status: "Complete", assignments: {} },
  });
  await assert.rejects(
    unlockPublishedAudit(fakePool(locked), {
      auditId: "audit-1",
      expectedRevisionId: 10,
      expectedPublicationId: 90,
      reason: "  ",
      user: analyst,
      verifyUser,
    }),
    /reason is required/,
  );
  const pool = fakePool(locked);
  const result = await unlockPublishedAudit(pool, {
    auditId: "audit-1",
    expectedRevisionId: 10,
    expectedPublicationId: 90,
    reason: "Correct a field name",
    user: analyst,
    verifyUser,
  });
  const [revision] = find(pool, SQL.unlockRevision);
  assert.equal(JSON.parse(revision.params[3]).status, "Draft");
  assert.match(revision.params[4], /^[0-9a-f]{64}$/);
  assert.equal(revision.params[5], "Correct a field name");
  const [activity] = find(pool, SQL.activity);
  assert.equal(activity.params[1], "audit.published_unlocked");
  assert.equal(activity.params[13], "Correct a field name");
  assert.equal(result.workflowStatus, "Draft Revision");
});
