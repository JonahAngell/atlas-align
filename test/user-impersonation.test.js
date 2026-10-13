import assert from "node:assert/strict";
import test from "node:test";
import {
  hashImpersonationToken,
  userImpersonationEnabled,
  effectiveUserFromSession,
} from "../src/user-impersonation.js";

test("impersonation flag fails closed", () => {
  assert.equal(userImpersonationEnabled({}), false);
  assert.equal(
    userImpersonationEnabled({ ATLAS_USER_IMPERSONATION_ENABLED: "false" }),
    false,
  );
  assert.equal(
    userImpersonationEnabled({ ATLAS_USER_IMPERSONATION_ENABLED: "true" }),
    true,
  );
});
test("token hashing is deterministic and does not return the token", () => {
  assert.equal(
    hashImpersonationToken("token"),
    hashImpersonationToken("token"),
  );
  assert.notEqual(hashImpersonationToken("token"), "token");
  assert.equal(hashImpersonationToken("token").length, 64);
});
test("effective identity uses persisted roles and retains authenticated actor", () => {
  const effective = effectiveUserFromSession(
    {
      effectiveProfileId: "p2",
      username: "other",
      fullName: "Other",
      roleSlugs: [],
      roleResolutionStatus: "resolved_empty",
    },
    { id: "p1", username: "real" },
  );
  assert.equal(effective.id, "p2");
  assert.deepEqual(effective.resolvedRoleSlugs, []);
  assert.equal(effective.roleResolutionStatus, "resolved_empty");
  assert.deepEqual(effective.authenticatedActor, {
    id: "p1",
    username: "real",
  });
});
