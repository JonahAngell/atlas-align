import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const currentFile = fileURLToPath(import.meta.url);
const toolsRoot = path.dirname(currentFile);
const root = path.resolve(toolsRoot, "..");
const cssRoot = path.join(root, "css");
const manifestPath = path.join(cssRoot, "manifest.json");

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--format=json");
const includePartial = args.has("--include-partial");

const knownArgs = new Set(["--format=json", "--include-partial"]);

for (const arg of args) {
  if (!knownArgs.has(arg)) {
    throw new Error(`Unknown option: ${arg}`);
  }
}

const BEGIN_PATTERN = /\/\*\s*ATLAS-SOURCE-UNIT:(u\d+):BEGIN\s*\*\//g;

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

  if (!absolute.startsWith(expectedRoot)) {
    throw new Error(`CSS source path escapes css/: ${relativeFile}`);
  }

  return absolute;
}

function lineForOffset(source, offset) {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1;
  }

  return line;
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSelector(selector) {
  return normalizeWhitespace(selector).replace(/\s*([>+~])\s*/g, "$1");
}

function splitSelectors(selectorText) {
  return postcss.list
    .comma(selectorText)
    .map(normalizeSelector)
    .filter(Boolean);
}

function normalizeProperty(property) {
  return String(property || "")
    .trim()
    .toLowerCase();
}

function normalizeValue(value) {
  return normalizeWhitespace(value);
}

function formatAtRuleContext(rule) {
  const contexts = [];
  let parent = rule.parent;

  while (parent && parent.type !== "root") {
    if (parent.type === "atrule") {
      contexts.unshift(`@${parent.name} ${normalizeWhitespace(parent.params)}`);
    }

    parent = parent.parent;
  }

  return contexts.join(" > ");
}

function markerEndPattern(id) {
  return new RegExp(`/\\*\\s*ATLAS-SOURCE-UNIT:${id}:END\\s*\\*/`, "g");
}

function extractUnits(relativeFile, source) {
  const units = [];
  let match;

  BEGIN_PATTERN.lastIndex = 0;

  while ((match = BEGIN_PATTERN.exec(source))) {
    const id = match[1];
    const contentStart = BEGIN_PATTERN.lastIndex;
    const endPattern = markerEndPattern(id);

    endPattern.lastIndex = contentStart;

    const endMatch = endPattern.exec(source);

    if (!endMatch) {
      throw new Error(`Missing ${id} end marker in ${relativeFile}.`);
    }

    units.push({
      id,
      file: relativeFile,
      markerOffset: match.index,
      contentOffset: contentStart,
      markerLine: lineForOffset(source, match.index),
      content: source.slice(contentStart, endMatch.index),
    });

    BEGIN_PATTERN.lastIndex = endPattern.lastIndex;
  }

  return units;
}

function parseUnit(unit) {
  const rootNode = postcss.parse(unit.content, {
    from: safeProjectPath(unit.file),
  });

  const rules = [];

  rootNode.walkRules((rule) => {
    const selectors = splitSelectors(rule.selector);
    const context = formatAtRuleContext(rule);
    const declarations = [];

    rule.walkDecls((declaration) => {
      if (declaration.parent !== rule) return;

      declarations.push({
        property: normalizeProperty(declaration.prop),
        value: normalizeValue(declaration.value),
        important: Boolean(declaration.important),
        relativeLine: declaration.source?.start?.line || 1,
        relativeColumn: declaration.source?.start?.column || 1,
      });
    });

    if (!selectors.length || !declarations.length) return;

    rules.push({
      selectors,
      context,
      declarations,
      relativeLine: rule.source?.start?.line || 1,
      relativeColumn: rule.source?.start?.column || 1,
    });
  });

  return {
    ...unit,
    rules,
  };
}

function buildDeclarationIndex(units) {
  const declarations = [];

  units.forEach((unit, unitIndex) => {
    unit.rules.forEach((rule) => {
      rule.selectors.forEach((selector) => {
        rule.declarations.forEach((declaration) => {
          declarations.push({
            unitId: unit.id,
            unitIndex,
            file: unit.file,
            markerLine: unit.markerLine,
            contentOffset: unit.contentOffset,
            selector,
            context: rule.context,
            ...declaration,
          });
        });
      });
    });
  });

  return declarations;
}

function canOverride(earlier, later) {
  if (earlier.important && !later.important) {
    return false;
  }

  return (
    earlier.selector === later.selector &&
    earlier.context === later.context &&
    earlier.property === later.property
  );
}

function analyzeUnit(unit, unitIndex, declarations) {
  const unitDeclarations = declarations.filter(
    (item) => item.unitIndex === unitIndex,
  );

  if (!unitDeclarations.length) {
    return {
      status: "not-analyzed",
      reason: "Unit contains no ordinary CSS declarations.",
      unit,
      declarations: [],
    };
  }

  const declarationResults = unitDeclarations.map((declaration) => {
    const replacements = declarations.filter(
      (candidate) =>
        candidate.unitIndex > declaration.unitIndex &&
        canOverride(declaration, candidate),
    );

    const finalReplacement = replacements.at(-1) || null;

    return {
      declaration,
      overridden: Boolean(finalReplacement),
      replacement: finalReplacement,
    };
  });

  const overriddenCount = declarationResults.filter(
    (item) => item.overridden,
  ).length;

  let status = "active";

  if (overriddenCount === declarationResults.length) {
    status = "fully-overridden";
  } else if (overriddenCount > 0) {
    status = "partially-overridden";
  }

  return {
    status,
    unit,
    declarations: declarationResults,
  };
}

function sourceLineFor(unit, relativeLine) {
  return unit.markerLine + relativeLine - 1;
}

function uniqueReplacementIds(result) {
  return [
    ...new Set(
      result.declarations
        .map((item) => item.replacement?.unitId)
        .filter(Boolean),
    ),
  ];
}

function buildDiagnostics(results) {
  const diagnostics = [];

  for (const result of results) {
    if (result.status === "fully-overridden") {
      const replacements = uniqueReplacementIds(result);

      diagnostics.push({
        file: result.unit.file,
        line: result.unit.markerLine,
        column: 1,
        severity: "warning",
        code: "atlas-css-fully-overridden",
        unitId: result.unit.id,
        message:
          `${result.unit.id} is fully superseded by later unit(s): ` +
          `${replacements.join(", ")}. Review before removal.`,
        replacements,
      });

      continue;
    }

    if (includePartial && result.status === "partially-overridden") {
      for (const item of result.declarations) {
        if (!item.overridden) continue;

        diagnostics.push({
          file: result.unit.file,
          line: sourceLineFor(result.unit, item.declaration.relativeLine),
          column: item.declaration.relativeColumn,
          severity: "information",
          code: "atlas-css-partially-overridden",
          unitId: result.unit.id,
          message:
            `${result.unit.id}: ` +
            `${item.declaration.selector} ` +
            `${item.declaration.property} is superseded by ` +
            `${item.replacement.unitId}.`,
          replacements: [item.replacement.unitId],
        });
      }
    }
  }

  return diagnostics;
}

function printDiagnostic(diagnostic) {
  const absoluteFile = safeProjectPath(diagnostic.file);

  console.log(
    [
      absoluteFile,
      diagnostic.line,
      diagnostic.column,
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message,
    ].join(":"),
  );
}

const manifest = readJson(manifestPath);

if (!Array.isArray(manifest.units)) {
  throw new Error("manifest.units must be an array.");
}

const manifestIds = new Set();
const sourceCache = new Map();
const extractedUnits = new Map();

for (const entry of manifest.units) {
  if (!/^u\d+$/.test(entry.id)) {
    throw new Error(`Invalid unit id: ${entry.id}`);
  }

  if (manifestIds.has(entry.id)) {
    throw new Error(`Duplicate manifest unit id: ${entry.id}`);
  }

  manifestIds.add(entry.id);

  const absoluteFile = safeProjectPath(entry.file);

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`Missing CSS source file: ${entry.file}`);
  }

  if (!sourceCache.has(entry.file)) {
    const source = fs.readFileSync(absoluteFile, "utf8");

    sourceCache.set(entry.file, source);
    extractedUnits.set(entry.file, extractUnits(entry.file, source));
  }
}

const orderedUnits = manifest.units.map((entry) => {
  const fileUnits = extractedUnits.get(entry.file);
  const sourceUnit = fileUnits.find((candidate) => candidate.id === entry.id);

  if (!sourceUnit) {
    throw new Error(
      `Manifest unit ${entry.id} was not found in ${entry.file}.`,
    );
  }

  return parseUnit(sourceUnit);
});

const declarations = buildDeclarationIndex(orderedUnits);

const results = orderedUnits.map((unit, unitIndex) =>
  analyzeUnit(unit, unitIndex, declarations),
);

const diagnostics = buildDiagnostics(results);

const summary = {
  totalUnits: orderedUnits.length,
  fullyOverriddenUnits: results.filter(
    (result) => result.status === "fully-overridden",
  ).length,
  partiallyOverriddenUnits: results.filter(
    (result) => result.status === "partially-overridden",
  ).length,
  activeUnits: results.filter((result) => result.status === "active").length,
  diagnosticCount: diagnostics.length,
};

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        diagnostics,
        summary,
      },
      null,
      2,
    ),
  );
} else {
  diagnostics.forEach(printDiagnostic);

  console.log(
    [
      "CSS cascade analysis complete.",
      `${summary.totalUnits} total units.`,
      `${summary.fullyOverriddenUnits} fully overridden.`,
      `${summary.partiallyOverriddenUnits} partially overridden.`,
    ].join(" "),
  );
}

process.exitCode = diagnostics.some(
  (diagnostic) => diagnostic.severity === "error",
)
  ? 1
  : 0;
