#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUTPUT = "REVIEW_BUNDLE.txt";
const DEFAULT_TITLE = "PROJECT REVIEW BUNDLE";

function printUsage() {
  console.log(
    `
Create a combined project review bundle from a list of files.

Usage:
  node tools/create-review-bundle.mjs [options] [file ...]

Options:
  --files <path>    Read file paths from a text manifest
  --output <path>   Output file name
                    Default: ${DEFAULT_OUTPUT}
  --title <text>    Bundle title
                    Default: ${DEFAULT_TITLE}
  --help            Display this help

Manifest format:
  One file path per line.

  Empty lines and lines beginning with # are ignored.

Examples:
  node tools/create-review-bundle.mjs \\
    --files review-bundle-files.txt \\
    --output ATLAS_AUDIT_ISSUES_FEATURE_REVIEW.txt \\
    --title "ATLAS ALIGN AUDIT ISSUES FEATURE REVIEW BUNDLE"

  node tools/create-review-bundle.mjs \\
    --output SMALL_REVIEW.txt \\
    README.md package.json styles.css
`.trim(),
  );
}

function parseArguments(argumentsList) {
  const options = {
    filesManifest: null,
    output: DEFAULT_OUTPUT,
    title: DEFAULT_TITLE,
    positionalFiles: [],
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    }

    if (argument === "--files") {
      const value = argumentsList[index + 1];

      if (!value) {
        throw new Error("--files requires a manifest path.");
      }

      options.filesManifest = value;
      index += 1;
      continue;
    }

    if (argument === "--output") {
      const value = argumentsList[index + 1];

      if (!value) {
        throw new Error("--output requires a file path.");
      }

      options.output = value;
      index += 1;
      continue;
    }

    if (argument === "--title") {
      const value = argumentsList[index + 1];

      if (!value) {
        throw new Error("--title requires text.");
      }

      options.title = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    options.positionalFiles.push(argument);
  }

  return options;
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isRegularFile(filePath) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

async function readManifest(manifestPath) {
  const manifestContents = await readFile(manifestPath, "utf8");

  return manifestContents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function removeDuplicates(filePaths) {
  return [...new Set(filePaths)];
}

function getGitOutput(argumentsList) {
  try {
    return execFileSync("git", argumentsList, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return null;
  }
}

function getRepositoryFingerprint() {
  const insideWorkTree = getGitOutput(["rev-parse", "--is-inside-work-tree"]);

  if (insideWorkTree !== "true") {
    return "Git metadata unavailable.\n";
  }

  const commit = getGitOutput(["rev-parse", "HEAD"]) || "[Unavailable]";
  const branch =
    getGitOutput(["branch", "--show-current"]) || "[Detached HEAD]";
  const status = getGitOutput(["status", "--short"]);

  return [
    `Commit: ${commit}`,
    "",
    "Branch:",
    branch,
    "",
    "Working tree status:",
    status || "[Clean]",
    "",
  ].join("\n");
}

function calculateSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function createDivider() {
  return "=".repeat(80);
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function collectFiles(filePaths) {
  const results = [];

  for (const filePath of filePaths) {
    const exists = await fileExists(filePath);
    const regularFile = exists && (await isRegularFile(filePath));

    if (!regularFile) {
      results.push({
        filePath,
        exists: false,
        buffer: null,
        sha256: null,
      });
      continue;
    }

    const buffer = await readFile(filePath);

    results.push({
      filePath,
      exists: true,
      buffer,
      sha256: calculateSha256(buffer),
    });
  }

  return results;
}

function buildBundle({ title, fileResults }) {
  const divider = createDivider();
  const lines = [];

  lines.push(title);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Project root: ${process.cwd()}`);
  lines.push("");

  lines.push(divider);
  lines.push("REPOSITORY FINGERPRINT");
  lines.push(divider);
  lines.push("");
  lines.push(getRepositoryFingerprint().trimEnd());
  lines.push("");

  lines.push(divider);
  lines.push("FILE INVENTORY AND SHA-256");
  lines.push(divider);
  lines.push("");

  for (const result of fileResults) {
    if (result.exists) {
      lines.push(`${result.sha256}  ${result.filePath}`);
    } else {
      lines.push(`MISSING ${result.filePath}`);
    }
  }

  for (const result of fileResults) {
    lines.push("");
    lines.push(divider);
    lines.push(`BEGIN FILE: ${result.filePath}`);
    lines.push(divider);
    lines.push("");

    if (result.exists) {
      lines.push(result.buffer.toString("utf8"));

      if (
        result.buffer.length > 0 &&
        !result.buffer.toString("utf8").endsWith("\n")
      ) {
        lines.push("");
      }
    } else {
      lines.push(`[MISSING FILE: ${result.filePath}]`);
    }

    lines.push("");
    lines.push(divider);
    lines.push(`END FILE: ${result.filePath}`);
    lines.push(divider);
  }

  lines.push("");

  return lines.join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let requestedFiles = [...options.positionalFiles];

  if (options.filesManifest) {
    const manifestFiles = await readManifest(options.filesManifest);
    requestedFiles = [...manifestFiles, ...requestedFiles];
  }

  requestedFiles = removeDuplicates(requestedFiles);

  if (requestedFiles.length === 0) {
    throw new Error(
      "No files were provided. Use --files <manifest> or provide file paths.",
    );
  }

  const outputPath = path.resolve(options.output);
  const outputRelativePath = path.relative(process.cwd(), outputPath);

  requestedFiles = requestedFiles.filter((filePath) => {
    const requestedPath = path.resolve(filePath);
    return requestedPath !== outputPath;
  });

  if (requestedFiles.length === 0) {
    throw new Error("The output file cannot be the only requested input.");
  }

  const fileResults = await collectFiles(requestedFiles);
  const bundle = buildBundle({
    title: options.title,
    fileResults,
  });

  await writeFile(outputPath, bundle, "utf8");

  const outputStats = await stat(outputPath);
  const missingCount = fileResults.filter((result) => !result.exists).length;

  console.log(`Created ${outputRelativePath || options.output}`);
  console.log(`Size: ${formatBytes(outputStats.size)}`);
  console.log(`Files requested: ${fileResults.length}`);
  console.log(`Files included: ${fileResults.length - missingCount}`);
  console.log(`Missing requested files recorded: ${missingCount}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
