import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ExcelJS = createRequire(import.meta.url)("exceljs");

/** Loads the export builders with three preview rows at nesting levels 0-2. */
function exportContext() {
  const context = vm.createContext({
    ExcelJS,
    ATLAS_APP_NAME: "ATLAS Align",
    state: { audit: { name: "Nested Audit", purpose: "" } },
    e: { includeNotes: { checked: true } },
    esc: (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    atlasEnsureExcelJs: async () => {},
    requirementsFieldRows: () => [],
    previewRows: () => [
      { step: "1", branch: "Root", level: 0, analyst: "IF a = 1", developer: "a", notes: "" },
      { step: "1.1", branch: "THEN", level: 1, analyst: "THEN b", developer: "b", notes: "" },
      { step: "1.1.1", branch: "ELSE", level: 2, analyst: "ELSE c", developer: "c", notes: "n" },
    ],
  });
  vm.runInContext(
    readFileSync(new URL("../js/12-export-foundation.js", import.meta.url), "utf8"),
    context,
  );
  return context;
}

test("Excel Audit Logic has no Branch column and indents nested logic", async () => {
  const workbook = await vm.runInContext(
    "buildAuditExcelWorkbook()",
    exportContext(),
  );
  const sheet = workbook.getWorksheet("Audit Logic");
  assert.deepEqual(sheet.getRow(1).values.slice(1), [
    "Step",
    "Analyst Logic",
    "Developer Logic",
    "Notes",
  ]);
  const analyst = (row) => sheet.getRow(row).getCell(2);
  assert.equal(analyst(2).value, "IF a = 1");
  assert.equal(analyst(2).alignment.indent, undefined);
  assert.equal(analyst(3).alignment.indent, 1);
  assert.equal(analyst(4).alignment.indent, 2);
  assert.equal(analyst(4).alignment.wrapText, true, "row alignment is kept");
  assert.equal(sheet.getRow(3).getCell(1).alignment.indent, undefined);
});

test("HTML Audit Logic has no Branch column and indents nested logic", () => {
  const html = vm.runInContext("auditHtmlDocument()", exportContext());
  assert.doesNotMatch(html, /Branch|THEN<\/td>|Root<\/td>/);
  assert.match(
    html,
    /<th>Step<\/th><th>Analyst Logic<\/th><th>Developer Logic<\/th><th>Notes<\/th>/,
  );
  assert.match(html, /<tr><td>1<\/td><td>IF a = 1<\/td>/);
  assert.match(html, /<td>1\.1<\/td><td style="padding-left:32px">THEN b<\/td>/);
  assert.match(html, /<td>1\.1\.1<\/td><td style="padding-left:56px">ELSE c<\/td>/);
});
