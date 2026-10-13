import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeUserRoleSlugs,
  profileRoleSnapshotIsFresh,
  roleRefreshStatusForError,
  USER_ROLE_REFRESH_MAX_AGE_MS,
} from "../src/studioshare-role-refresh.js";

test("normalizes nested and direct role slugs deterministically", () => {
  assert.deepEqual(
    normalizeUserRoleSlugs([
      { id: "assignment-1", role: { id: "role-1", slug: "z-role" } },
      { slug: "a-role" },
      { role: { slug: "z-role" } },
      { role: { id: "opaque-only" } },
    ]),
    ["a-role", "z-role"],
  );
});

test("accepts documented items wrapper and verified empty collection", () => {
  assert.deepEqual(
    normalizeUserRoleSlugs({ items: [{ role: { slug: "admin" } }] }),
    ["admin"],
  );
  assert.deepEqual(normalizeUserRoleSlugs([]), []);
});

test("rejects unrecognized role response instead of fabricating an empty result", () => {
  assert.throws(() => normalizeUserRoleSlugs({ roles: [] }), /Unrecognized/);
});

test("freshness requires a verified status and recent timestamp", () => {
  const now = Date.now();
  assert.equal(
    profileRoleSnapshotIsFresh(
      {
        roleResolutionStatus: "resolved",
        lastRoleResolvedAt: new Date(now - 1000).toISOString(),
      },
      now,
    ),
    true,
  );
  assert.equal(
    profileRoleSnapshotIsFresh(
      {
        roleResolutionStatus: "resolved_empty",
        lastRoleResolvedAt: new Date(
          now - USER_ROLE_REFRESH_MAX_AGE_MS - 1,
        ).toISOString(),
      },
      now,
    ),
    false,
  );
  assert.equal(
    profileRoleSnapshotIsFresh(
      {
        roleResolutionStatus: "unavailable",
        lastRoleResolvedAt: new Date(now).toISOString(),
      },
      now,
    ),
    false,
  );
});

test("maps protected failure classes without exposing response bodies", () => {
  assert.equal(roleRefreshStatusForError({ status: 401 }), "forbidden");
  assert.equal(roleRefreshStatusForError({ status: 403 }), "forbidden");
  assert.equal(roleRefreshStatusForError({ status: 404 }), "not_found");
  assert.equal(roleRefreshStatusForError({ status: 429 }), "unavailable");
  assert.equal(roleRefreshStatusForError({ status: 500 }), "unavailable");
});
