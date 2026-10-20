import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
const tool = path.resolve("tools/sync-app-version.mjs");
const npmVersion = (version) =>
  [...version.slice(1).split("."), "0", "0"].slice(0, 3).join(".");
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
  const npm = npmVersion(version);
  await writeFile(
    path.join(root, "package.json"),
    `{\r\n  "name": "atlas-align",\r\n  "version": "${npm}",\r\n  "private": true\r\n}\r\n`,
  );
  await writeFile(
    path.join(root, "package-lock.json"),
    `{\r\n  "name": "atlas-align",\r\n  "version": "${npm}",\r\n  "lockfileVersion": 3,\r\n  "packages": {\r\n    "": {\r\n      "name": "atlas-align",\r\n      "version": "${npm}",\r\n      "dependencies": {\r\n        "a": "^1.0.0"\r\n      }\r\n    },\r\n    "node_modules/a": {\r\n      "version": "1.0.0"\r\n    }\r\n  }\r\n}\r\n`,
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
      const pkg = JSON.parse(
        await readFile(path.join(root, "package.json"), "utf8"),
      );
      const lock = JSON.parse(
        await readFile(path.join(root, "package-lock.json"), "utf8"),
      );
      assert.equal(pkg.version, npmVersion(to));
      assert.equal(lock.version, npmVersion(to));
      assert.equal(lock.packages[""].version, npmVersion(to));
      assert.equal(lock.packages["node_modules/a"].version, "1.0.0");
      assert.match(
        await readFile(path.join(root, "package.json"), "utf8"),
        /\r\n/,
      );
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

test("check reports a package.json version that drifts from the app version", async () => {
  const root = await fixture("v2.0.1");
  try {
    const file = path.join(root, "package.json");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace('"2.0.1"', '"1.0.0"'),
    );
    const result = run(root, "--check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /package\.json \(package\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
