import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const jsDir = new URL("../js/", import.meta.url);
const modules = readdirSync(jsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => ({
    file,
    source: readFileSync(new URL(file, jsDir), "utf8"),
  }));
const read = (file) => modules.find((entry) => entry.file === file).source;

test("every HTML escaper called by a browser module is defined", () => {
  const escaperCall =
    /(?<![.\w$])((?:[a-z]+)?(?:esc|Esc|escape|Escape)(?:Html|HTML)?|safeText)\(/g;
  const defined = new Set();
  for (const { source } of modules) {
    for (const match of source.matchAll(
      /(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/g,
    )) {
      defined.add(match[1]);
    }
  }
  const missing = new Set();
  for (const { file, source } of modules) {
    for (const match of source.matchAll(escaperCall)) {
      const name = match[1];
      if (/^(css|CSS)/.test(name) || name === "unescape") continue;
      if (!defined.has(name)) missing.add(`${file}: ${name}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("identifiers from audits and the server are escaped in HTML attributes", () => {
  const expectations = [
    ["04-persistence.js", 'value="${esc(flow.id)}"'],
    [
      "14-catalog-driven-builder.js",
      'branch-${esc(step.branchType || "then")}',
    ],
    [
      "19-audit-version-history.js",
      'data-restore-audit-revision="${esc(r.id)}"',
    ],
    [
      "19-audit-version-history.js",
      'data-restore-step-revision="${esc(r.id)}"',
    ],
    [
      "23-atlas-audit-issues.js",
      'data-review-feedback-target="${safeText(entry.reviewItemId)}"',
    ],
    ["27-audit-review-mode.js", 'data-review-target="${escHtml(item.id)}"'],
    [
      "27-audit-review-mode.js",
      'data-thread-id="${escHtml(payload.thread.id)}"',
    ],
  ];
  for (const [file, fragment] of expectations) {
    assert.ok(
      read(file).includes(fragment),
      `${file} should contain ${fragment}`,
    );
  }
  for (const file of [
    "14-catalog-driven-builder.js",
    "27-audit-review-mode.js",
  ]) {
    assert.doesNotMatch(read(file), /branch-\$\{step\.branchType/);
    assert.doesNotMatch(read(file), /="\$\{item\.id\}"/);
  }
});
