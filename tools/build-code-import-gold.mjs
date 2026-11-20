#!/usr/bin/env node
/**
 * Builds the G1 "exported" tier of the Code to Logic gold set (plan §8.1).
 *
 * For every audit in audits/ that has steps, plus the DIESI notebook import,
 * this writes ATLAS's own T-SQL and pandas export to
 * test/fixtures/code-import/g1/. The audit each script came from is the
 * correct translation, by construction.
 *
 * Values are made synthetic first: digit runs of 6 or more and email
 * addresses are replaced, the same way every time, so the fixtures hold no
 * real identifiers. manifest.json lists each script with its expected audit.
 *
 * Usage: node tools/build-code-import-gold.mjs
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { exportAuditCode } from "../src/ai/code/export-sandbox.js";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("test/fixtures/code-import/g1/", ROOT);
const EXPORT_DATE = "2026-01-01";
const EXTRA = ["docs/audit-imports/diesi-sapl-infotypes-missing-notebook.json"];

const slug = (name) =>
  String(name)
    .replace(/\.json$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Replaces identifier-like values with synthetic ones of the same shape. */
function synthetic(audit) {
  const numbers = new Map();
  const emails = new Map();
  const text = JSON.stringify(audit)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (email) => {
      if (!emails.has(email))
        emails.set(email, `user${emails.size + 1}@example.com`);
      return emails.get(email);
    })
    .replace(/(?<![\w.:-])\d{6,}(?![\w.:-])/g, (digits) => {
      if (!numbers.has(digits)) {
        const n = String(numbers.size + 1);
        numbers.set(
          digits,
          `9${"0".repeat(Math.max(0, digits.length - 1 - n.length))}${n}`,
        );
      }
      return numbers.get(digits);
    });
  return { audit: JSON.parse(text), replaced: numbers.size + emails.size };
}

const inputs = [
  ...readdirSync(new URL("audits/", ROOT))
    .filter((file) => file.endsWith(".json"))
    .map((file) => `audits/${file}`),
  ...EXTRA,
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const file of inputs) {
  const original = JSON.parse(readFileSync(new URL(file, ROOT), "utf8"));
  const steps = (original.steps || []).filter((step) => step.enabled !== false);
  if (!steps.length) continue;
  const { audit, replaced } = synthetic(original);
  const name = slug(file.split("/").at(-1));
  const { sql, python } = exportAuditCode(audit, { today: EXPORT_DATE });
  writeFileSync(new URL(`${name}.sql`, OUT), sql);
  writeFileSync(new URL(`${name}.py`, OUT), python);
  writeFileSync(
    new URL(`${name}.audit.json`, OUT),
    `${JSON.stringify(audit)}\n`,
  );
  manifest.push({
    id: name,
    from: file,
    title: audit.name || name,
    steps: (audit.steps || []).length,
    sql: `${name}.sql`,
    python: `${name}.py`,
    expected: `${name}.audit.json`,
    syntheticValues: replaced,
  });
  console.log(
    `${name}: ${(audit.steps || []).length} steps, ${replaced} values made synthetic`,
  );
}
writeFileSync(
  new URL("manifest.json", OUT),
  `${JSON.stringify({ tier: "G1", exportDate: EXPORT_DATE, scripts: manifest }, null, 2)}\n`,
);
console.log(
  `Wrote ${manifest.length * 2} scripts to test/fixtures/code-import/g1/`,
);
