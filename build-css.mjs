import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.dirname(currentFile);
const cssRoot = path.join(root, "css");
const manifestPath = path.join(cssRoot, "manifest.json");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const noDiscover = args.has("--no-discover");
const acceptDeletions = args.has("--accept-deletions");
const knownArgs = new Set(["--check", "--no-discover", "--accept-deletions"]);
for (const arg of args)
  if (!knownArgs.has(arg)) throw new Error(`Unknown option: ${arg}`);

const BEGIN_RE = /\/\*\s*ATLAS-SOURCE-UNIT:(u\d+):BEGIN\s*\*\//g;
const END_RE = /\/\*\s*ATLAS-SOURCE-UNIT:(u\d+):END\s*\*\//g;
const INSERT_RE =
  /\/\*\s*ATLAS-INSERT-(AFTER|BEFORE):(u\d+)\s*\*\/|\/\*\s*ATLAS-INSERT:END\s*\*\//i;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function safeProjectPath(relativeFile) {
  if (
    typeof relativeFile !== "string" ||
    !relativeFile.startsWith("css/") ||
    !relativeFile.endsWith(".css")
  ) {
    throw new Error(`Invalid CSS source path in manifest: ${relativeFile}`);
  }
  const absolute = path.resolve(root, relativeFile);
  const expectedRoot = `${path.resolve(cssRoot)}${path.sep}`;
  if (!absolute.startsWith(expectedRoot))
    throw new Error(`CSS source path escapes css/: ${relativeFile}`);
  return absolute;
}

function stripCommentsAndWhitespace(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function validateCssStructure(source, label) {
  let depth = 0;
  let quote = null;
  let comment = false;
  for (let i = 0; i < source.length; i += 1) {
    if (comment) {
      if (source[i] === "*" && source[i + 1] === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (source[i] === "\\") {
        i += 1;
        continue;
      }
      if (source[i] === quote) quote = null;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      quote = source[i];
      continue;
    }
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth < 0)
        throw new Error(`${label} has an unmatched closing brace.`);
    }
  }
  if (comment) throw new Error(`${label} has an unterminated comment.`);
  if (quote) throw new Error(`${label} has an unterminated string.`);
  if (depth !== 0) throw new Error(`${label} has unbalanced braces.`);
}

function splitTopLevelUnits(source, label) {
  const units = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let comment = false;
  for (let i = 0; i < source.length; i += 1) {
    if (comment) {
      if (source[i] === "*" && source[i + 1] === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (source[i] === "\\") {
        i += 1;
        continue;
      }
      if (source[i] === quote) quote = null;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      quote = source[i];
      continue;
    }
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth < 0)
        throw new Error(`${label} has an unmatched closing brace.`);
      if (depth === 0) {
        let end = i + 1;
        while (end < source.length && /\s/.test(source[end])) end += 1;
        units.push({ start, end, text: source.slice(start, end) });
        start = end;
        i = end - 1;
      }
    } else if (source[i] === ";" && depth === 0) {
      let end = i + 1;
      while (end < source.length && /\s/.test(source[end])) end += 1;
      units.push({ start, end, text: source.slice(start, end) });
      start = end;
      i = end - 1;
    }
  }
  if (comment || quote || depth !== 0) validateCssStructure(source, label);
  if (start < source.length)
    units.push({ start, end: source.length, text: source.slice(start) });
  return units.filter((unit) => stripCommentsAndWhitespace(unit.text) !== "");
}

function parseSourceFile(relativeFile, source) {
  const tokens = [];
  const occupied = [];
  BEGIN_RE.lastIndex = 0;
  let match;
  while ((match = BEGIN_RE.exec(source))) {
    const id = match[1];
    END_RE.lastIndex = BEGIN_RE.lastIndex;
    const endMatch = END_RE.exec(source);
    if (!endMatch || endMatch[1] !== id)
      throw new Error(
        `Missing or mismatched ${id} end marker in ${relativeFile}.`,
      );
    const duplicateEnd = source
      .slice(BEGIN_RE.lastIndex, endMatch.index)
      .match(/ATLAS-SOURCE-UNIT:u\d+:END/);
    if (duplicateEnd)
      throw new Error(
        `Unexpected source-unit end marker inside ${id} in ${relativeFile}.`,
      );
    tokens.push({
      type: "existing",
      id,
      file: relativeFile,
      start: match.index,
      end: END_RE.lastIndex,
      content: source.slice(BEGIN_RE.lastIndex, endMatch.index),
    });
    occupied.push([match.index, END_RE.lastIndex]);
    BEGIN_RE.lastIndex = END_RE.lastIndex;
  }

  END_RE.lastIndex = 0;
  while ((match = END_RE.exec(source))) {
    if (
      !occupied.some(
        ([start, end]) => match.index >= start && match.index < end,
      )
    ) {
      throw new Error(`Orphan ${match[1]} end marker in ${relativeFile}.`);
    }
  }

  let cursor = 0;
  const outside = [];
  for (const item of tokens) {
    if (cursor < item.start)
      outside.push({
        start: cursor,
        end: item.start,
        text: source.slice(cursor, item.start),
      });
    cursor = item.end;
  }
  if (cursor < source.length)
    outside.push({
      start: cursor,
      end: source.length,
      text: source.slice(cursor),
    });

  const newUnits = [];
  for (const segment of outside) {
    for (const unit of splitTopLevelUnits(segment.text, relativeFile)) {
      const absoluteStart = segment.start + unit.start;
      const absoluteEnd = segment.start + unit.end;
      const before = source.slice(0, absoluteStart);
      const directiveMatches = [
        ...before.matchAll(new RegExp(INSERT_RE.source, "gi")),
      ];
      const lastDirective = directiveMatches.at(-1);
      let directive = null;
      if (
        lastDirective &&
        stripCommentsAndWhitespace(
          before.slice(lastDirective.index + lastDirective[0].length),
        ) === ""
      ) {
        directive = lastDirective[0].includes("ATLAS-INSERT:END")
          ? { type: "end" }
          : { type: lastDirective[1].toLowerCase(), id: lastDirective[2] };
      }
      newUnits.push({
        type: "new",
        file: relativeFile,
        start: absoluteStart,
        end: absoluteEnd,
        content: unit.text.replace(new RegExp(INSERT_RE.source, "gi"), ""),
        directive,
      });
    }
  }
  return { relativeFile, source, existing: tokens, newUnits };
}

function nextUnitNumber(manifest) {
  const numbers = manifest.units
    .map(({ id }) => Number.parseInt(String(id).slice(1), 10))
    .filter(Number.isFinite);
  return Math.max(0, ...numbers, Number(manifest.nextUnitNumber || 1) - 1) + 1;
}

function insertManifestUnit(units, entry, placement) {
  if (placement.type === "end") {
    units.push(entry);
    return;
  }
  const index = units.findIndex(({ id }) => id === placement.id);
  if (index < 0)
    throw new Error(`Insertion anchor ${placement.id} does not exist.`);
  units.splice(placement.type === "before" ? index : index + 1, 0, entry);
}

function inferPlacement(parsed, newUnit, manifest) {
  if (newUnit.directive) return newUnit.directive;
  const previous = parsed.existing
    .filter((item) => item.end <= newUnit.start)
    .at(-1);
  if (previous) return { type: "after", id: previous.id };
  const next = parsed.existing.find((item) => item.start >= newUnit.end);
  if (next) return { type: "before", id: next.id };
  const configured = manifest.files?.[parsed.relativeFile]?.defaultInsert;
  if (configured === "end") return { type: "end" };
  const configuredMatch = /^(before|after):(u\d+)$/i.exec(configured || "");
  if (configuredMatch)
    return { type: configuredMatch[1].toLowerCase(), id: configuredMatch[2] };
  throw new Error(
    `Cannot place new CSS in ${parsed.relativeFile}. Add /* ATLAS-INSERT-AFTER:u#### */, /* ATLAS-INSERT-BEFORE:u#### */, or configure manifest.files["${parsed.relativeFile}"].defaultInsert.`,
  );
}

function atomicWrite(file, content) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, file);
}

const manifest = readJson(manifestPath);
if (!Array.isArray(manifest.units))
  throw new Error("manifest.units must be an array.");
const manifestIds = new Set();
for (const unit of manifest.units) {
  if (!/^u\d+$/.test(unit.id)) throw new Error(`Invalid unit id: ${unit.id}`);
  if (manifestIds.has(unit.id))
    throw new Error(`Duplicate manifest unit id: ${unit.id}`);
  manifestIds.add(unit.id);
  safeProjectPath(unit.file);
}

const sourceFiles = new Set(manifest.units.map(({ file }) => file));
if (manifest.files)
  for (const file of Object.keys(manifest.files)) sourceFiles.add(file);
for (const name of fs.readdirSync(cssRoot))
  if (name.endsWith(".css")) sourceFiles.add(`css/${name}`);

const parsedFiles = new Map();
const foundUnits = new Map();
for (const relativeFile of [...sourceFiles].sort()) {
  const absolute = safeProjectPath(relativeFile);
  if (!fs.existsSync(absolute))
    throw new Error(`Missing CSS source file: ${relativeFile}`);
  const parsed = parseSourceFile(
    relativeFile,
    fs.readFileSync(absolute, "utf8"),
  );
  parsedFiles.set(relativeFile, parsed);
  for (const item of parsed.existing) {
    if (foundUnits.has(item.id))
      throw new Error(
        `Duplicate source unit ${item.id} in ${foundUnits.get(item.id).file} and ${relativeFile}.`,
      );
    foundUnits.set(item.id, item);
  }
}

const missing = manifest.units.filter(({ id }) => !foundUnits.has(id));
if (missing.length && !acceptDeletions) {
  throw new Error(
    `Manifest units missing from source files: ${missing.map(({ id }) => id).join(", ")}. Re-run with --accept-deletions to confirm removal.`,
  );
}
if (missing.length)
  manifest.units = manifest.units.filter(({ id }) => foundUnits.has(id));

for (const unit of manifest.units) {
  const found = foundUnits.get(unit.id);
  if (found && unit.file !== found.file) unit.file = found.file;
}

const discovered = [];
let nextNumber = nextUnitNumber(manifest);
for (const parsed of parsedFiles.values()) {
  const orderedNew = [...parsed.newUnits].sort((a, b) => a.start - b.start);
  for (const newUnit of orderedNew) {
    if (noDiscover)
      throw new Error(
        `Unmarked CSS detected in ${parsed.relativeFile}. Remove --no-discover or add source-unit markers.`,
      );
    const id = `u${String(nextNumber).padStart(4, "0")}`;
    nextNumber += 1;
    const placement = inferPlacement(parsed, newUnit, manifest);
    insertManifestUnit(
      manifest.units,
      { id, file: parsed.relativeFile },
      placement,
    );
    newUnit.id = id;
    discovered.push({ id, file: parsed.relativeFile, placement });
    parsed.existing.push({
      type: "existing",
      id,
      file: parsed.relativeFile,
      start: newUnit.start,
      end: newUnit.end,
      content: newUnit.content,
    });
  }
}
manifest.schemaVersion = Math.max(2, Number(manifest.schemaVersion || 1));
manifest.nextUnitNumber = nextNumber;

const rewrittenSources = new Map();
for (const parsed of parsedFiles.values()) {
  if (!parsed.newUnits.length) continue;
  let rewritten = parsed.source;
  for (const unit of [...parsed.newUnits].sort((a, b) => b.start - a.start)) {
    const wrapped = `/* ATLAS-SOURCE-UNIT:${unit.id}:BEGIN */${unit.content}/* ATLAS-SOURCE-UNIT:${unit.id}:END */`;
    rewritten = `${rewritten.slice(0, unit.start)}${wrapped}${rewritten.slice(unit.end)}`;
  }
  rewrittenSources.set(parsed.relativeFile, rewritten);
}

const sourceCache = new Map();
for (const [relativeFile, rewritten] of rewrittenSources)
  sourceCache.set(relativeFile, rewritten);
function sourceFor(relativeFile) {
  if (!sourceCache.has(relativeFile))
    sourceCache.set(
      relativeFile,
      fs.readFileSync(safeProjectPath(relativeFile), "utf8"),
    );
  return sourceCache.get(relativeFile);
}

const emitted = new Set();
const output = manifest.units
  .map(({ id, file }) => {
    if (emitted.has(id))
      throw new Error(`Unit ${id} would be emitted more than once.`);
    emitted.add(id);
    const source = sourceFor(file);
    const begin = `/* ATLAS-SOURCE-UNIT:${id}:BEGIN */`;
    const end = `/* ATLAS-SOURCE-UNIT:${id}:END */`;
    const start = source.indexOf(begin);
    if (start < 0) throw new Error(`Missing ${id} begin marker in ${file}.`);
    const contentStart = start + begin.length;
    const finish = source.indexOf(end, contentStart);
    if (finish < 0) throw new Error(`Missing ${id} end marker in ${file}.`);
    if (source.indexOf(begin, contentStart) >= 0)
      throw new Error(`Duplicate ${id} begin marker in ${file}.`);
    return source.slice(contentStart, finish);
  })
  .join("");

validateCssStructure(output, manifest.source || "styles.css");
if (/ATLAS-SOURCE-UNIT:/.test(output))
  throw new Error("Generated stylesheet contains source-management markers.");

if (checkOnly) {
  console.log(
    `CSS check passed. ${manifest.units.length} units would be emitted.`,
  );
  if (discovered.length) {
    console.log(`Discovered ${discovered.length} new CSS unit(s):`);
    for (const item of discovered)
      console.log(
        `  ${item.id}  ${item.file}  ${item.placement.type}${item.placement.id ? `:${item.placement.id}` : ""}`,
      );
  }
  if (missing.length)
    console.log(`Would remove ${missing.length} confirmed missing unit(s).`);
  process.exit(0);
}

for (const [relativeFile, contents] of rewrittenSources)
  atomicWrite(safeProjectPath(relativeFile), contents);
atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
atomicWrite(path.join(root, manifest.source || "styles.css"), output);
console.log(
  `Built ${manifest.source || "styles.css"} from ${manifest.units.length} ordered source units.`,
);
if (discovered.length)
  console.log(
    `Discovered, marked, and registered ${discovered.length} new CSS unit(s).`,
  );
if (missing.length)
  console.log(
    `Removed ${missing.length} confirmed missing unit(s) from the manifest.`,
  );
