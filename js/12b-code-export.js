// -----------------------------------------------------------------------------
// Code exports: SQL Server and Python scripts
// -----------------------------------------------------------------------------
// Joins the per-step Developer Logic formulas (02b-developer-formulas.js) into
// one runnable script:
//   SQL    - one SQL Server query: a CTE for each enabled step, each reading the
//            one before it, ending in a final SELECT (with any sort order).
//   Python - a pandas script with the source and output paths to fill in at the
//            top, the steps in a run_audit() function, and one results file.
// A step that cannot become code (free-text actions, missing values) is written
// as a TODO comment, skipped in the chain, and listed in the file header.

const ATLAS_CODE_PLACEHOLDER_KEYS = Object.freeze({
  column_name: "[column name]",
  condition: "[condition]",
  delimiter: "[delimiter]",
  destination_column: "[destination column]",
  expression: "[expression]",
  field: "[field]",
  left_key: "[left key]",
  left_source: "[left source]",
  number: "[number]",
  output_column: "[output column]",
  positive_whole_number: "[positive whole number]",
  right_key: "[right key]",
  right_source: "[right source]",
  source: "[source]",
  target_column: "[target column]",
});
const ATLAS_CODE_NUMBERED_PLACEHOLDER = /\[column \d+ name\]/;
const ATLAS_CODE_SQL_QUALIFIED =
  /\[((?:[^\]]|\]\])+)\]\.\[((?:[^\]]|\]\])+)\]/g;
const ATLAS_CODE_SQL_ASSIGNMENT = / AS (\[(?:[^\]]|\]\])+\])(?=,\n|$)/g;
const ATLAS_CODE_PY_SOURCE = /sources\[("(?:[^"\\]|\\.)*")\]/g;
const ATLAS_CODE_SQL_TEXT = "NVARCHAR(4000)";

// ---- Shared helpers -----------------------------------------------------------

function atlasCodeAudit() {
  return typeof state !== "undefined" && state?.audit ? state.audit : {};
}

function atlasCodeOneLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefixes every line with a comment marker. */
function atlasCodeComment(text, marker) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `${marker} ${line.trimEnd()}` : marker))
    .join("\n");
}

function atlasCodeIndent(text, spaces) {
  const pad = " ".repeat(spaces);
  return String(text ?? "")
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

function atlasCodeUnescapeSqlName(bracketed) {
  return bracketed.slice(1, -1).replace(/]]/g, "]");
}

/** Placeholder text the formulas use when a value is missing. */
function atlasCodePlaceholders() {
  const values = new Set();
  Object.entries(ATLAS_CODE_PLACEHOLDER_KEYS).forEach(([key, fallback]) => {
    values.add(fallback);
    const value = atlasDevPlaceholder(key, fallback);
    if (value) values.add(value);
  });
  return [...values];
}

function atlasCodeMissingValues(text, placeholders) {
  const found = placeholders.filter((value) => text.includes(value));
  const numbered = text.match(ATLAS_CODE_NUMBERED_PLACEHOLDER);
  if (numbered) found.push(numbered[0]);
  return found;
}

/** Developer notes worth keeping in a script (Excel-only notes are dropped). */
function atlasCodeNotes(formulas) {
  return (formulas?.notes || [])
    .filter(Boolean)
    .filter((note) => !/\bExcel\b/.test(note));
}

function atlasCodeAnalystLogic(step) {
  try {
    return typeof analystLogic === "function" ? analystLogic(step) || "" : "";
  } catch (_error) {
    return "";
  }
}

/** Enabled steps in Audit Logic order with their formulas. */
function atlasCodeEntries() {
  if (typeof syncAutoReferenceSteps === "function") syncAutoReferenceSteps();
  const entries =
    typeof hierarchicalStepEntries === "function"
      ? hierarchicalStepEntries({ includeDisabled: false })
      : [];
  return entries.map((entry) => {
    const step = entry.step;
    if (typeof normalizeCatalogStep === "function") normalizeCatalogStep(step);
    let formulas = null;
    try {
      formulas = atlasDeveloperFormulas(step);
    } catch (error) {
      console.warn("Developer Logic could not be generated for a step.", error);
    }
    return {
      number: String(entry.number),
      level: entry.level || 0,
      branch: entry.branchLabel || "",
      step,
      formulas,
      analyst: atlasCodeAnalystLogic(step),
    };
  });
}

/**
 * How the script builders place a step: the script role from its step type
 * definition (`export.scriptRole`), or "none" when no definition claims it.
 */
function atlasCodeStepRole(step) {
  return globalThis.ATLASStepTypeRuntime?.scriptRole?.(step) || "none";
}

/** Steps that start a new data set instead of changing the current one. */
function atlasCodeStartsData(entry) {
  return ["source", "join", "union"].includes(atlasCodeStepRole(entry.step));
}

function atlasCodeIsUnion(step) {
  return (
    atlasCodeStepRole(step) === "union" ||
    String(step?.params?.join_type || "").toUpperCase() === "UNION"
  );
}

/** Alias of the source the first step reads, when it does not name its own. */
function atlasCodePrimaryAlias(entries) {
  const first = entries[0];
  const params = first?.step?.params || {};
  const fromStep = atlasDevSourceAlias(
    params.source_file || first?.step?.source || "",
    params.source_alias,
  );
  if (fromStep) return fromStep;
  let conditions = [];
  try {
    conditions =
      first && typeof parseStepConditions === "function"
        ? parseStepConditions(first.step)
        : [];
  } catch (_error) {
    conditions = [];
  }
  const leaf = (conditions || []).find((item) => item?.sourceFile);
  if (leaf) return atlasDevSourceAlias(leaf.sourceFile, leaf.sourceAlias);
  const source = (atlasCodeAudit().sources || [])[0];
  if (!source) return "";
  return atlasDevSourceAlias(
    source.sourceKey || source.name || source.sourceFile || "",
    source.alias,
  );
}

/** Audit source record for an alias, matched on alias, key, or name. */
function atlasCodeSourceFor(alias) {
  const wanted = String(alias || "").trim();
  if (!wanted) return null;
  return (
    (atlasCodeAudit().sources || []).find((source) =>
      [source.alias, source.sourceKey, source.name, source.sourceFile]
        .filter(Boolean)
        .map(String)
        .includes(wanted),
    ) ||
    (atlasCodeAudit().sources || []).find(
      (source) =>
        atlasDevSourceAlias(
          source.sourceKey || source.name || source.sourceFile || "",
          source.alias,
        ) === wanted,
    ) ||
    null
  );
}

function atlasCodeSourceLabel(alias) {
  const source = atlasCodeSourceFor(alias);
  const label = atlasCodeOneLine(
    source?.name || source?.sourceFile || source?.sourceKey || "",
  );
  return label && label !== alias ? label : "";
}

/** Field names of a source, or null when the audit does not list them. */
function atlasCodeSourceFields(alias) {
  if (typeof fieldsForSource !== "function") return null;
  const source = atlasCodeSourceFor(alias);
  const key = source?.sourceKey || source?.name || source?.sourceFile || alias;
  let fields = [];
  try {
    fields = fieldsForSource(key) || [];
  } catch (_error) {
    fields = [];
  }
  const names = [];
  fields.forEach((field) => {
    const name = String(
      field?.fieldName || field?.rawFieldName || field?.name || "",
    ).trim();
    if (name && !names.includes(name)) names.push(name);
  });
  return names.length ? names : null;
}

/**
 * Tracks the columns of the current data set so a script knows when a step
 * overwrites a column and which columns a join renames. `list` is null when
 * the audit does not list a source's columns; `added` then stands in.
 */
function atlasCodeColumnTracker(unknownSources) {
  const tracker = {
    list: null,
    added: new Set(),
    // "alias\u0000field" -> column name after a join renamed it.
    renames: new Map(),
    startFrom(alias) {
      tracker.list = atlasCodeSourceFields(alias);
      if (!tracker.list) unknownSources.add(alias);
      tracker.added = new Set();
      tracker.renames = new Map();
    },
    has: (column) =>
      tracker.list ? tracker.list.includes(column) : tracker.added.has(column),
    add(column) {
      if (tracker.list && !tracker.list.includes(column))
        tracker.list.push(column);
      tracker.added.add(column);
    },
    /**
     * Adds the right source's columns for a join, matching pandas merge with
     * suffixes=("", "_<right>"): a name already taken gets the suffix, and a
     * key named the same on both sides is kept once. Returns the added
     * columns, or null when the right source's columns are unknown.
     */
    join(params, right) {
      const fields = atlasCodeSourceFields(right);
      if (!fields) {
        unknownSources.add(right);
        tracker.list = null;
        return null;
      }
      const pairs =
        typeof atlasJoinKeyPairsInUse === "function"
          ? atlasJoinKeyPairsInUse(params)
          : [
              {
                left_field: params.left_field,
                right_field: params.right_field,
              },
            ];
      const shared = new Set(
        (pairs || [])
          .filter(
            (pair) => pair.left_field && pair.left_field === pair.right_field,
          )
          .map((pair) => pair.right_field),
      );
      return fields
        .filter((field) => !shared.has(field))
        .map((field) => {
          const column = tracker.has(field) ? `${field}_${right}` : field;
          if (column !== field)
            tracker.renames.set(`${right}\u0000${field}`, column);
          tracker.add(column);
          return { field, column };
        });
    },
  };
  return tracker;
}

/** Columns a step's SQL assigns (`expr AS [Column]`). */
function atlasCodeAssignedColumns(sql) {
  const columns = [];
  String(sql || "").replace(ATLAS_CODE_SQL_ASSIGNMENT, (match, target) => {
    columns.push(atlasCodeUnescapeSqlName(target));
    return match;
  });
  return columns;
}

/** Text for the step comment: number, branch, and the Analyst Logic. */
function atlasCodeStepHeading(entry) {
  const branch =
    entry.level > 0 && entry.branch ? ` (${entry.branch} branch)` : "";
  const title = atlasCodeOneLine(entry.step?.title || "");
  return [
    `Step ${entry.number}${branch}${title ? `: ${title}` : ""}`,
    entry.analyst,
  ]
    .filter(Boolean)
    .join("\n");
}

function atlasCodeFreeformReason(entry) {
  const note = (entry.formulas?.notes || []).find(Boolean);
  return note
    ? note.replace(/^Note:\s*/, "")
    : "The step only marks matching rows, so there is no change to make.";
}

/** The step's code for one dialect, or the reason it cannot be converted. */
function atlasCodeClassify(entry, dialect, placeholders) {
  const formulas = entry.formulas;
  const role = atlasCodeStepRole(entry.step);
  const code = String(formulas?.[dialect] || "").trim();
  if (!formulas) return { gap: "This step type has no code equivalent." };
  if (!code) {
    if (role === "else" && formulas.lead) return { note: formulas.lead };
    return {
      gap: formulas.lead
        ? `${formulas.lead} The step has no code of its own.`
        : "This step has no code equivalent.",
    };
  }
  const missing = atlasCodeMissingValues(code, placeholders);
  if (missing.length)
    return {
      gap: `Missing ${missing.length === 1 ? "value" : "values"}: ${missing.join(", ")}.`,
      code,
    };
  const isCondition = ["condition", "else", "filter", "flag"].includes(role);
  if (isCondition) {
    const sql = String(formulas.sql || "");
    const acts = sql.startsWith("WHERE ") || /\bAS \[/.test(sql);
    if (!acts) return { gap: atlasCodeFreeformReason(entry), code };
  }
  return { code };
}

function atlasCodeHeaderLines({ title, entries, gaps, reviews }) {
  const audit = atlasCodeAudit();
  const name = atlasCodeOneLine(audit.name || "Untitled audit");
  const date = typeof today === "function" ? today() : "";
  const lines = [
    `${name} - ${title}`,
    `Exported from ATLAS Align${date ? ` on ${date}` : ""}. ${entries.length} enabled ${entries.length === 1 ? "step" : "steps"}; disabled steps are left out.`,
    "Generated from Developer Logic. Review the code and test it on sample data before relying on the results.",
  ];
  if (gaps.length) {
    lines.push(
      "",
      `TODO: ${gaps.length} ${gaps.length === 1 ? "step" : "steps"} could not be converted and ${gaps.length === 1 ? "is" : "are"} skipped below:`,
      ...gaps.map((gap) => `  - Step ${gap.number}: ${gap.reason}`),
    );
  }
  if (reviews.length)
    lines.push("", "Review:", ...reviews.map((item) => `  - ${item}`));
  return lines;
}

function atlasCodeNestedReview(entries) {
  const nested = entries.filter((entry) => entry.level > 0);
  if (!nested.length) return [];
  return [
    `Steps ${nested.map((entry) => entry.number).join(", ")} are nested under another step. Their code runs on every row; add the parent step's condition if they should only apply to the parent's matching rows.`,
  ];
}

// ---- SQL Server ---------------------------------------------------------------

/**
 * Builds the SQL Server script: one CTE per step, each reading the previous
 * one. Tracks the current column list so steps that overwrite a column can
 * list the columns explicitly (SQL Server has no SELECT * EXCEPT).
 */
function buildAuditSqlScript() {
  const entries = atlasCodeEntries();
  const placeholders = atlasCodePlaceholders();
  const ctes = [];
  const gaps = [];
  const reviews = atlasCodeNestedReview(entries);
  const tables = new Set();
  const unknownSources = new Set();
  const used = new Set();
  const columns = atlasCodeColumnTracker(unknownSources);
  const data = { previous: "", order: "" };
  const name = (value) => atlasDevSqlName(value);
  const cteName = (number, suffix = "") => {
    let base = `step_${String(number).replace(/[^A-Za-z0-9]+/g, "_")}${suffix}`;
    let candidate = base;
    let counter = 2;
    while (used.has(candidate)) candidate = `${base}_${counter++}`;
    used.add(candidate);
    return candidate;
  };
  const addCte = (cteId, body, comment = "") => {
    ctes.push({ name: cteId, body, comment });
    data.previous = cteId;
  };
  const useTable = (alias) => {
    tables.add(alias);
    return name(alias);
  };
  const setColumnsFrom = (alias) => columns.startFrom(alias);
  const hasColumn = (column) => columns.has(column);
  const addColumn = (column) => columns.add(column);
  // Later CTEs read one data set, so [alias].[field] becomes the column name.
  const unqualify = (sql) =>
    sql.replace(ATLAS_CODE_SQL_QUALIFIED, (_match, alias, field) => {
      const a = alias.replace(/]]/g, "]");
      const f = field.replace(/]]/g, "]");
      return name(columns.renames.get(`${a}\u0000${f}`) || f);
    });
  const ensureData = () => {
    if (data.previous) return true;
    const alias = atlasCodePrimaryAlias(entries);
    if (!alias) return false;
    setColumnsFrom(alias);
    addCte(
      "source_data",
      `SELECT * FROM ${useTable(alias)} AS ${name(alias)}`,
      `Source data: ${alias}${atlasCodeSourceLabel(alias) ? ` (${atlasCodeSourceLabel(alias)})` : ""}`,
    );
    return true;
  };

  const assign = (entry, sql, heading) => {
    const segments = [];
    let start = 0;
    sql.replace(ATLAS_CODE_SQL_ASSIGNMENT, (match, target, offset) => {
      segments.push({
        expression: sql.slice(start, offset).replace(/^,\n/, "").trim(),
        target: atlasCodeUnescapeSqlName(target),
      });
      start = offset + match.length;
      return match;
    });
    if (!segments.length || sql.slice(start).replace(/^,\n/, "").trim())
      return false;
    segments.forEach((segment, index) => {
      const column = name(segment.target);
      let expression = unqualify(segment.expression);
      const exists = hasColumn(segment.target);
      if (!exists && expression.includes(column))
        // An appended message on the first step that writes the column.
        expression = expression
          .split(column)
          .join(`CAST(NULL AS ${ATLAS_CODE_SQL_TEXT})`);
      if (
        exists &&
        /^CASE WHEN /.test(expression) &&
        !/ ELSE /.test(expression)
      )
        // Rows that fail the test keep their current value.
        expression = expression.replace(/ END$/, ` ELSE ${column} END`);
      const select =
        exists && columns.list
          ? columns.list
              .map((item) =>
                item === segment.target
                  ? `${expression} AS ${column}`
                  : name(item),
              )
              .join(",\n       ")
          : `*, ${expression} AS ${column}`;
      if (exists && !columns.list)
        reviews.push(
          `Step ${entry.number} overwrites ${column}, but the source columns are not listed in the audit. Replace SELECT * in that step with the column list so ${column} is not selected twice.`,
        );
      addCte(
        cteName(entry.number, index ? `_${index + 1}` : ""),
        `SELECT ${select}\nFROM ${data.previous}`,
        index ? "" : heading,
      );
      addColumn(segment.target);
    });
    return true;
  };

  const dedupe = (entry, sql, heading) => {
    const partition = sql.match(
      /PARTITION BY ([\s\S]*?) ORDER BY|PARTITION BY ([\s\S]*?)\)/,
    );
    const by = unqualify((partition?.[1] || partition?.[2] || "").trim());
    if (!by) return false;
    const action = entry.step.params?.duplicate_action || "Keep first record";
    const order = data.order || "(SELECT NULL)";
    const rank = name("Duplicate Rank");
    const count = name("Duplicate Count");
    const helpers = [];
    let keep = `${rank} = 1`;
    if (action === "Drop all duplicated records") {
      helpers.push(`COUNT(*) OVER (PARTITION BY ${by}) AS ${count}`);
      keep = `${count} = 1`;
    } else {
      helpers.push(
        `ROW_NUMBER() OVER (PARTITION BY ${by} ORDER BY ${order}) AS ${rank}`,
      );
      if (action === "Keep last record") {
        helpers.push(`COUNT(*) OVER (PARTITION BY ${by}) AS ${count}`);
        keep = `${rank} = ${count}`;
      }
    }
    const ranked = cteName(entry.number, "_ranked");
    addCte(
      ranked,
      `SELECT *, ${helpers.join(", ")}\nFROM ${data.previous}`,
      heading,
    );
    const kept = columns.list
      ? columns.list.map((item) => name(item)).join(",\n       ")
      : "*";
    addCte(
      cteName(entry.number),
      `SELECT ${kept}\nFROM ${ranked}\nWHERE ${keep}`,
    );
    if (!columns.list) {
      addColumn("Duplicate Rank");
      if (helpers.length > 1 || action === "Drop all duplicated records")
        addColumn("Duplicate Count");
    }
    return true;
  };

  const join = (entry, sql, heading) => {
    const params = entry.step.params || {};
    const left =
      atlasDevSourceAlias(params.left_source, params.left_alias) || "";
    const right =
      atlasDevSourceAlias(params.right_source, params.right_alias) || "";
    const lines = sql.split("\n");
    const joinLine = lines.findIndex((line) => / JOIN /.test(` ${line} `));
    if (!left || !right || joinLine < 1) return false;
    const on = lines
      .slice(joinLine + 1)
      .join("\n")
      .trim();
    const joinType = lines[joinLine].split(" [")[0].trim();
    const leftFrom = data.previous
      ? `${data.previous} AS ${name(left)}`
      : `${useTable(left)} AS ${name(left)}`;
    if (!data.previous) setColumnsFrom(left);
    useTable(right);
    const added = columns.join(params, right);
    const rightSelect = added
      ? added
          .map(({ field, column }) =>
            column === field
              ? `${name(right)}.${name(field)}`
              : `${name(right)}.${name(field)} AS ${name(column)}`,
          )
          .join(",\n       ")
      : `${name(right)}.*`;
    addCte(
      cteName(entry.number),
      `SELECT ${name(left)}.*,\n       ${rightSelect}\nFROM ${leftFrom}\n${joinType} ${name(right)} AS ${name(right)}\n  ${on}`,
      heading,
    );
    return true;
  };

  entries.forEach((entry) => {
    const heading = atlasCodeStepHeading(entry);
    const result = atlasCodeClassify(entry, "sql", placeholders);
    const skip = (reason, code = "") => {
      gaps.push({ number: entry.number, reason });
      ctes.push({
        comment: [
          `TODO (skipped) ${heading}`,
          `Reason: ${reason}`,
          ...(code ? ["Developer Logic:", code] : []),
        ].join("\n"),
      });
    };
    if (result.note) {
      ctes.push({ comment: `${heading}\n${result.note}` });
      return;
    }
    if (result.gap) return skip(result.gap, result.code);
    const sql = result.code;
    const role = atlasCodeStepRole(entry.step);
    const notes = atlasCodeNotes(entry.formulas);
    const withNotes = [heading, ...notes].join("\n");

    if (role === "source") {
      const alias = atlasDevSourceAlias(
        entry.step.params?.source_file || entry.step.source || "",
        entry.step.params?.source_alias,
      );
      if (!alias) return skip("The step does not name a source.");
      setColumnsFrom(alias);
      const table = sql.match(/^SELECT \* FROM (\[(?:[^\]]|\]\])+\])/);
      if (table) tables.add(atlasCodeUnescapeSqlName(table[1]));
      addCte(cteName(entry.number), sql, withNotes);
      return;
    }
    if (atlasCodeIsUnion(entry.step)) {
      const params = entry.step.params || {};
      const left = atlasDevSourceAlias(
        params.left_source || params.union_left_source,
        params.left_alias || params.union_left_alias,
      );
      const right = atlasDevSourceAlias(
        params.right_source || params.union_right_source,
        params.right_alias || params.union_right_alias,
      );
      if (!data.previous) setColumnsFrom(left);
      const from = data.previous || useTable(left);
      addCte(
        cteName(entry.number),
        `SELECT * FROM ${from}\nUNION ALL\nSELECT * FROM ${useTable(right)}`,
        withNotes,
      );
      return;
    }
    if (role === "join") {
      if (!join(entry, sql, withNotes))
        skip("The join could not be placed in the script.", sql);
      return;
    }
    if (!ensureData())
      return skip(
        "No source is selected for the audit, so there is no data to start from.",
        sql,
      );
    if (role === "sort") {
      data.order = unqualify(sql.replace(/^ORDER BY /, ""));
      ctes.push({
        comment: `${withNotes}\nThe sort order is applied in the final SELECT (and to later Remove Duplicates steps).`,
      });
      return;
    }
    if (role === "dedupe") {
      if (!dedupe(entry, sql, withNotes))
        skip("The duplicate check could not be placed in the script.", sql);
      return;
    }
    if (sql.startsWith("WHERE ")) {
      addCte(
        cteName(entry.number),
        `SELECT *\nFROM ${data.previous}\n${unqualify(sql)}`,
        withNotes,
      );
      return;
    }
    if (/CROSS APPLY/.test(sql))
      return skip(
        "Splitting into a varying number of columns returns one row per part in SQL Server; pivot the parts into columns by hand.",
        sql,
      );
    if (!assign(entry, sql, withNotes))
      skip("The SQL could not be placed in the script.", sql);
  });

  if (!entries.length) ensureData();
  if (unknownSources.size)
    reviews.push(
      `The audit does not list the columns of ${[...unknownSources].join(", ")}, so those steps use SELECT *. Check for columns selected twice.`,
    );

  const header = atlasCodeHeaderLines({
    title: "SQL Server audit query",
    entries,
    gaps,
    reviews,
  });
  if (tables.size)
    header.push(
      "",
      "Source tables (replace these names if your tables are named differently):",
      ...[...tables].map((alias) => {
        const label = atlasCodeSourceLabel(alias);
        return `  - ${name(alias)}${label ? `: ${label}` : ""}`;
      }),
    );
  const parts = [atlasCodeComment(header.join("\n"), "--"), ""];
  if (!data.previous) {
    parts.push(
      atlasCodeComment(
        "The audit has no source or step that produces data yet. Add a source and at least one step, then export again.",
        "--",
      ),
    );
    ctes
      .filter((item) => item.comment)
      .forEach((item) => parts.push("", atlasCodeComment(item.comment, "--")));
    return `${parts.join("\n")}\n`;
  }
  // Comments count as whitespace in T-SQL, so step comments sit just above
  // their CTE, and skipped steps sit above the next CTE or the final SELECT.
  const definitions = [];
  let pending = [];
  ctes.forEach((item) => {
    if (item.comment) pending.push(atlasCodeComment(item.comment, "--"));
    if (!item.name) return;
    const cte = `${item.name} AS (\n${atlasCodeIndent(item.body, 2)}\n)`;
    // A skipped step's comment stands apart from the next step's comment.
    const leading = pending.slice(0, -1).map((comment) => `${comment}\n`);
    definitions.push([...leading, ...pending.slice(-1), cte].join("\n"));
    pending = [];
  });
  parts.push(
    `WITH\n${definitions.join(",\n\n")}`,
    "",
    ...pending.map((comment) => `${comment}\n`),
    `SELECT *\nFROM ${data.previous}${data.order ? `\nORDER BY ${data.order}` : ""};`,
  );
  return `${parts.join("\n")}\n`;
}

// ---- Python (pandas) ----------------------------------------------------------

function atlasCodePySources(code) {
  const aliases = [];
  String(code || "").replace(ATLAS_CODE_PY_SOURCE, (match, literal) => {
    try {
      const alias = JSON.parse(literal);
      if (alias && !aliases.includes(alias)) aliases.push(alias);
    } catch (_error) {
      // Not a plain string literal; leave it out of SOURCE_PATHS.
    }
    return match;
  });
  return aliases;
}

/** Builds the pandas script with source and output paths to fill in. */
function buildAuditPythonScript() {
  const entries = atlasCodeEntries();
  const placeholders = atlasCodePlaceholders();
  const gaps = [];
  const reviews = atlasCodeNestedReview(entries);
  const blocks = [];
  const columns = atlasCodeColumnTracker(new Set());
  let hasData = false;

  if (entries.length && !atlasCodeStartsData(entries[0])) {
    const alias = atlasCodePrimaryAlias(entries);
    if (alias) {
      const label = atlasCodeSourceLabel(alias);
      blocks.push(
        `# Source data: ${alias}${label ? ` (${atlasCodeOneLine(label)})` : ""}\ndf = ${atlasDevPySource(alias)}.copy()`,
      );
      columns.startFrom(alias);
      hasData = true;
    }
  }

  entries.forEach((original) => {
    let entry = original;
    // After a join renames clashing columns, rebuild the step's formulas so
    // its pandas references point at the renamed columns.
    if (columns.renames.size && entry.formulas) {
      atlasDevPythonRenames = columns.renames;
      try {
        entry = { ...entry, formulas: atlasDeveloperFormulas(entry.step) };
      } catch (_error) {
        entry = original;
      } finally {
        atlasDevPythonRenames = null;
      }
    }
    const heading = atlasCodeComment(atlasCodeStepHeading(entry), "#");
    const result = atlasCodeClassify(entry, "python", placeholders);
    if (result.note) {
      blocks.push(`${heading}\n${atlasCodeComment(result.note, "#")}`);
      return;
    }
    let code = result.code || "";
    if (!result.gap && !hasData && !atlasCodeStartsData(entry))
      result.gap =
        "No source is selected for the audit, so there is no data to start from.";
    if (result.gap) {
      gaps.push({ number: entry.number, reason: result.gap });
      blocks.push(
        [
          atlasCodeComment(
            `TODO (skipped) ${atlasCodeStepHeading(entry)}`,
            "#",
          ),
          atlasCodeComment(`Reason: ${result.gap}`, "#"),
          ...(code
            ? [
                atlasCodeComment("Developer Logic:", "#"),
                atlasCodeComment(code, "#"),
              ]
            : []),
        ].join("\n"),
      );
      return;
    }
    const role = atlasCodeStepRole(entry.step);
    const params = entry.step.params || {};
    if (role === "join" && !atlasCodeIsUnion(entry.step)) {
      const left = atlasDevSourceAlias(params.left_source, params.left_alias);
      const right = atlasDevSourceAlias(
        params.right_source,
        params.right_alias,
      );
      if (hasData)
        code = code.replace(
          /^df = sources\[[^\]]*\]\.merge\(/,
          "df = df.merge(",
        );
      else columns.startFrom(left);
      if (right) {
        code = code.replace(
          /\)$/,
          `, suffixes=("", ${atlasDevPyString(`_${right}`)}))`,
        );
        columns.join(params, right);
      }
    } else if (atlasCodeIsUnion(entry.step)) {
      if (hasData)
        code = code.replace(
          /^df = pd\.concat\(\[sources\[[^\]]*\], /,
          "df = pd.concat([df, ",
        );
      else
        columns.startFrom(
          atlasDevSourceAlias(
            params.left_source || params.union_left_source,
            params.left_alias || params.union_left_alias,
          ),
        );
    } else if (role === "source") {
      columns.startFrom(
        atlasDevSourceAlias(
          params.source_file || entry.step.source || "",
          params.source_alias,
        ),
      );
    } else {
      atlasCodeAssignedColumns(entry.formulas?.sql).forEach((column) =>
        columns.add(column),
      );
    }
    const notes = atlasCodeNotes(entry.formulas).map((note) =>
      atlasCodeComment(note, "#"),
    );
    blocks.push([heading, ...notes, code].join("\n"));
    hasData = true;
  });

  const aliases = atlasCodePySources(
    blocks.filter((block) => !block.startsWith("# TODO")).join("\n"),
  );
  const header = atlasCodeHeaderLines({
    title: "Python (pandas) audit script",
    entries,
    gaps,
    reviews,
  });
  header.push(
    "",
    "Before running: fill in SOURCE_PATHS and OUTPUT_PATH below.",
    "Requires pandas and numpy, plus openpyxl to read or write Excel files.",
  );
  const sourceLines = aliases.length
    ? aliases.map((alias) => {
        const label = atlasCodeSourceLabel(alias);
        return `    ${atlasDevPyString(alias)}: "",${label ? `  # ${atlasCodeOneLine(label)}` : ""}`;
      })
    : ["    # The audit logic does not read any source yet."];
  const body = blocks.length
    ? blocks.join("\n\n")
    : "# The audit has no enabled steps yet.";
  const returnLine = hasData ? "return df" : "return pd.DataFrame()";

  return `${atlasCodeComment(header.join("\n"), "#")}

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# -----------------------------------------------------------------------------
# Required variables: set these paths before running
# -----------------------------------------------------------------------------
# Source files to read, one per source the audit uses (.csv, .txt, .xlsx, .xls).
SOURCE_PATHS = {
${sourceLines.join("\n")}
}

# File to write the audit results to (.csv or .xlsx).
OUTPUT_PATH = ""

# -----------------------------------------------------------------------------
# Reading and writing files
# -----------------------------------------------------------------------------
EXCEL_EXTENSIONS = {".xlsx", ".xlsm", ".xls"}
TEXT_EXTENSIONS = {".csv", ".txt"}


def check_paths():
    """Stops with a message when a required path is blank or a file is missing."""
    blank = [f"SOURCE_PATHS[{name!r}]" for name, path in SOURCE_PATHS.items() if not path]
    if not OUTPUT_PATH:
        blank.append("OUTPUT_PATH")
    if blank:
        sys.exit("Set these paths at the top of the script: " + ", ".join(blank))
    missing = [path for path in SOURCE_PATHS.values() if not Path(path).is_file()]
    if missing:
        sys.exit("These source files were not found: " + ", ".join(missing))


def read_source(path):
    """Reads a source file, choosing the reader from its extension."""
    extension = Path(path).suffix.lower()
    if extension in EXCEL_EXTENSIONS:
        return pd.read_excel(path)
    if extension in TEXT_EXTENSIONS:
        return pd.read_csv(path)
    sys.exit(f"{path}: use a .csv, .txt, .xlsx or .xls file.")


def write_output(df, path):
    """Writes the results, choosing the writer from the file extension."""
    extension = Path(path).suffix.lower()
    if extension in EXCEL_EXTENSIONS:
        df.to_excel(path, index=False)
    elif extension in TEXT_EXTENSIONS:
        df.to_csv(path, index=False)
    else:
        sys.exit(f"{path}: OUTPUT_PATH must end in .csv or .xlsx.")


# -----------------------------------------------------------------------------
# Audit logic
# -----------------------------------------------------------------------------
def run_audit(sources):
    """Runs the audit steps in order and returns the results."""
${atlasCodeIndent(body, 4)}

    ${returnLine}


def main():
    check_paths()
    sources = {name: read_source(path) for name, path in SOURCE_PATHS.items()}
    results = run_audit(sources)
    write_output(results, OUTPUT_PATH)
    print(f"Wrote {len(results):,} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
`;
}
