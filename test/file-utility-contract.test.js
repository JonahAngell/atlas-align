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
// (JonahAngell/audit-file-utility), where the same hash is pinned. A change
// lands as a pair: one PR here and one there, with the same file and hash,
// and the readiness rules updated in the same PR. Contract version 2 was
// written here first (Phase 9, branch 5039); File Utility takes it in 5043.
// Version 3 (Phase 10, branch 5053) was written here first too: its
// operators are generated from the operator catalog.
const CONTRACT_SHA256 =
  "b8e328c7516b80d5809c18e3d444bba71559dee8c9b616bb31c61072d6f25a9b";

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
    "compilers",
    "legacyStepTypes",
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

test("contract version 3 lists each compiler and whether it changes rows", () => {
  const contract = JSON.parse(readFileSync(contractUrl, "utf8"));
  assert.equal(contract.contractVersion, 3);
  assert.equal(
    contract.stepTypes,
    undefined,
    "stepTypes is now legacyStepTypes",
  );
  for (const [name, compiler] of Object.entries(contract.compilers))
    assert.equal(
      typeof compiler.changesRows,
      "boolean",
      `compiler "${name}" says whether it changes rows`,
    );
});
