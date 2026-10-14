import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const repository = read("../src/audit-discussion-repository.js");
const itemContextForUpdate = read(
  "../sql/audit-discussion-repository/get-item-context-for-update.sql",
);
const threadContextForUpdate = read(
  "../sql/audit-discussion-repository/get-thread-context-for-update.sql",
);
const linkObjects = read(
  "../sql/audit-discussion-repository/ensure-review-object-links.sql",
);
const createThread = read(
  "../sql/audit-discussion-repository/create-discussion-thread.sql",
);
const createTransition = read(
  "../sql/audit-discussion-repository/create-initial-transition.sql",
);
const createMessage = read(
  "../sql/audit-discussion-repository/create-initial-message.sql",
);
const addMessage = read(
  "../sql/audit-discussion-repository/add-discussion-message.sql",
);
const updateState = read(
  "../sql/audit-discussion-repository/update-discussion-state.sql",
);

const compact = (value) => value.replace(/\s+/g, " ").trim();

test("discussion writes are transactional and lock only guaranteed item-context rows", () => {
  const transaction = read("../src/db-transaction.js");
  assert.match(repository, /withTransaction\(pool,/);
  assert.match(transaction, /query\("BEGIN"\)/);
  assert.match(transaction, /query\("COMMIT"\)/);
  assert.match(transaction, /query\("ROLLBACK"\)/);

  const itemLock = compact(itemContextForUpdate);
  assert.match(itemLock, /FOR UPDATE OF s, i$/);
  assert.doesNotMatch(itemLock, /FOR UPDATE OF[^;]*\b(?:o|t)\b/);
  assert.match(compact(threadContextForUpdate), /FOR UPDATE OF t$/);
});

test("review objects use canonical identity and transactional item links", () => {
  assert.match(repository, /canonical_object_key/);
  assert.match(repository, /identity_version/);
  assert.match(linkObjects, /atlas_audit_review_item_objects/);
  assert.match(
    compact(linkObjects),
    /ON CONFLICT \(audit_id, canonical_object_key, identity_version\) DO UPDATE/,
  );
  assert.doesNotMatch(linkObjects, /display_label\s*=\s*\$\d+.*WHERE/is);
});

test("concurrent thread creation uses the existing review-object uniqueness target", () => {
  assert.match(
    compact(createThread),
    /ON CONFLICT \(review_object_id\) DO NOTHING RETURNING/,
  );
  assert.match(repository, /if \(thread\.rowCount !== 1\)/);
  assert.match(
    repository,
    /A discussion already exists for this review object\./,
  );
});

test("thread, initial transition, and initial message remain one ordered transaction", () => {
  const body = repository.slice(
    repository.indexOf("export async function createReviewDiscussion"),
    repository.indexOf("export async function addDiscussionMessage"),
  );
  assert.ok(body.indexOf("SQL.createDiscussionThread") >= 0);
  assert.ok(
    body.indexOf("SQL.createDiscussionThread") <
      body.indexOf("SQL.createInitialTransition"),
  );
  assert.ok(
    body.indexOf("SQL.createInitialTransition") <
      body.indexOf("SQL.createInitialMessage"),
  );
  assert.match(createTransition, /NULL, 'Open'/);
  assert.match(createMessage, /'Reviewer'/);
});

test("messages and transitions are insert only", () => {
  const immutableWrites = [createTransition, createMessage, addMessage].join(
    "\n",
  );
  assert.match(
    immutableWrites,
    /INSERT INTO\s+atlas_audit_discussion_messages/i,
  );
  assert.match(
    immutableWrites,
    /INSERT INTO\s+atlas_audit_discussion_transitions/i,
  );
  assert.doesNotMatch(
    immutableWrites,
    /UPDATE\s+atlas_audit_discussion_messages/i,
  );
  assert.doesNotMatch(
    immutableWrites,
    /DELETE FROM\s+atlas_audit_discussion_messages/i,
  );
  assert.doesNotMatch(
    immutableWrites,
    /UPDATE\s+atlas_audit_discussion_transitions/i,
  );
  assert.doesNotMatch(
    immutableWrites,
    /DELETE FROM\s+atlas_audit_discussion_transitions/i,
  );
});

test("resolution is independent and uses optimistic state concurrency", () => {
  const stateSql = compact(updateState);
  assert.match(stateSql, /state_version = state_version \+ 1/);
  assert.match(stateSql, /state_version = \$3/);
  assert.doesNotMatch(
    repository,
    /UPDATE atlas_audit_review_items SET decision/,
  );
  assert.doesNotMatch(repository, /draft_version\s*=\s*draft_version\s*\+\s*1/);
});

test("analyst reply requires returned lineage and current assignment", () => {
  const threadSql = read(
    "../sql/audit-discussion-repository/get-thread-context.sql",
  );
  assert.match(threadSql, /session_status = 'Returned'/);
  assert.match(threadSql, /current_revision_id/);
  assert.match(threadSql, /assignments.*assigned/s);
  assert.match(threadSql, /current_analyst/);
});

test("approved discussions are read only and resolved threads require reopen", () => {
  assert.match(repository, /Approved review discussions are read-only/);
  assert.match(repository, /Reopen the discussion before adding a message/);
});

test("effective and authenticated actors are persisted separately", () => {
  assert.match(
    repository,
    /authenticatedUser \|\| user\?\.authenticatedActor \|\| user/,
  );
  assert.match(createThread, /created_by_authenticated_user_id/);
  assert.match(createTransition, /authenticated_actor_user_id/);
  assert.match(createMessage, /authenticated_actor_user_id/);
});

test("discussion reads expose capability-limited UI permissions", () => {
  assert.match(repository, /canCreate:/);
  assert.match(repository, /canReply:/);
  assert.match(repository, /canResolve:/);
  assert.match(repository, /canReopen:/);
  assert.match(repository, /readOnly,/);
  assert.match(repository, /row\.session_status === "Approved"/);
});
