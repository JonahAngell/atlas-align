import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignmentProfiles } from "../src/audit-repository.js";
import { upsertUserProfilesWithClient } from "../src/user-profile-repository.js";

const routesSource = readFileSync(
  new URL("../src/user-profile-routes.js", import.meta.url),
  "utf8",
);

test("Disney directory route is read-only", () => {
  const start = routesSource.indexOf('router.get("/directory"');
  const end = routesSource.indexOf('router.post("/resolve"', start);
  const route = routesSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(route, /upsertUserProfiles|BEGIN|INSERT|UPDATE|DELETE/);
  assert.match(route, /studioShareJson/);
  assert.match(route, /res\.json\(\{ \.\.\.payload, items \}\)/);
});

test("assignment profiles are normalized and deduplicated across roles", () => {
  const profiles = assignmentProfiles({
    assigned: [{ id: "1", username: "ALPHA", fullName: "Alpha One" }],
    backup: [{ id: "1", username: "alpha", fullName: "Alpha One" }],
    developer: [
      { id: "2", username: "beta", fullName: "Beta Two" },
      { id: "", username: "legacy" },
    ],
  });
  assert.deepEqual(
    profiles.map(({ id, username }) => ({ id, username })),
    [
      { id: "1", username: "ALPHA" },
      { id: "2", username: "beta" },
    ],
  );
});

test("client-scoped profile upsert does not open or commit an independent transaction", async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      return { rows: [] };
    },
  };
  const profiles = await upsertUserProfilesWithClient(client, [
    { id: "1", username: "alpha", fullName: "Alpha One" },
  ]);
  assert.equal(profiles.length, 1);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /INSERT INTO atlas_user_profiles/);
  assert.doesNotMatch(statements.join("\n"), /BEGIN|COMMIT|ROLLBACK/);
});

test("audit save invokes assignment profile upsert before commit", () => {
  const source = readFileSync(
    new URL("../src/audit-repository.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("export async function saveAudit");
  const end = source.indexOf("export async function listAuditRevisions", start);
  const save = source.slice(start, end);
  const upsert = save.lastIndexOf("await upsertUserProfilesWithClient(");
  const commit = save.lastIndexOf('await client.query("COMMIT")');
  assert.ok(upsert >= 0);
  assert.ok(commit > upsert);
  assert.match(save, /assignmentProfiles\(document\.assignments\)/);
  assert.match(save, /catch \(error\) \{[\s\S]*ROLLBACK/);
});
