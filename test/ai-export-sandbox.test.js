import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportAuditCode } from "../src/ai/code/export-sandbox.js";

const load = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("the server export matches the shape the browser writes", () => {
  const audit = load("audits/dcl-loa-90-day.json");
  const before = JSON.stringify(audit);
  const { sql, python } = exportAuditCode(audit);
  assert.match(sql, /^-- DCL LOA 90 Day - SQL Server audit query/);
  assert.match(sql, /\nWITH\n/);
  assert.match(sql, /step_1 AS \(\n {2}SELECT \* FROM \[HI0256_Maseke\]/);
  assert.match(python, /^# DCL LOA 90 Day - Python \(pandas\) audit script/);
  assert.match(python, /import pandas as pd/);
  assert.equal(JSON.stringify(audit), before, "the audit is not changed");
});

test("the DIESI notebook import exports in both dialects", () => {
  const audit = load(
    "docs/audit-imports/diesi-sapl-infotypes-missing-notebook.json",
  );
  const { sql, python } = exportAuditCode(audit);
  assert.ok(sql.length > 1000);
  assert.ok(python.length > 1000);
  assert.doesNotMatch(sql + python, /undefined|\[object Object\]/);
});

test("an audit with no steps still exports", () => {
  const { sql, python } = exportAuditCode({ name: "Empty", steps: [] });
  assert.equal(typeof sql, "string");
  assert.equal(typeof python, "string");
});
