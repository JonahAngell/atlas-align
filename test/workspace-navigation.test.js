import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (file) =>
  readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
const stateDom = read("01-state-dom.js");

function pageSets() {
  const start = stateDom.indexOf("const ATLAS_WORKSPACE_PAGES");
  const end = stateDom.indexOf("function hasSelectedAudit");
  const context = vm.createContext({});
  vm.runInContext(
    `${stateDom.slice(start, end)}; globalThis.sets = { ATLAS_WORKSPACE_PAGES, ATLAS_AUDIT_FREE_PAGES };`,
    context,
  );
  return context.sets;
}

test("Inbox and Deleted Publications open without a selected audit; History does not", () => {
  const { ATLAS_AUDIT_FREE_PAGES } = pageSets();
  assert.deepEqual([...ATLAS_AUDIT_FREE_PAGES].sort(), [
    "inbox",
    "my-audits",
    "recently-deleted-publications",
  ]);
});

test("navigation guard, lock state, and review-mode exit share the page sets", () => {
  assert.match(
    stateDom,
    /!hasSelectedAudit\(\) && !ATLAS_AUDIT_FREE_PAGES\.has\(page\)/,
  );
  assert.match(
    read("16-page-shell.js"),
    /locked && !ATLAS_AUDIT_FREE_PAGES\.has\(targetPage\)/,
  );
  assert.match(
    read("18-audit-database.js"),
    /const workspacePages = ATLAS_WORKSPACE_PAGES;/,
  );
  assert.ok(pageSets().ATLAS_WORKSPACE_PAGES.has("history"));
});
