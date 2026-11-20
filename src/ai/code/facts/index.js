/**
 * Facts for ingested code: one facts object per file, with every statement
 * and flag carrying its { file, cell, line } address.
 */
import { sqlFacts } from "./sql.js";
import { mergeInto, pythonFacts } from "./python.js";

export { sqlFacts, pythonFacts };

/** Constructs ATLAS has no step type for yet (§4.5 Step type needed). */
export const UNSUPPORTED_KINDS = Object.freeze(
  new Set([
    "group_by",
    "window",
    "pivot",
    "pivot_table",
    "melt",
    "crosstab",
    "apply",
    "merge",
    "cursor",
    "dynamic_sql",
    "dynamic_code",
    "exec",
    "control_flow",
    "loop",
    "helper",
    "top",
    "unsupported_library",
    "set_from_query",
    "transform",
    "resample",
    "rolling",
    "expanding",
    "stack",
    "unstack",
    "explode",
    "cumsum",
    "cumcount",
    "rank",
    "shift",
    "diff",
    "agg",
    "aggregate",
  ]),
);

function sqlFile(file) {
  const cells = file.cells.filter((cell) => cell.kind === "code");
  const statements = [];
  const merged = {
    language: "sql",
    statements,
    datasets: [],
    identifiers: { tables: [], columns: [] },
    params: [],
    flags: [],
  };
  for (const cell of cells) {
    const facts = sqlFacts(cell.lines.join("\n"));
    const at = (item) => ({ ...item, file: file.id, cell: cell.index });
    statements.push(
      ...facts.statements.map((s) =>
        at({ ...s, id: `s${statements.length + Number(s.id.slice(1))}` }),
      ),
    );
    merged.datasets.push(...facts.datasets.map(at));
    merged.params.push(...facts.params.map(at));
    merged.flags.push(...facts.flags.map(at));
    merged.identifiers.tables.push(...facts.identifiers.tables);
    merged.identifiers.columns.push(...facts.identifiers.columns);
  }
  const defined = new Set(merged.datasets.map((d) => d.name.toLowerCase()));
  merged.identifiers.tables = [...new Set(merged.identifiers.tables)].filter(
    (t) => !defined.has(t.toLowerCase()),
  );
  merged.identifiers.columns = [...new Set(merged.identifiers.columns)];
  return merged;
}

function pythonFile(file) {
  const facts = pythonFacts("");
  for (const cell of file.cells)
    if (cell.kind === "code")
      mergeInto(facts, cell.lines.join("\n"), { cell: cell.index });
  const at = (item) => ({ ...item, file: file.id });
  return {
    ...facts,
    statements: facts.statements.map(at),
    datasets: facts.datasets.map(at),
    params: facts.params.map(at),
    flags: facts.flags.map(at),
  };
}

/** { files: [{ id, name, language, facts }] } for ingestCode() output. */
export function codeFacts(ingested) {
  return {
    files: ingested.files.map((file) => ({
      id: file.id,
      name: file.name,
      language: file.language,
      facts: file.language === "sql" ? sqlFile(file) : pythonFile(file),
    })),
  };
}
