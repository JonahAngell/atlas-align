import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Syntax-checks every first-party script so new files are covered without editing package.json.
const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const roots = [
  { dir: ".", recursive: false, include: ["server.js", "build-css.mjs"] },
  { dir: "src", recursive: true },
  { dir: "js", recursive: false },
  { dir: "tutorials", recursive: false },
  { dir: "validation", recursive: false },
  { dir: "tools", recursive: false },
];

function listScripts({ dir, recursive, include }) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return recursive ? listScripts({ dir: relative, recursive }) : [];
    }
    if (include) return include.includes(entry.name) ? [relative] : [];
    return /\.(m?js)$/.test(entry.name) ? [relative] : [];
  });
}

const files = roots.flatMap(listScripts).sort();
const failures = files.filter((file) => {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) process.stderr.write(result.stderr);
  return result.status !== 0;
});

if (failures.length) {
  console.error(
    `Syntax check failed for ${failures.length} of ${files.length} files.`,
  );
  process.exit(1);
}
console.log(`Syntax check passed for ${files.length} files.`);
