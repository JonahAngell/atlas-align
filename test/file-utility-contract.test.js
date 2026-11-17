import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const contractUrl = new URL(
  "../catalogs/file-utility/executable-steps.json",
  import.meta.url,
);

// The SHA-256 of catalogs/file-utility/executable-steps.json. That file is a
// byte-for-byte copy of atlas/executable-steps.json in File Utility
// (JonahAngell/audit-file-utility), where the same hash is pinned. Do not edit
// the copy here. To change what File Utility can run, change it there, copy the
// file over, and update this hash and the readiness rules in the same PR.
const CONTRACT_SHA256 =
  "34584e9a30845babef10fe20410358fceff17c64a419ab4c7b6cacb42173805a";

test("the File Utility contract is an unmodified copy", () => {
  const digest = createHash("sha256")
    .update(readFileSync(contractUrl))
    .digest("hex");
  assert.equal(
    digest,
    CONTRACT_SHA256,
    "executable-steps.json changed. Copy it from File Utility byte for byte and update CONTRACT_SHA256 in the same PR.",
  );
});

test("the File Utility contract has the expected shape", () => {
  const contract = JSON.parse(readFileSync(contractUrl, "utf8"));
  for (const key of ["contractVersion", "compilerVersion", "engineVersion"])
    assert.ok(contract[key] != null && contract[key] !== "", `${key} is set`);
  assert.ok(Object.keys(contract.operators).length > 0);
  for (const [operator, mapped] of Object.entries(contract.operators))
    assert.equal(
      typeof mapped,
      "string",
      `operator "${operator}" maps to a string`,
    );
  for (const key of [
    "stepTypes",
    "valueModes",
    "thenActions",
    "createColumnModes",
    "formats",
    "rounding",
    "duplicateActions",
  ])
    assert.ok(
      contract[key] && typeof contract[key] === "object",
      `${key} is an object`,
    );
  for (const key of ["blockedOperators", "runParameterTokens", "pseudoSources"])
    assert.ok(Array.isArray(contract[key]), `${key} is a list`);
});
