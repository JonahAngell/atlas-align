import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizedRoleSlugs,
  sourceLibraryAccessDecision,
} from "../src/source-library-authorization.js";

test("normalizes resolved and nested StudioShare role slugs", () => {
  assert.deepEqual(
    normalizedRoleSlugs({
      resolvedRoleSlugs: ["Owner"],
      roles: [{ role: { slug: "developer" } }],
    }),
    ["owner", "developer"],
  );
});

test("does not treat opaque role identifiers as slugs", () => {
  assert.deepEqual(
    normalizedRoleSlugs({ roles: ["6a83be7d37bd59055a9410d4"] }),
    [],
  );
});

test("permits only the required owner role", () => {
  assert.equal(
    sourceLibraryAccessDecision({
      resolvedRoleSlugs: ["atlas-align-admin"],
    }).allowed,
    true,
  );
  assert.equal(
    sourceLibraryAccessDecision({ resolvedRoleSlugs: ["developer"] }).allowed,
    false,
  );
});

test("reports unavailable and malformed resolution without granting access", () => {
  assert.deepEqual(
    sourceLibraryAccessDecision({ roleResolutionStatus: "unavailable" }),
    { allowed: false, reason: "role_resolution_unavailable", roles: [] },
  );
  assert.deepEqual(
    sourceLibraryAccessDecision({ roleResolutionStatus: "malformed" }),
    { allowed: false, reason: "role_payload_malformed", roles: [] },
  );
});
