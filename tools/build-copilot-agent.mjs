#!/usr/bin/env node
/**
 * The ATLAS Copilot agent files (docs/copilot/).
 *
 *   node tools/build-copilot-agent.mjs            writes knowledge/STEP_TYPE_REFERENCE.md
 *   node tools/build-copilot-agent.mjs --check    fails if that file is out of date
 *   node tools/build-copilot-agent.mjs --package  also writes dist/copilot-agent/:
 *                                                 the instructions, the knowledge
 *                                                 files and one .zip per skill
 *
 * The reference is built from the step type definitions, action kinds,
 * operator catalog, control palette and File Utility contract in this
 * repository, so it lists exactly what ATLAS Align ships. Types published
 * later in the Step Type Builder are not in it; the agent reads those from
 * the SharePoint folder (see docs/copilot/README.md).
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const COPILOT = new URL("docs/copilot/", ROOT);
const REFERENCE = new URL("knowledge/STEP_TYPE_REFERENCE.md", COPILOT);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const json = (path) => JSON.parse(read(path));

/** The engine and runtime, loaded as the page loads them. */
function loadRuntime() {
  const manifest = json("js/step-types/engine-manifest.json");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  const scripts = [
    ...manifest.scripts,
    "js/step-types/definitions.generated.js",
    "js/13-step-type-library.js",
    "js/13a-step-type-runtime.js",
  ];
  scripts.forEach((file) =>
    vm.runInContext(read(file), context, { filename: file }),
  );
  const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
  return {
    manifest,
    helpers: plain([
      ...(context.ATLASStepTypeRuntime.HELPER_NAMES || []),
    ]).sort(),
    blocks: plain([...(context.ATLASStepTypeRuntime.BLOCK_NAMES || [])]).sort(),
    handlers: plain([
      ...(context.ATLASStepTypeRuntime.HANDLER_NAMES || []),
    ]).sort(),
    operators: plain(context.ATLASStepTypes.operators.catalog).filter(
      (entry) => entry.value,
    ),
    operatorSets: plain(context.ATLASStepTypes.operators.sets || {}),
  };
}

const definitionsIn = (dir) =>
  readdirSync(new URL(dir, ROOT))
    .filter(
      (file) =>
        file.endsWith(".json") &&
        !["schema.json", "manifest.json", "controls.json"].includes(file),
    )
    .map((file) => json(`${dir}${file}`));

const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
const code = (value) =>
  value === undefined || value === null || value === ""
    ? ""
    : `\`${String(value).replace(/`/g, "'")}\``;
const table = (head, rows) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");

/** Older params a definition still reads on import (its migrations). */
function olderParams(def) {
  const names = new Set();
  for (const migration of def.migrations || []) {
    if (migration.op === "rename" && migration.from)
      names.add(`${migration.from} → ${migration.param || migration.to}`);
  }
  return [...names];
}

function choices(field) {
  return (field.options || [])
    .map((option) => (typeof option === "string" ? option : option.value))
    .filter((value) => value !== undefined)
    .map((value) => (value === "" ? '`""` (none)' : code(value)))
    .join(", ");
}

function fieldRows(def) {
  // A param can have one field per mode (a hidden copy and a visible one);
  // list it once, under its visible field.
  const byParam = new Map();
  for (const field of def.fields || []) {
    if (["hint", "callout", "readout"].includes(field.control)) continue;
    const seen = byParam.get(field.param);
    if (!seen || (seen.control === "hidden" && field.control !== "hidden"))
      byParam.set(field.param, field);
  }
  return [...byParam.values()].map((field) => [
    code(field.param),
    field.control === "block"
      ? `block \`${field.block}\``
      : field.control === "hidden"
        ? "stored, not shown"
        : field.control,
    field.label || "",
    [
      choices(field) && `Choices: ${choices(field)}`,
      field.default !== undefined &&
        field.default !== "" &&
        `Default: ${code(field.default)}`,
      field.visibleWhen && "Shown only in some modes",
    ]
      .filter(Boolean)
      .join(". "),
  ]);
}

const describe = (def) =>
  def.description ||
  def.picker?.description ||
  {
    reference_source:
      "Start working with a source file. Add one per source, before any step that uses it.",
  }[def.id] ||
  "";

function stepTypeSection(def, contract) {
  const fu = def.export?.fileUtility;
  const fuText = fu?.compiler
    ? `Yes, compiler \`${fu.compiler}\`${fu.when ? ` (${fu.when})` : ""}.`
    : contract.compilers?.[def.id]
      ? `Yes, compiler \`${def.id}\`.`
      : "No File Utility compiler; File Utility lists it as a blocker.";
  const lines = [
    `### ${def.label} — \`${def.id}\``,
    "",
    describe(def),
    "",
    table(
      ["Property", "Value"],
      [
        ["`step_type`", code(def.id)],
        ["`type`", code(def.legacyType || def.id)],
        [
          "Status",
          def.status === "legacy"
            ? "Legacy: existing audits only. Never use it in new audits."
            : def.status,
        ],
        ["Version", String(def.version)],
        [
          "Children",
          def.branches?.length
            ? `${def.branches.map((branch) => branch.toUpperCase()).join(" and ")} branches${def.inverse ? "; offers a linked inverse (ELSE)" : ""}`
            : "None",
        ],
        ["Runs in File Utility", fuText],
      ],
    ),
    "",
  ];
  const rows = fieldRows(def);
  if (rows.length)
    lines.push(
      "**Params**",
      "",
      table(["Param", "Control", "Label", "Notes"], rows),
      "",
    );
  const older = olderParams(def);
  if (older.length)
    lines.push(
      `Older param names still read on import: ${older.map(code).join(", ")}.`,
      "",
    );
  const english = def.english?.default;
  if (english && english.length <= 400)
    lines.push("**English template**", "", "```text", english, "```", "");
  return lines.join("\n");
}

function actionKindSection(kinds, contract) {
  const rows = kinds
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((kind) => {
      const handler = kind.export?.fileUtility?.action || kind.name;
      const support = contract.thenActions?.[handler];
      return [
        code(kind.name),
        kind.picker?.label || kind.label,
        kind.description || "",
        (kind.complete || []).map(code).join(", "),
        support
          ? `${support.status}${support.when ? `: ${support.when}` : ""}`
          : "not supported",
      ];
    });
  return table(
    [
      "`then_action_type`",
      "Picker label",
      "What it does",
      "Params it needs",
      "File Utility",
    ],
    rows,
  );
}

function operatorSection(operators, sets, contract) {
  const modes = (value) =>
    Object.entries(sets)
      .filter(([, list]) => Array.isArray(list) && list.includes(value))
      .map(([mode]) => mode)
      .join(", ");
  const rows = operators.map((entry) => [
    code(entry.value),
    modes(entry.value),
    code(entry.inverse),
    (entry.aliases || []).map(code).join(", "),
    contract.operators?.[entry.value] ? "Yes" : "No (blocker)",
  ]);
  return table(
    [
      "`operator`",
      "Value modes",
      "Opposite (ELSE)",
      "Also read as",
      "Runs in File Utility",
    ],
    rows,
  );
}

function controlSection(palette) {
  const rows = (palette.controls || []).map((control) => [
    code(control.name),
    control.status,
    cell(control.description).slice(0, 220),
  ]);
  return table(["Control", "Status", "What it is"], rows);
}

/** The reference, formatted as prettier formats Markdown in this repository. */
export async function buildReference() {
  const prettier = await import("prettier");
  const options = (await prettier.resolveConfig(REFERENCE.pathname)) || {};
  return prettier.format(referenceText(), { ...options, parser: "markdown" });
}

function referenceText() {
  const runtime = loadRuntime();
  const contract = json("catalogs/file-utility/executable-steps.json");
  const palette = json("catalogs/step-types/controls.json");
  const types = definitionsIn("catalogs/step-types/").sort(
    (a, b) =>
      (a.status === "legacy") - (b.status === "legacy") ||
      (a.order ?? 999) - (b.order ?? 999) ||
      a.id.localeCompare(b.id),
  );
  const kinds = definitionsIn("catalogs/step-types/actions/");
  const active = types.filter((def) => def.status !== "legacy");
  const legacy = types.filter((def) => def.status === "legacy");
  return [
    "# ATLAS Align Step Type Reference",
    "",
    "> Generated by `node tools/build-copilot-agent.mjs` from the ATLAS Align repository. Do not edit by hand.",
    `> Engine ${runtime.manifest.engineVersion}, File Utility contract v${contract.contractVersion}.`,
    "",
    "This file lists the step types, action kinds, operators and editor controls that ship with ATLAS Align. Step types and action kinds published later in the Step Type Builder are **not** here: look for them in the SharePoint step type folder first. A type there with the same `id` and a higher `version` replaces the one below.",
    "",
    "## 1. Step types for new audits",
    "",
    table(
      ["`step_type`", "`type`", "Label", "Use for"],
      active.map((def) => [
        code(def.id),
        code(def.legacyType || def.id),
        def.label,
        describe(def),
      ]),
    ),
    "",
    "The params tables list what each type stores. When you write an audit, follow the recipes in `AUDIT_JSON_FORMAT.md`: for some types (Join, Sort Records, Remove Duplicates) the import builds the stored list params, such as `join_keys_json`, from the simpler params the recipe uses.",
    "",
    ...active.map((def) => stepTypeSection(def, contract)),
    "## 2. Legacy step types",
    "",
    "These still render in older audits. Never put them in a new audit; use the replacement shown.",
    "",
    table(
      ["`step_type`", "Label", "Use instead"],
      legacy.map((def) => [
        code(def.id),
        def.label,
        {
          else: "`if_then` with an ELSE branch (`else` steps are still written by the import for ELSE branches)",
          filter_rows: "`if_then` with `do_not_display`",
          flag_records: "`if_then` with `display_text`",
          union_sources: "`join` with `join_type: UNION`",
        }[def.id] || "",
      ]),
    ),
    "",
    "## 3. Action kinds (`then_action_type`)",
    "",
    "An `if_then` (or `else`) step does one action kind when its conditions are true.",
    "",
    actionKindSection(kinds, contract),
    "",
    "## 4. Condition operators",
    "",
    "Write operators exactly as shown, lowercase. The value mode decides which operators a condition may use.",
    "",
    operatorSection(runtime.operators, runtime.operatorSets, contract),
    "",
    "## 5. For new step types: editor controls",
    "",
    "A step type definition's `fields[].control` must be one of these.",
    "",
    controlSection(palette),
    "",
    "## 6. For new step types: template helpers and File Utility compilers",
    "",
    `**Template helpers** (use only these in \`english\`, \`formulas\`, \`autoNotes\` and \`export\`): ${runtime.helpers.map(code).join(", ")}.`,
    "",
    `**Blocks** (\`control: "block"\`): ${runtime.blocks.map(code).join(", ")}.`,
    "",
    `**Migration handlers**: ${runtime.handlers.map(code).join(", ")}.`,
    "",
    `**Script roles** (\`export.scriptRole\`): ${(json("catalogs/step-types/schema.json").$defs.scriptRole.enum || []).map(code).join(", ")}.`,
    "",
    `**File Utility compilers** (\`export.fileUtility.compiler\`): ${Object.keys(
      contract.compilers || {},
    )
      .map(code)
      .join(
        ", ",
      )}. A new type that needs logic none of these compilers has can be built and published, but File Utility can't run it until a developer adds a compiler.`,
    "",
  ].join("\n");
}

// ---- Packaging -----------------------------------------------------------------

/** A .zip of `files` ([{name, data}]), deflated. */
export function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

/** Every file under `dir` as [{name, data}], names relative to `base`. */
function filesUnder(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory())
      return filesUnder(new URL(`${name}/`, dir), base);
    return [
      { name: url.href.slice(base.href.length), data: readFileSync(url) },
    ];
  });
}

function writePackage() {
  const out = new URL("dist/copilot-agent/", ROOT);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(new URL("knowledge/", out), { recursive: true });
  mkdirSync(new URL("skills/", out), { recursive: true });
  writeFileSync(
    new URL("INSTRUCTIONS.md", out),
    readFileSync(new URL("INSTRUCTIONS.md", COPILOT)),
  );
  const knowledge = new URL("knowledge/", COPILOT);
  for (const name of readdirSync(knowledge))
    writeFileSync(
      new URL(`knowledge/${name}`, out),
      readFileSync(new URL(name, knowledge)),
    );
  const skills = new URL("skills/", COPILOT);
  for (const name of readdirSync(skills)) {
    const dir = new URL(`${name}/`, skills);
    const files = filesUnder(dir).map((file) => ({
      ...file,
      name: `${name}/${file.name}`,
    }));
    writeFileSync(new URL(`skills/${name}.zip`, out), zip(files));
  }
  return out;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("build-copilot-agent.mjs")
) {
  const reference = await buildReference();
  if (process.argv.includes("--check")) {
    const current = readFileSync(REFERENCE, "utf8");
    if (current !== reference) {
      console.error(
        "docs/copilot/knowledge/STEP_TYPE_REFERENCE.md is out of date. Run: node tools/build-copilot-agent.mjs",
      );
      process.exit(1);
    }
    console.log("STEP_TYPE_REFERENCE.md is current.");
  } else {
    writeFileSync(REFERENCE, reference);
    console.log("Wrote docs/copilot/knowledge/STEP_TYPE_REFERENCE.md");
    if (process.argv.includes("--package"))
      console.log(`Wrote ${writePackage().pathname}`);
  }
}
