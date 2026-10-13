import { spawnSync } from "node:child_process";
import path from "node:path";
function run(args) {
  const r = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  return r.stdout.trim();
}
try {
  if (run(["rev-parse", "--is-inside-work-tree"]) !== "true")
    throw new Error("Current directory is not inside a Git worktree.");
  run(["config", "--local", "core.hooksPath", ".githooks"]);
  const configured = run(["config", "--local", "--get", "core.hooksPath"]);
  if (configured !== ".githooks")
    throw new Error(`Unexpected core.hooksPath: ${configured}`);
  console.log("Configured repository-local core.hooksPath=.githooks");
} catch (error) {
  console.error(`Git hook installation failed: ${error.message}`);
  process.exitCode = 1;
}
