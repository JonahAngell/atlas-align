import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const manifest = read("catalogs/step-types/manifest.json");
const { released } = read("test/fixtures/released-step-type-hashes.json");
const releasedHash = new Map(
  released.map((entry) => [`${entry.id}@${entry.version}`, entry.hash]),
);

// ATLAS Align imports catalogs/step-types/ into Postgres at startup and keeps
// a version it already stored, so editing a released version's file changes
// nothing in production. A changed definition needs a new version number.
test("released step type versions keep the content they were released with", () => {
  for (const entry of manifest.definitions) {
    const key = `${entry.id}@${entry.version}`;
    assert.ok(
      releasedHash.has(key),
      `${entry.id} version ${entry.version} is new: add it to test/fixtures/released-step-type-hashes.json with hash ${entry.hash}.`,
    );
    assert.equal(
      entry.hash,
      releasedHash.get(key),
      `${entry.file} changed after version ${entry.version} was released. Bump its version instead; production keeps the stored copy.`,
    );
  }
});

test("flag records is version 3, so its hidden-record fields reach production", () => {
  const entry = manifest.definitions.find((item) => item.id === "flag_records");
  assert.equal(entry.version, 3);
});
