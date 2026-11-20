import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ingestCode } from "../src/ai/code/ingest.js";
import { findSecrets, maskCode } from "../src/ai/code/scan.js";
import { pythonFacts, sqlFacts } from "../src/ai/code/facts/index.js";

const G1 = new URL("fixtures/code-import/g1/", import.meta.url);
const read = (file) => readFileSync(new URL(file, G1), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("G1 lists every exported audit with its expected answer", () => {
  assert.equal(manifest.tier, "G1");
  assert.ok(manifest.scripts.length >= 9);
  for (const entry of manifest.scripts) {
    const audit = JSON.parse(read(entry.expected));
    assert.equal(audit.steps.length, entry.steps, entry.id);
    assert.ok(read(entry.sql).startsWith("-- "), entry.id);
    assert.ok(read(entry.python).startsWith("# "), entry.id);
  }
});

test("G1 scripts hold no credentials, emails or home paths", () => {
  for (const entry of manifest.scripts)
    for (const file of [entry.sql, entry.python]) {
      const ingested = ingestCode([{ name: file, text: read(file) }]);
      assert.deepEqual(findSecrets(ingested), [], file);
      const { counts } = maskCode(ingested);
      assert.equal(counts.email ?? 0, 0, file);
      assert.equal(counts.home_path ?? 0, 0, file);
      assert.equal(counts.phone ?? 0, 0, file);
    }
});

test("G1 scripts read back with one data set per exported step", () => {
  for (const entry of manifest.scripts) {
    const sql = read(entry.sql);
    const ctes = (sql.match(/^step_\w+ AS \(/gm) || []).length;
    assert.equal(sqlFacts(sql).datasets.length, ctes, entry.id);
    const py = pythonFacts(read(entry.python));
    assert.deepEqual(py.flags, [], entry.id);
  }
});
