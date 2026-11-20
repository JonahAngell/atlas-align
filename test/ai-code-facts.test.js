import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  codeFacts,
  pythonFacts,
  sqlFacts,
} from "../src/ai/code/facts/index.js";
import { ingestCode } from "../src/ai/code/ingest.js";
import { exportAuditCode } from "../src/ai/code/export-sandbox.js";

const fixture = (name) =>
  readFileSync(
    new URL(`fixtures/code-import/constructs/${name}`, import.meta.url),
    "utf8",
  );
const at = (facts, line) => facts.statements.filter((s) => s.line === line);
const kinds = (facts) => facts.flags.map((f) => f.kind);

test("T-SQL: batches, parameters and temp tables", () => {
  const facts = sqlFacts(fixture("tsql-handwritten.sql"));
  assert.equal(at(facts, 1)[0].kind, "use");
  assert.equal(at(facts, 2)[0].kind, "batch");
  assert.deepEqual(
    facts.params.map((p) => [p.name, p.value]),
    [
      ["@AsOf", "2026-01-31"],
      ["@Area", "2450"],
      ["@sql", undefined],
    ],
  );
  assert.deepEqual(
    facts.datasets.map((d) => [d.name, d.kind]),
    [
      ["#active", "temp"],
      ["ranked", "cte"],
      ["wd", "cte"],
    ],
  );
  assert.deepEqual(facts.identifiers.tables, [
    "PA0000",
    "PA0001",
    "Workers",
    "PA0002",
  ]);
});

test("T-SQL: SELECT INTO with joins, conditions and functions", () => {
  const [into] = at(sqlFacts(fixture("tsql-handwritten.sql")), 8);
  assert.equal(into.kind, "select_into");
  assert.equal(into.target, "#active");
  assert.deepEqual(into.from, [{ table: "PA0000", alias: "e" }]);
  assert.equal(into.joins[0].type, "inner");
  assert.deepEqual(into.joins[0].on, [
    { left: "a.PERNR", op: "=", right: "e.PERNR" },
    { left: "a.ENDDA", op: ">=", right: "@AsOf" },
  ]);
  assert.deepEqual(
    into.where.map((c) => [c.column, c.op, c.value ?? c.values, c.via ?? null]),
    [
      ["STAT2", "=", "3", null],
      ["WERKS", "=", "@Area", null],
      ["Name", "<>", "", "LTRIM"],
      ["PERSG", "not in", ["9", "X"], null],
    ],
  );
  assert.deepEqual(
    into.outputs.map((o) => o.name),
    ["PERNR", "Name", "Email"],
  );
  assert.ok(into.functions.includes("ISNULL"));
});

test("T-SQL: UPDATE with CASE stays one statement", () => {
  const [update] = at(sqlFacts(fixture("tsql-handwritten.sql")), 17);
  assert.equal(update.kind, "update");
  assert.equal(update.target, "#active");
  assert.deepEqual(update.caseTargets, ["Flag"]);
  assert.deepEqual(update.where, [
    { column: "Name", qualifier: null, op: "is not null" },
  ]);
});

test("T-SQL: a CTE chain, ROW_NUMBER dedupe and RIGHT() in a join", () => {
  const facts = sqlFacts(fixture("tsql-handwritten.sql"));
  const [main] = at(facts, 27);
  assert.deepEqual(main.dedupe, {
    keep: "first",
    partitionBy: ["PERNR"],
    orderBy: ["BEGDA"],
  });
  assert.equal(main.joins.length, 1);
  assert.equal(main.joins[0].type, "left");
  assert.equal(main.joins[0].on[0].right, "r.PERNR");
  assert.deepEqual(main.orderBy, [{ column: "PERNR", descending: true }]);
  assert.ok(!kinds(facts).includes("window"), "a dedupe window is supported");
});

test("T-SQL: unsupported constructs are flagged by line", () => {
  const flags = sqlFacts(fixture("tsql-handwritten.sql")).flags.map(
    (f) => `${f.kind}:${f.line}`,
  );
  for (const expected of [
    "top:33",
    "group_by:33",
    "apply:34",
    "dynamic_sql:36",
    "dynamic_sql:37",
    "merge:38",
    "cursor:41",
    "cursor:42",
    "pivot:43",
  ])
    assert.ok(flags.includes(expected), expected);
  const [union] = at(sqlFacts(fixture("tsql-handwritten.sql")), 44);
  assert.deepEqual(union.setOps, ["union all"]);
});

test("T-SQL: masked literals and names in brackets", () => {
  const facts = sqlFacts(
    "SELECT [a]]b] FROM [x].[dbo].[T] WHERE [PERNR] = ⟨L1⟩ AND N'it''s' = [c]",
  );
  assert.deepEqual(
    facts.statements[0].outputs.map((o) => o.name),
    ["a]b"],
  );
  assert.deepEqual(facts.identifiers.tables, ["T"]);
  assert.equal(facts.statements[0].where[0].value, "⟨L1⟩");
});

test("pandas: reads, filters, masks and query", () => {
  const facts = pythonFacts(fixture("pandas-handwritten.py"));
  const [read] = at(facts, 8);
  assert.deepEqual(
    [read.kind, read.target, read.format, read.path, read.sheet],
    ["read", "sap", "excel", "sap_pa0000.xlsx", "Data"],
  );
  assert.deepEqual(at(facts, 12)[0].conditions, [
    { column: "WERKS", op: "in", values: ["2450", "3357"] },
    { column: "Email", op: "is not null" },
  ]);
  assert.equal(at(facts, 13)[0].kind, "filter");
  assert.equal(at(facts, 14)[0].kind, "mask");
  const [masked] = at(facts, 15);
  assert.equal(masked.kind, "filter");
  assert.equal(masked.conditions[0].negated, true);
  assert.deepEqual(masked.conditions[0].via, ["strip"]);
  assert.equal(at(facts, 16)[0].query, "BTRTL == 'A100'");
});

test("pandas: column assignments, np.where and .loc", () => {
  const facts = pythonFacts(fixture("pandas-handwritten.py"));
  assert.deepEqual(at(facts, 18)[0].format, ["astype", "zfill"]);
  const [where] = at(facts, 20);
  assert.deepEqual(
    [where.kind, where.column, where.then, where.else],
    ["conditional_column", "Flag", "Missing email", ""],
  );
  const [loc] = at(facts, 21);
  assert.equal(loc.kind, "conditional_column");
  assert.deepEqual(loc.conditions, [
    { column: "ENDDA", op: "<", variable: "AS_OF" },
  ]);
  assert.deepEqual(facts.params, [
    { name: "AS_OF", line: 5, value: "2026-01-31", cell: 1 },
  ]);
});

test("pandas: merge, concat, dedupe, sort and rename", () => {
  const facts = pythonFacts(fixture("pandas-handwritten.py"));
  assert.deepEqual(at(facts, 23)[0].merge, {
    method: "merge",
    left: "sap",
    right: "wd",
    how: "left",
    on: [],
    leftOn: ["PERNR"],
    rightOn: ["Legacy_ID"],
    indicator: true,
  });
  assert.deepEqual(at(facts, 24)[0].merge.on, ["PERNR"]);
  assert.deepEqual(at(facts, 25)[0].inputs, ["sap", "wd"]);
  const [dedupe] = at(facts, 26);
  assert.deepEqual(
    [dedupe.kind, dedupe.subset, dedupe.keep, dedupe.orderBy],
    ["dedupe", ["PERNR"], "first", ["PERNR", "BEGDA"]],
  );
  assert.deepEqual(at(facts, 27)[0].renames, { Employee_ID: "Workday ID" });
  assert.equal(at(facts, 40)[0].kind, "output");
});

test("pandas: aggregation, lambdas, helpers and row loops are flagged", () => {
  const flags = pythonFacts(fixture("pandas-handwritten.py")).flags.map(
    (f) => `${f.kind}:${f.line}`,
  );
  assert.deepEqual(flags, [
    "group_by:29",
    "pivot_table:30",
    "apply:31",
    "helper:36",
    "loop:37",
  ]);
});

test("pandas: PySpark and polars are unsupported libraries", () => {
  for (const code of [
    "from pyspark.sql import SparkSession",
    "import polars as pl\ndf = pl.read_csv('x.csv')",
  ]) {
    const facts = pythonFacts(code);
    assert.ok(
      facts.flags.some((f) => f.kind === "unsupported_library"),
      code,
    );
  }
});

test("notebook cells keep their own line numbers and share masks", () => {
  const ingested = ingestCode([
    {
      name: "audit.ipynb",
      text: JSON.stringify({
        cells: [
          {
            cell_type: "code",
            source: "import pandas as pd\ndf = pd.read_csv('x.csv')",
          },
          { cell_type: "markdown", source: "Filter" },
          { cell_type: "code", source: "m = df['A'] == 'Y'\n\ndf = df[m]" },
        ],
      }),
    },
  ]);
  const { facts } = codeFacts(ingested).files[0];
  const filter = facts.statements.find((s) => s.kind === "filter");
  assert.deepEqual([filter.file, filter.cell, filter.line], ["f1", 3, 3]);
  assert.equal(filter.conditions[0].column, "A");
  assert.equal(facts.datasets[0].cell, 1);
});

// G1: every audit ATLAS can export reads back with one data set per step.
const audits = readdirSync(new URL("../audits/", import.meta.url))
  .filter((f) => f.endsWith(".json"))
  .map((f) =>
    JSON.parse(
      readFileSync(new URL(`../audits/${f}`, import.meta.url), "utf8"),
    ),
  )
  .filter((a) => (a.steps || []).length);

test("G1: ATLAS's own SQL export has one CTE per step and nothing unknown", () => {
  for (const audit of audits) {
    const { sql } = exportAuditCode(audit);
    const facts = sqlFacts(sql);
    const ctes = (sql.match(/^step_\w+ AS \(/gm) || []).length;
    assert.equal(
      facts.datasets.filter((d) => d.kind === "cte").length,
      ctes,
      audit.name,
    );
    assert.deepEqual(
      facts.statements.filter((s) => s.kind === "unknown"),
      [],
      audit.name,
    );
    assert.deepEqual(
      facts.flags.filter((f) => f.kind !== "group_by"),
      [],
      audit.name,
    );
  }
});

test("G1: ATLAS's own pandas export reads without flags", () => {
  for (const audit of audits) {
    const { python } = exportAuditCode(audit);
    const facts = pythonFacts(python);
    const steps = facts.statements.filter((s) => s.inFunction === "run_audit");
    assert.ok(
      steps.some((s) => s.kind === "reference"),
      audit.name,
    );
    assert.deepEqual(facts.flags, [], audit.name);
  }
});
