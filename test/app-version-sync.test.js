import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
const tool = path.resolve("tools/sync-app-version.mjs");
const region = (id, body) =>
  `<!-- ATLAS-APP-VERSION:${id}:BEGIN -->\n${body}\n<!-- ATLAS-APP-VERSION:${id}:END -->`;
async function fixture(version) {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-version-"));
  await mkdir(path.join(root, "js"));
  await writeFile(
    path.join(root, "js/00-config-utils.js"),
    `const ATLAS_APP_VERSION = "${version}";\n`,
  );
  await writeFile(
    path.join(root, "FEATURE_REQUEST_TEMPLATE.md"),
    [
      region(
        "PROJECT-NOTE",
        `**Project version note:** The current ATLAS Align application version is \`${version}\``,
      ),
      region("CURRENT-VERSION", `**Current version:** \`${version}\``),
      region(
        "QUALITY-CHECK",
        `- [ ] The current application version is listed as \`${version}\`.`,
      ),
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "PROJECT_CONTEXT.md"),
    region("PROJECT-CONTEXT", `**Current Version:** ${version}`),
  );
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
for (const [from, to] of [
  ["v2.0", "v2.0.1"],
  ["v2.0.1", "v2.0.2"],
  ["v2.0.9", "v2.1.0"],
  ["v2.9.9", "v3.0.0"],
  ["v9.9.9", "v10.0.0"],
])
  test(`${from} bumps to ${to}`, async () => {
    const root = await fixture(from);
    try {
      assert.equal(run(root, "--bump").status, 0);
      assert.match(
        await readFile(path.join(root, "js/00-config-utils.js"), "utf8"),
        new RegExp(to.replaceAll(".", "\\.")),
      );
      assert.equal(run(root, "--check").status, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
for (const bad of ["2.0.1", "v2", "v2.0.10", "v2.10.0", "v2.0.1-beta"])
  test(`rejects ${bad}`, async () => {
    const root = await fixture(bad);
    try {
      assert.equal(run(root, "--bump").status, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
