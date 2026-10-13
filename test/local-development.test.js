import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalAppEnv,
  localSignedInUser,
  verifiedStoredRoles,
} from "../src/local-development.js";

test("local mode is fail closed", () => {
  assert.equal(isLocalAppEnv({}), false);
  assert.equal(isLocalAppEnv({ ATLAS_APP_ENV: "" }), false);
  assert.equal(isLocalAppEnv({ ATLAS_APP_ENV: "preview" }), false);
  assert.equal(isLocalAppEnv({ ATLAS_APP_ENV: "production" }), false);
  assert.equal(isLocalAppEnv({ STUDIOSHARE_APP_ENV: "local" }), false);
  assert.equal(isLocalAppEnv({ ATLAS_APP_ENV: " local " }), true);
});

test("local mode returns the development user with no token", () => {
  const user = localSignedInUser({ ATLAS_APP_ENV: "local" });
  assert.equal(user.id, "local-user-1");
  assert.equal(user.username, "local.user");
  assert.equal(user.fullName, "Local Test User");
  assert.equal(user.disabled, false);
  assert.deepEqual(user.roles, ["atlas-admin-team", "atlas-align-admin"]);
  assert.deepEqual(user.resolvedRoleSlugs, [
    "atlas-admin-team",
    "atlas-align-admin",
  ]);
  assert.equal(user.roleResolutionStatus, "embedded");
});

test("DEV_USER_ID selects the signed-in local user", () => {
  const user = localSignedInUser({
    ATLAS_APP_ENV: "local",
    DEV_USER_ID: "local-user-2",
  });
  assert.equal(user.id, "local-user-2");
  assert.equal(user.username, "local.reviewer");
});

test("an unsigned request is refused outside local mode", () => {
  assert.equal(localSignedInUser({}), null);
  assert.equal(localSignedInUser({ ATLAS_APP_ENV: "preview" }), null);
  assert.equal(localSignedInUser({ STUDIOSHARE_APP_ENV: "local" }), null);
});

test("local mode trusts a stored resolved role snapshot", () => {
  assert.deepEqual(
    verifiedStoredRoles({
      roleResolutionStatus: "resolved",
      roleSlugs: ["atlas-admin-team", "atlas-admin-team"],
    }),
    { roles: ["atlas-admin-team"], roleResolutionStatus: "resolved" },
  );
  assert.equal(
    verifiedStoredRoles({ roleResolutionStatus: "unavailable", roleSlugs: [] }),
    null,
  );
  assert.equal(verifiedStoredRoles(null), null);
});
