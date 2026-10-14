import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../src/routes/review-routes.js", import.meta.url),
  "utf8",
);

test("discussion routes are authenticated and workflow gated", () => {
  for (const route of [
    "/api/review-sessions/:sessionId/items/:itemId/discussions",
    "/api/review-discussions/:threadId/messages",
    "/api/review-discussions/:threadId/resolve",
    "/api/review-discussions/:threadId/reopen",
  ])
    assert.ok(source.includes(route), route);
  assert.match(source, /requireCurrentUser/);
  assert.match(source, /workflowFeature\("reads"\)/);
});

test("routes pass server identities and do not accept actor fields", () => {
  assert.match(source, /user: req\.studioshareUser/);
  assert.match(source, /authenticatedUser: req\.authenticatedStudioshareUser/);
  assert.doesNotMatch(source, /actorUserId: req\.body/);
  assert.doesNotMatch(source, /actorUsername: req\.body/);
});

test("ordinary APIs do not expose message or transition mutation routes", () => {
  assert.doesNotMatch(
    source,
    /(app|router)\.(put|patch|delete)\([\s\S]{0,160}review-discussions/,
  );
});
