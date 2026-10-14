import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const h = readFileSync(
    new URL("../sections/audit-history.html", import.meta.url),
    "utf8",
  ),
  j = readFileSync(
    new URL("../js/19a-audit-history-browser.js", import.meta.url),
    "utf8",
  ),
  i = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("history provides revision and publication navigation", () => {
  for (const x of [
    "atlasRevisionPrevious",
    "atlasRevisionNext",
    "atlasRevisionSelector",
    "atlasPublicationPrevious",
    "atlasPublicationNext",
    "atlasPublicationSelector",
    "atlasHistoryCompare",
    "atlasHistoryRestore",
    "atlasHistoryReturn",
  ])
    assert.ok(h.includes(x), x);
});
test("adjacent classic script order is preserved", () =>
  assert.ok(
    i.indexOf("19-audit-version-history.js") <
      i.indexOf("19a-audit-history-browser.js") &&
      i.indexOf("19a-audit-history-browser.js") <
        i.indexOf("20-database-only-audits.js"),
  ));
test("workflow history entry point opens unified browser", () =>
  assert.match(j, /atlasOpenAuditHistory\s*=\s*function\s*\(\)/));
