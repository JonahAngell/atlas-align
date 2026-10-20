import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("vendored browser ExcelJS is the unmodified build of the audited npm package", () => {
  const vendored = readFileSync(
    new URL("../vendor/exceljs.min.js", import.meta.url),
  );
  const packaged = readFileSync(
    new URL("../node_modules/exceljs/dist/exceljs.min.js", import.meta.url),
  );
  assert.ok(
    vendored.equals(packaged),
    "Copy node_modules/exceljs/dist/exceljs.min.js to vendor/ after upgrading exceljs.",
  );
});
