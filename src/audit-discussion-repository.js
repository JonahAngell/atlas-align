import { withTransaction } from "./db-transaction.js";
import { fail } from "./http-error.js";
import { loadSql } from "./sql.js";

const SQL = Object.freeze({
  itemContext: loadSql(
    "../sql/audit-discussion-repository/get-item-context.sql",
    import.meta.url,
  ),
  itemContextForUpdate: loadSql(
    "../sql/audit-discussion-repository/get-item-context-for-update.sql",
    import.meta.url,
  ),
  threadContext: loadSql(
    "../sql/audit-discussion-repository/get-thread-context.sql",
    import.meta.url,
  ),
  threadContextForUpdate: loadSql(
    "../sql/audit-discussion-repository/get-thread-context-for-update.sql",
    import.meta.url,
  ),
  discussionMessages: loadSql(
    "../sql/audit-discussion-repository/get-discussion-messages.sql",
    import.meta.url,
  ),
  discussionTransitions: loadSql(
    "../sql/audit-discussion-repository/get-discussion-transitions.sql",
    import.meta.url,
  ),
  ensureReviewObjectLinks: loadSql(
    "../sql/audit-discussion-repository/ensure-review-object-links.sql",
    import.meta.url,
  ),
  isAssignedAnalyst: loadSql(
    "../sql/audit-discussion-repository/is-assigned-analyst.sql",
    import.meta.url,
  ),
  createDiscussionThread: loadSql(
    "../sql/audit-discussion-repository/create-discussion-thread.sql",
    import.meta.url,
  ),
  createInitialTransition: loadSql(
    "../sql/audit-discussion-repository/create-initial-transition.sql",
    import.meta.url,
  ),
  createInitialMessage: loadSql(
    "../sql/audit-discussion-repository/create-initial-message.sql",
    import.meta.url,
  ),
  addDiscussionMessage: loadSql(
    "../sql/audit-discussion-repository/add-discussion-message.sql",
    import.meta.url,
  ),
  updateDiscussionState: loadSql(
    "../sql/audit-discussion-repository/update-discussion-state.sql",
    import.meta.url,
  ),
  recordDiscussionTransition: loadSql(
    "../sql/audit-discussion-repository/record-discussion-transition.sql",
    import.meta.url,
  ),
});

/** Converts a value to a trimmed string, using an empty string for nullish values. */
const clean = (value) => String(value ?? "").trim();
/** Returns a normalized lowercase username, email, or ID for user matching. */
const userKey = (user) =>
  clean(user?.username || user?.email || user?.id).toLowerCase();
/** Determines whether a user matches a stored user ID or normalized username. */
const sameUser = (user, id, username) =>
  Boolean(
    (clean(user?.id) && clean(id) && clean(user.id) === clean(id)) ||
    (userKey(user) && userKey(user) === clean(username).toLowerCase()),
  );

/** Resolves the effective and authenticated actor identities recorded for discussion activity. */
function actors(user, authenticatedUser) {
  const effective = {
    userId: clean(user?.id) || null,
    username: clean(user?.username || user?.email || user?.id),
  };
  const authenticated = authenticatedUser || user?.authenticatedActor || user;
  const original = {
    userId: clean(authenticated?.id) || null,
    username: clean(
      authenticated?.username || authenticated?.email || authenticated?.id,
    ),
  };
  if (!effective.username || !original.username)
    throw fail(403, "Discussion actor identity is unavailable.");
  return { effective, authenticated: original };
}

/** Retrieves the review session, review item, canonical object, and discussion thread context for an item. */
async function itemContext(client, sessionId, itemId, lock = false) {
  const result = await client.query(
    lock ? SQL.itemContextForUpdate : SQL.itemContext,
    [sessionId, itemId],
  );
  if (!result.rowCount) throw fail(404, "Review discussion is unavailable.");
  return result.rows[0];
}

/** Retrieves a discussion thread and calculates the current user's reviewer, analyst, and approval context. */
async function threadContext(client, threadId, user, lock = false) {
  const result = await client.query(
    lock ? SQL.threadContextForUpdate : SQL.threadContext,
    [threadId, userKey(user), clean(user?.id)],
  );
  if (!result.rowCount) throw fail(404, "Review discussion is unavailable.");
  return result.rows[0];
}

/** Delegates retrieval of discussion-thread context to the shared thread context helper. */
async function getThreadContext(client, threadId, user, lock = false) {
  return threadContext(client, threadId, user, lock);
}

/** Builds the discussion response with object, thread, messages, transitions, and capabilities. */
async function discussionPayload(client, row, capabilities = {}) {
  if (!row.thread_id)
    return {
      object: row.review_object_id
        ? { id: Number(row.review_object_id) }
        : null,
      thread: null,
      messages: [],
      transitions: [],
      capabilities,
    };
  const [messages, transitions] = await Promise.all([
    client.query(SQL.discussionMessages, [row.thread_id]),
    client.query(SQL.discussionTransitions, [row.thread_id]),
  ]);
  return {
    object: { id: Number(row.review_object_id) },
    thread: {
      id: Number(row.thread_id),
      state: row.current_state,
      stateVersion: Number(row.state_version),
    },
    messages: messages.rows,
    transitions: transitions.rows,
    capabilities,
  };
}

/** Creates or updates canonical review objects and links them to review items for a session. */
export async function ensureReviewObjectLinksWithClient(client, { sessionId }) {
  const linked = await client.query(SQL.ensureReviewObjectLinks, [sessionId]);
  return linked.rowCount;
}

/** Retrieves a review item's discussion payload after verifying reviewer or assigned-analyst access. */
export async function getReviewItemDiscussions(
  pool,
  { sessionId, itemId, user },
) {
  const client = await pool.connect();
  try {
    const row = await itemContext(client, sessionId, itemId);
    const reviewer = sameUser(
      user,
      row.reviewer_user_id,
      row.reviewer_username,
    );
    let analyst = false;
    if (["Returned", "Approved"].includes(row.session_status)) {
      const assigned = await client.query(SQL.isAssignedAnalyst, [
        row.audit_id,
        userKey(user),
        clean(user?.id),
      ]);
      analyst = assigned.rows[0]?.allowed === true;
    }
    if (!reviewer && !analyst)
      throw fail(404, "Review discussion is unavailable.");
    const readOnly = row.session_status === "Approved";
    return discussionPayload(client, row, {
      canCreate: reviewer && row.session_status === "Draft" && !readOnly,
      canReply:
        !readOnly &&
        row.current_state === "Open" &&
        (reviewer || (analyst && row.session_status === "Returned")),
      canResolve: reviewer && !readOnly && row.current_state === "Open",
      canReopen: reviewer && !readOnly && row.current_state === "Resolved",
      readOnly,
    });
  } finally {
    client.release();
  }
}

/** Creates a new review-object discussion thread, initial transition, and first reviewer message. */
export async function createReviewDiscussion(
  pool,
  { sessionId, itemId, body, user, authenticatedUser },
) {
  const message = clean(body);
  if (!message || message.length > 10000)
    throw fail(
      400,
      "A discussion message between 1 and 10000 characters is required.",
    );
  return withTransaction(pool, async (client) => {
    const row = await itemContext(client, sessionId, itemId, true);
    if (
      row.session_status !== "Draft" ||
      !sameUser(user, row.reviewer_user_id, row.reviewer_username)
    )
      throw fail(403, "Only the assigned reviewer may create this discussion.");
    if (!row.canonical_object_key || !row.identity_version)
      throw fail(409, "Canonical review-object identity is unavailable.");
    await ensureReviewObjectLinksWithClient(client, { sessionId });
    const refreshed = await itemContext(client, sessionId, itemId, true);
    if (refreshed.thread_id)
      throw fail(409, "A discussion already exists for this review object.");
    const a = actors(user, authenticatedUser);
    const thread = await client.query(SQL.createDiscussionThread, [
      refreshed.audit_id,
      refreshed.review_object_id,
      a.effective.userId,
      a.effective.username,
      a.authenticated.userId,
      a.authenticated.username,
    ]);
    if (thread.rowCount !== 1)
      throw fail(409, "A discussion already exists for this review object.");
    await client.query(SQL.createInitialTransition, [
      thread.rows[0].id,
      refreshed.audit_id,
      a.effective.userId,
      a.effective.username,
      a.authenticated.userId,
      a.authenticated.username,
    ]);
    await client.query(SQL.createInitialMessage, [
      thread.rows[0].id,
      refreshed.audit_id,
      message,
      a.effective.userId,
      a.effective.username,
      a.authenticated.userId,
      a.authenticated.username,
    ]);
    return {
      threadId: Number(thread.rows[0].id),
      state: "Open",
      stateVersion: Number(thread.rows[0].state_version),
    };
  });
}

/** Adds a reviewer or analyst reply to an accessible open discussion thread. */
export async function addDiscussionMessage(
  pool,
  { threadId, body, user, authenticatedUser },
) {
  const message = clean(body);
  if (!message || message.length > 10000)
    throw fail(
      400,
      "A discussion message between 1 and 10000 characters is required.",
    );
  return withTransaction(pool, async (client) => {
    const row = await getThreadContext(client, threadId, user, true);
    if (row.approved && !row.current_reviewer && !row.current_analyst)
      throw fail(409, "Approved review discussions are read-only.");
    if (row.current_state !== "Open")
      throw fail(409, "Reopen the discussion before adding a message.");
    const reviewer = row.current_reviewer;
    const analyst = row.current_analyst;
    if (!reviewer && !analyst)
      throw fail(403, "Discussion reply access is required.");
    const a = actors(user, authenticatedUser);
    const inserted = await client.query(SQL.addDiscussionMessage, [
      threadId,
      row.audit_id,
      message,
      reviewer ? "Reviewer" : "Analyst",
      a.effective.userId,
      a.effective.username,
      a.authenticated.userId,
      a.authenticated.username,
    ]);
    return {
      id: Number(inserted.rows[0].id),
      createdAt: inserted.rows[0].createdAt,
    };
  });
}

/** Changes a discussion thread state with reviewer authorization and optimistic version checking. */
async function transition(
  pool,
  { threadId, expectedStateVersion, targetState, user, authenticatedUser },
) {
  return withTransaction(pool, async (client) => {
    const row = await getThreadContext(client, threadId, user, true);
    if (row.approved && !row.current_reviewer)
      throw fail(409, "Approved review discussions are read-only.");
    if (!row.current_reviewer)
      throw fail(
        403,
        "Only the assigned reviewer may change discussion state.",
      );
    if (Number(row.state_version) !== Number(expectedStateVersion))
      throw fail(409, "Discussion state changed in another session.", {
        stateVersion: Number(row.state_version),
      });
    if (row.current_state === targetState)
      throw fail(409, `Discussion is already ${targetState.toLowerCase()}.`, {
        stateVersion: Number(row.state_version),
      });
    const a = actors(user, authenticatedUser);
    const updated = await client.query(SQL.updateDiscussionState, [
      threadId,
      targetState,
      expectedStateVersion,
    ]);
    if (updated.rowCount !== 1)
      throw fail(409, "Discussion state changed in another session.");
    await client.query(SQL.recordDiscussionTransition, [
      threadId,
      row.audit_id,
      row.current_state,
      targetState,
      a.effective.userId,
      a.effective.username,
      a.authenticated.userId,
      a.authenticated.username,
    ]);
    return {
      threadId: Number(threadId),
      state: targetState,
      stateVersion: Number(updated.rows[0].state_version),
    };
  });
}
/** Resolves a discussion by transitioning its state to Resolved. */
export const resolveDiscussion = (pool, options) =>
  transition(pool, { ...options, targetState: "Resolved" });
/** Reopens a discussion by transitioning its state to Open. */
export const reopenDiscussion = (pool, options) =>
  transition(pool, { ...options, targetState: "Open" });
