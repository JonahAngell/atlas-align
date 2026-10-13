import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const VERSION_SOURCE = "js/00-config-utils.js";
const VERSION_FILES = [
  VERSION_SOURCE,
  "FEATURE_REQUEST_TEMPLATE.md",
  "PROJECT_CONTEXT.md",
];
const VERSION_PATTERN = /^v\d+\.\d+(?:\.\d+)?$/;
const BUMP_PATTERN = /^v(\d+)\.(\d)(?:\.(\d))?$/;
const SOURCE_PATTERN = /^const ATLAS_APP_VERSION = "([^"]+)";$/gm;
const TARGETS = [
  {
    file: "FEATURE_REQUEST_TEMPLATE.md",
    id: "PROJECT-NOTE",
    render: (v) =>
      `**Project version note:** The current ATLAS Align application version is \`${v}\``,
  },
  {
    file: "FEATURE_REQUEST_TEMPLATE.md",
    id: "CURRENT-VERSION",
    render: (v) => `**Current version:** \`${v}\``,
  },
  {
    file: "FEATURE_REQUEST_TEMPLATE.md",
    id: "QUALITY-CHECK",
    render: (v) =>
      `- [ ] The current application version is listed as \`${v}\`.`,
  },
  {
    file: "PROJECT_CONTEXT.md",
    id: "PROJECT-CONTEXT",
    render: (v) => `**Current Version:** ${v}`,
  },
];

function fail(message) {
  throw new Error(message);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function readAuthoritativeVersion(source) {
  const matches = [...source.matchAll(SOURCE_PATTERN)];
  if (matches.length !== 1)
    fail(
      `${VERSION_SOURCE}: expected exactly one ATLAS_APP_VERSION declaration; found ${matches.length}.`,
    );
  const version = matches[0][1];
  if (!VERSION_PATTERN.test(version))
    fail(`${VERSION_SOURCE}: invalid ATLAS_APP_VERSION "${version}".`);
  return version;
}
function nextVersion(version) {
  const match = version.match(BUMP_PATTERN);
  if (!match)
    fail(
      `${VERSION_SOURCE}: ${version} cannot be bumped; expected vMAJOR.MINOR or vMAJOR.MINOR.PATCH with single-digit minor and patch.`,
    );
  let major = Number(match[1]),
    minor = Number(match[2]),
    patch = match[3] === undefined ? 0 : Number(match[3]);
  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
  }
  if (minor > 9) {
    minor = 0;
    major += 1;
  }
  return `v${major}.${minor}.${patch}`;
}
function replaceSourceVersion(source, version) {
  const matches = [...source.matchAll(SOURCE_PATTERN)];
  if (matches.length !== 1)
    fail(
      `${VERSION_SOURCE}: expected exactly one declaration; found ${matches.length}.`,
    );
  return source.replace(
    SOURCE_PATTERN,
    `const ATLAS_APP_VERSION = "${version}";`,
  );
}
function replaceManagedRegion(content, target, version) {
  const begin = `<!-- ATLAS-APP-VERSION:${target.id}:BEGIN -->`,
    end = `<!-- ATLAS-APP-VERSION:${target.id}:END -->`;
  const pattern = new RegExp(
    `${escapeRegExp(begin)}\\r?\\n([\\s\\S]*?)\\r?\\n${escapeRegExp(end)}`,
    "g",
  );
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1)
    fail(
      `${target.file}: expected exactly one managed region ${target.id}; found ${matches.length}.`,
    );
  const expected = target.render(version);
  return {
    content: content.replace(pattern, `${begin}\n${expected}\n${end}`),
    current: matches[0][1],
    expected,
  };
}
async function atomicWrite(file, content) {
  const temporary = `${file}.atlas-version-${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0 && !allowFailure)
    fail(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  return result;
}
function gitPathExists(root, name) {
  const result = git(root, ["rev-parse", "--git-path", name]);
  return path.resolve(root, result.stdout.trim());
}
async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}
async function inProgressOperation(root) {
  for (const name of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
  ]) {
    if (await exists(gitPathExists(root, name))) return name;
  }
  return null;
}
async function readVersionFromHead(root) {
  const result = git(root, ["show", `HEAD:${VERSION_SOURCE}`], {
    allowFailure: true,
  });
  if (result.status !== 0) return null;
  return readAuthoritativeVersion(result.stdout);
}
async function loadPlan(root, version, { replaceSource = false } = {}) {
  const originals = new Map();
  for (const file of VERSION_FILES)
    originals.set(file, await readFile(path.join(root, file), "utf8"));
  const outputs = new Map(originals);
  if (replaceSource)
    outputs.set(
      VERSION_SOURCE,
      replaceSourceVersion(outputs.get(VERSION_SOURCE), version),
    );
  const drift = [];
  for (const target of TARGETS) {
    const result = replaceManagedRegion(
      outputs.get(target.file),
      target,
      version,
    );
    outputs.set(target.file, result.content);
    if (result.current !== result.expected)
      drift.push(`${target.file} (${target.id})`);
  }
  return { originals, outputs, drift };
}
async function writePlan(root, plan) {
  for (const [file, content] of plan.outputs) {
    if (content !== plan.originals.get(file))
      await atomicWrite(path.join(root, file), content);
  }
}
function stagedNonVersionFiles(root) {
  const result = git(root, [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ]);
  const managed = new Set(VERSION_FILES);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !managed.has(file));
}
async function hookMode(root) {
  const operation = await inProgressOperation(root);
  if (operation) {
    console.log(
      `Skipping automatic application-version bump during ${operation}.`,
    );
    return;
  }
  if (/amend/i.test(process.env.GIT_REFLOG_ACTION || "")) {
    console.log("Skipping automatic application-version bump during amend.");
    return;
  }
  if (stagedNonVersionFiles(root).length === 0) {
    console.log(
      "Skipping automatic application-version bump because no eligible non-version change is staged.",
    );
    return;
  }
  const source = await readFile(path.join(root, VERSION_SOURCE), "utf8");
  const current = readAuthoritativeVersion(source),
    head = await readVersionFromHead(root);
  if (!head) fail("Cannot determine the application version from HEAD.");
  const expected = nextVersion(head);
  if (current !== head && current !== expected)
    fail(
      `Working version ${current} is not HEAD ${head} or its next version ${expected}; review manually.`,
    );
  const target = current === head ? expected : current;
  const plan = await loadPlan(root, target, {
    replaceSource: current === head,
  });
  await writePlan(root, plan);
  const check = await loadPlan(root, target);
  if (check.drift.length)
    fail(`Version remains out of sync: ${check.drift.join(", ")}.`);
  git(root, ["add", "--", ...VERSION_FILES]);
  console.log(
    current === head
      ? `Prepared and staged application version ${target}.`
      : `Reused and staged prepared application version ${target}.`,
  );
}
async function main() {
  const args = process.argv.slice(2),
    root = process.cwd();
  const modes = [
    args.includes("--check"),
    args.includes("--bump"),
    args.includes("--hook"),
  ].filter(Boolean).length;
  if (
    modes > 1 ||
    args.some((a) => !["--check", "--bump", "--hook"].includes(a))
  )
    fail("Usage: node tools/sync-app-version.mjs [--check|--bump|--hook]");
  if (args.includes("--hook")) {
    await hookMode(root);
    return;
  }
  const source = await readFile(path.join(root, VERSION_SOURCE), "utf8"),
    current = readAuthoritativeVersion(source);
  const version = args.includes("--bump") ? nextVersion(current) : current;
  const plan = await loadPlan(root, version, {
    replaceSource: args.includes("--bump"),
  });
  if (args.includes("--check")) {
    if (plan.drift.length)
      fail(
        `Application version ${version} is out of sync in: ${plan.drift.join(", ")}. Run npm run version:sync.`,
      );
    console.log(
      `Application version ${version} is synchronized across ${TARGETS.length} managed references.`,
    );
    return;
  }
  await writePlan(root, plan);
  console.log(
    args.includes("--bump")
      ? `Bumped and synchronized application version ${current} -> ${version}.`
      : `Application version ${version} synchronized.`,
  );
}
main().catch((error) => {
  console.error(`Version synchronization failed: ${error.message}`);
  process.exitCode = 1;
});
