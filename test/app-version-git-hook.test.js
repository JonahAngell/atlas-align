import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
const source = process.cwd();
function git(root, ...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}
async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-hook-"));
  for (const f of [
    "js/00-config-utils.js",
    "FEATURE_REQUEST_TEMPLATE.md",
    "PROJECT_CONTEXT.md",
    "build-css.mjs",
    "css/manifest.json",
    "css/display-fields.css",
    "css/requirements-preview.css",
    "styles.css",
    "tools/sync-app-version.mjs",
    "tools/install-git-hooks.mjs",
    ".githooks/pre-commit",
  ]) {
    const d = path.dirname(f);
    if (d !== ".") await mkdir(path.join(root, d), { recursive: true });
    await cp(path.join(source, f), path.join(root, f));
  }
  await cp(path.join(source, "css"), path.join(root, "css"), {
    recursive: true,
  });
  git(root, "init");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "baseline", "--no-verify");
  spawnSync(
    process.execPath,
    [path.join(root, "tools/install-git-hooks.mjs")],
    { cwd: root },
  );
  return root;
}
test("normal commit bumps once and stages managed files", async () => {
  const root = await repo();
  try {
    await writeFile(path.join(root, "change.txt"), "one\n");
    git(root, "add", "change.txt");
    const r = git(root, "commit", "-m", "change");
    assert.equal(r.status, 0, r.stderr);
    const src = await readFile(
      path.join(root, "js/00-config-utils.js"),
      "utf8",
    );
    assert.match(src, /v3\.0\.5/g);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("hook retry reuses prepared version", async () => {
  const root = await repo();
  try {
    await writeFile(path.join(root, "change.txt"), "one\n");
    git(root, "add", "change.txt");
    let r = spawnSync(
      process.execPath,
      [path.join(root, "tools/sync-app-version.mjs"), "--hook"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    r = spawnSync(
      process.execPath,
      [path.join(root, "tools/sync-app-version.mjs"), "--hook"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      await readFile(path.join(root, "js/00-config-utils.js"), "utf8"),
      /v3\.0\.5/g,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
