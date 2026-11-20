/**
 * pandas facts: a deterministic inventory of what a pandas script does, in
 * the same shape as the T-SQL facts. Not a parser. It reads logical lines and
 * recognizes the pandas calls ATLAS can express, and flags the rest.
 */
import { closing, isName, isP, pythonLines } from "./python-tokens.js";

const COMPARE = new Set(["==", "!=", "<", ">", "<=", ">="]);
const METHOD_OPS = { eq: "==", ne: "!=", lt: "<", gt: ">", le: "<=", ge: ">=" };
const NULL_TESTS = {
  isna: "is null",
  isnull: "is null",
  notna: "is not null",
  notnull: "is not null",
};
const STR_TESTS = {
  contains: "contains",
  startswith: "starts with",
  endswith: "ends with",
  match: "matches",
};
const READERS =
  /^read_(csv|excel|sql|sql_query|sql_table|parquet|json|table|fwf|pickle|feather|xml|html)$/;
const WRITERS = /^to_(excel|csv|parquet|json|sql|pickle|feather|html|xml)$/;
const AGGREGATING = new Set([
  "groupby",
  "pivot_table",
  "pivot",
  "melt",
  "agg",
  "aggregate",
  "transform",
  "resample",
  "rolling",
  "expanding",
  "crosstab",
  "stack",
  "unstack",
  "explode",
  "cumsum",
  "cumcount",
  "rank",
  "shift",
  "diff",
]);
const FORMATTING = new Set([
  "astype",
  "zfill",
  "strip",
  "lstrip",
  "rstrip",
  "upper",
  "lower",
  "title",
  "replace",
  "fillna",
  "slice",
  "pad",
  "ljust",
  "rjust",
  "to_datetime",
  "to_numeric",
  "round",
  "dt",
  "split",
  "len",
  "cat",
  "get",
  "strftime",
]);
// Calls that can appear in a boolean mask without making it something else.
const MASK_METHODS = new Set([
  ...FORMATTING,
  ...Object.keys(METHOD_OPS),
  ...Object.keys(NULL_TESTS),
  ...Object.keys(STR_TESTS),
  "isin",
  "between",
  "str",
  "any",
  "all",
]);
// Row-by-row loops. A plain for over a dict or list is ordinary setup code.
const LOOPS = new Set(["iterrows", "itertuples", "iteritems"]);
const UNSUPPORTED_LIBRARIES = {
  pyspark: "pyspark",
  polars: "polars",
  dask: "dask",
  modin: "modin",
  vaex: "vaex",
};
const PLOTTING = new Set(["matplotlib", "seaborn", "plotly"]);

const isLiteral = (t) => t && ["string", "number", "mask"].includes(t.type);
const literal = (t) => (t.type === "string" ? t.value : t.raw);
const uniq = (items) => [
  ...new Set(items.filter((x) => x !== null && x !== undefined && x !== "")),
];

/** Splits tokens at depth-0 commas. */
function splitArgs(tokens) {
  const out = [[]];
  let depth = 0;
  tokens.forEach((t) => {
    if (t.type === "punct" && "([{".includes(t.raw)) depth += 1;
    if (t.type === "punct" && ")]}".includes(t.raw)) depth -= 1;
    if (depth === 0 && isP(t, ",")) out.push([]);
    else out.at(-1).push(t);
  });
  return out.filter((a) => a.length);
}

/** Call arguments at `open` (the '('): { positional: [tokens], kw: { name: tokens } }. */
function args(tokens, open) {
  const close = closing(tokens, open);
  const positional = [];
  const kw = {};
  splitArgs(tokens.slice(open + 1, close)).forEach((arg) => {
    if (isName(arg[0]) && arg[1]?.type === "op" && arg[1].raw === "=")
      kw[arg[0].raw] = arg.slice(2);
    else positional.push(arg);
  });
  return { positional, kw, close };
}

/** A literal, list or tuple of literals, or dict of literals → JS value. */
function value(tokens) {
  if (!tokens?.length) return undefined;
  if (tokens.length === 1) {
    const t = tokens[0];
    if (isLiteral(t)) return literal(t);
    if (isName(t, "True")) return true;
    if (isName(t, "False")) return false;
    if (isName(t, "None")) return null;
    return undefined;
  }
  if (
    tokens.length === 2 &&
    tokens[0].raw === "-" &&
    tokens[1].type === "number"
  )
    return `-${tokens[1].raw}`;
  const open = tokens[0];
  if (
    (isP(open, "[") || isP(open, "(")) &&
    closing(tokens, 0) === tokens.length - 1
  ) {
    const items = splitArgs(tokens.slice(1, -1)).map(value);
    return items.every((x) => x !== undefined) ? items : undefined;
  }
  if (isP(open, "{") && closing(tokens, 0) === tokens.length - 1) {
    const out = {};
    for (const pair of splitArgs(tokens.slice(1, -1))) {
      const colon = pair.findIndex((t) => isP(t, ":"));
      if (colon < 0) return undefined;
      out[value(pair.slice(0, colon))] = value(pair.slice(colon + 1));
    }
    return out;
  }
  return undefined;
}

const list = (v) =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

/**
 * Column references: X["col"], X['col'], and X.loc[..., "col"].
 * Returns [{ df, column, at, end }] where end is the index after the ref.
 */
function columnRefs(tokens) {
  const out = [];
  tokens.forEach((t, i) => {
    if (!isP(t, "[")) return;
    const prev = tokens[i - 1];
    if (!prev || !(isName(prev) || isP(prev, "]") || isP(prev, ")"))) return;
    const close = closing(tokens, i);
    const inner = tokens.slice(i + 1, close);
    const v = value(inner);
    if (typeof v === "string")
      out.push({
        df: isName(prev) ? prev.raw : null,
        column: v,
        at: i - 1,
        end: close + 1,
      });
  });
  return out;
}

/** Conditions in an expression: [{ column, op, value?, values?, compareColumn?, via? }]. */
function conditions(tokens, masks = new Map()) {
  const out = [];
  const refs = columnRefs(tokens);
  let negate = false;
  refs.forEach((ref) => {
    let j = ref.end;
    const via = [];
    // Skip transforms such as .str.strip(), .astype(str), .fillna("")
    while (isP(tokens[j], ".") && isName(tokens[j + 1])) {
      const method = tokens[j + 1].raw;
      if (
        method in METHOD_OPS ||
        method in NULL_TESTS ||
        method === "isin" ||
        method === "between"
      )
        break;
      if (
        method === "str" &&
        tokens[j + 2] &&
        isP(tokens[j + 2], ".") &&
        tokens[j + 3]?.raw in STR_TESTS
      ) {
        j += 2;
        break;
      }
      via.push(method);
      j += 2;
      if (isP(tokens[j], "(")) j = closing(tokens, j) + 1;
    }
    const t = tokens[j];
    const base = {
      column: ref.column,
      ...(via.length ? { via: via.filter((v) => v !== "str") } : {}),
    };
    if (t?.type === "op" && COMPARE.has(t.raw)) {
      const rest = tokens.slice(j + 1);
      const other = columnRefs(rest)[0];
      if (other && other.at === 0)
        return out.push({ ...base, op: t.raw, compareColumn: other.column });
      const v = value(rest.slice(0, 1)) ?? value(rest.slice(0, 2));
      if (
        v === undefined &&
        isName(rest[0]) &&
        !isP(rest[1], "[") &&
        !isP(rest[1], ".") &&
        !isP(rest[1], "(")
      )
        return out.push({ ...base, op: t.raw, variable: rest[0].raw });
      return out.push({
        ...base,
        op: t.raw,
        ...(v !== undefined ? { value: v } : {}),
      });
    }
    if (isP(t, ".") && isName(tokens[j + 1])) {
      const method = tokens[j + 1].raw;
      const call = isP(tokens[j + 2], "(") ? args(tokens, j + 2) : null;
      if (method in METHOD_OPS) {
        const other = call && columnRefs(call.positional[0] || [])[0];
        if (other)
          return out.push({
            ...base,
            op: METHOD_OPS[method],
            compareColumn: other.column,
          });
        return out.push({
          ...base,
          op: METHOD_OPS[method],
          value: value(call?.positional[0]),
        });
      }
      if (method in NULL_TESTS)
        return out.push({ ...base, op: NULL_TESTS[method] });
      if (method === "isin")
        return out.push({
          ...base,
          op: "in",
          values: list(value(call?.positional[0])),
        });
      if (method === "between")
        return out.push({
          ...base,
          op: "between",
          values: (call?.positional || []).map(value),
        });
      if (method in STR_TESTS)
        return out.push({
          ...base,
          op: STR_TESTS[method],
          value: value(call?.positional[0]),
        });
    }
    return null;
  });
  // A mask variable used on its own, e.g. df[~mask] or mask & other
  tokens.forEach((t, i) => {
    if (!isName(t) || !masks.has(t.raw)) return;
    if (isP(tokens[i + 1], "[") || isP(tokens[i - 1], ".")) return;
    negate = tokens[i - 1]?.raw === "~";
    masks
      .get(t.raw)
      .forEach((c) =>
        out.push({ ...c, ...(negate ? { negated: true } : {}), mask: t.raw }),
      );
  });
  return out;
}

/** a.b.c(...) chains: every .method( in the tokens, with its arguments. */
function methodCalls(tokens) {
  const out = [];
  tokens.forEach((t, i) => {
    if (!isName(t) || !isP(tokens[i + 1], "(")) return;
    const dotted = isP(tokens[i - 1], ".");
    const receiver = dotted ? tokens[i - 2] : null;
    const call = args(tokens, i + 1);
    out.push({
      name: t.raw,
      at: i,
      dotted,
      receiver:
        receiver?.type === "name"
          ? receiver.raw
          : receiver?.type === "string"
            ? "<string>"
            : null,
      ...call,
    });
  });
  return out;
}

function assignment(tokens) {
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "punct" && "([{".includes(t.raw)) depth += 1;
    if (t.type === "punct" && ")]}".includes(t.raw)) depth -= 1;
    if (
      depth === 0 &&
      t.type === "op" &&
      ["=", "+=", "-=", "|=", "&="].includes(t.raw)
    )
      return { at: i, op: t.raw };
    if (depth === 0 && isName(t, "lambda")) return null;
  }
  return null;
}

/** What the left side of an assignment writes. */
function target(lhs) {
  if (lhs.length === 1 && isName(lhs[0])) return { variable: lhs[0].raw };
  if (isName(lhs[0]) && isP(lhs[1], "[")) {
    const close = closing(lhs, 1);
    const v = value(lhs.slice(2, close));
    if (close === lhs.length - 1 && typeof v === "string")
      return { df: lhs[0].raw, column: v };
    if (close === lhs.length - 1 && Array.isArray(v))
      return { df: lhs[0].raw, columns: v };
  }
  if (
    isName(lhs[0]) &&
    isP(lhs[1], ".") &&
    isName(lhs[2], "loc", "at") &&
    isP(lhs[3], "[")
  ) {
    const close = closing(lhs, 3);
    const parts = splitArgs(lhs.slice(4, close));
    const column = parts.length > 1 ? value(parts.at(-1)) : undefined;
    return {
      df: lhs[0].raw,
      column: typeof column === "string" ? column : null,
      rowMask: parts[0],
    };
  }
  if (lhs.some((t) => isP(t, ",")))
    return { variables: lhs.filter((t) => isName(t)).map((t) => t.raw) };
  return { expression: true };
}

function analyzeLine(entry, facts, state) {
  const { tokens, line, endLine } = entry;
  const st = { kind: "other", line, endLine, columns: [], methods: [] };
  const flag = (kind, detail) =>
    facts.flags.push({ kind, line, ...(detail ? { detail } : {}) });
  const t0 = tokens[0];

  if (isName(t0, "import") || isName(t0, "from")) {
    const module = tokens[1]?.raw;
    st.kind = "import";
    const stop = tokens.findIndex((t, k) => k > 0 && isName(t, "import", "as"));
    st.module = tokens
      .slice(1, stop < 0 ? tokens.length : stop)
      .map((t) => t.raw)
      .join("");
    const root = String(module || "");
    if (UNSUPPORTED_LIBRARIES[root]) flag("unsupported_library", root);
    if (PLOTTING.has(root)) flag("plot", root);
    const as = tokens.findIndex((t) => isName(t, "as"));
    if (as > 0) state.aliases.set(tokens[as + 1]?.raw, root);
    else if (isName(t0, "import")) state.aliases.set(root, root);
    if (isName(t0, "from"))
      tokens
        .slice(3)
        .filter((t) => isName(t) && t.raw !== "as")
        .forEach((t) => state.aliases.set(t.raw, root));
    return st;
  }
  if (isName(t0, "def") || isName(t0, "class")) {
    st.kind = isName(t0, "def") ? "def" : "class";
    st.name = tokens[1]?.raw;
    state.blocks.push({ indent: entry.indent, st });
    facts.functions.push({ name: st.name, line, kind: st.kind });
    return st;
  }
  if (
    isName(
      t0,
      "if",
      "elif",
      "else",
      "for",
      "while",
      "try",
      "except",
      "finally",
      "with",
    )
  ) {
    st.kind = "control";
    st.keyword = t0.raw;
    const loop = methodCalls(tokens).find((c) => LOOPS.has(c.name));
    if (loop) flag("loop", loop.name);
    st.columns = columnRefs(tokens).map((r) => r.column);
    return st;
  }
  if (
    isName(
      t0,
      "return",
      "print",
      "pass",
      "raise",
      "assert",
      "del",
      "global",
      "break",
      "continue",
    )
  ) {
    st.kind = isName(t0, "return") ? "return" : "other";
    return st;
  }

  const eq = assignment(tokens);
  const lhs = eq ? tokens.slice(0, eq.at) : [];
  const rhs = eq ? tokens.slice(eq.at + 1) : tokens;
  const written = eq ? target(lhs) : null;
  const calls = methodCalls(rhs);
  const all = methodCalls(tokens);
  st.methods = uniq(all.map((c) => c.name));
  st.columns = uniq([
    ...columnRefs(tokens).map((r) => r.column),
    written?.column,
  ]);
  if (written?.variable) st.target = written.variable;
  if (written?.df) st.target = written.df;
  const alias = (name) => state.aliases.get(name);
  const isPandas = (c) => c.dotted && alias(c.receiver) === "pandas";
  const isNumpy = (c) => c.dotted && alias(c.receiver) === "numpy";

  for (const c of all) {
    if (UNSUPPORTED_LIBRARIES[alias(c.receiver)])
      flag("unsupported_library", alias(c.receiver));
    if (c.name === "plot" || PLOTTING.has(alias(c.receiver)))
      flag("plot", c.name);
    if (AGGREGATING.has(c.name) && c.dotted && !isPandas(c))
      flag(c.name === "groupby" ? "group_by" : c.name, c.name);
    if (c.name === "melt" || c.name === "crosstab" || c.name === "pivot_table")
      if (isPandas(c)) flag(c.name, c.name);
    if (c.name === "apply" || c.name === "map" || c.name === "applymap") {
      if (c.positional[0]?.[0] && isName(c.positional[0][0], "lambda"))
        flag("apply", "lambda");
      else if (
        c.positional[0]?.length === 1 &&
        isName(c.positional[0][0]) &&
        facts.functions.some((f) => f.name === c.positional[0][0].raw)
      )
        flag("helper", c.positional[0][0].raw);
      else if (c.name !== "map") flag("apply", c.name);
    }
    if (LOOPS.has(c.name)) flag("loop", c.name);
    if (c.name === "exec" || c.name === "eval")
      if (!c.dotted || c.receiver !== "pd") flag("dynamic_code", c.name);
  }

  const reader = calls.find(
    (c) => READERS.test(c.name) && (isPandas(c) || !c.dotted),
  );
  const writer = all.find((c) => WRITERS.test(c.name) && c.dotted);
  const merge = calls.find(
    (c) =>
      (c.name === "merge" && c.dotted) ||
      (c.name === "join" &&
        c.dotted &&
        c.receiver !== "<string>" &&
        c.receiver !== "os" &&
        c.receiver !== "path"),
  );
  const concat = calls.find((c) => c.name === "concat" && isPandas(c));
  const dedupe = calls.find((c) => c.name === "drop_duplicates");
  const sort = calls.find((c) => c.name === "sort_values");
  const rename = calls.find((c) => c.name === "rename");
  const where = calls.find((c) => c.name === "where" && isNumpy(c));
  const select = calls.find((c) => c.name === "select" && isNumpy(c));
  const query = calls.find((c) => c.name === "query" && c.dotted);
  const assign = calls.find((c) => c.name === "assign" && c.dotted);
  const dropna = calls.find((c) => c.name === "dropna" && c.dotted);
  const drop = calls.find((c) => c.name === "drop" && c.dotted);

  if (writer) {
    st.kind = "output";
    st.format = writer.name.slice(3);
    st.df = writer.receiver;
  } else if (reader) {
    st.kind = "read";
    st.format = reader.name.replace(/^read_/, "");
    st.path =
      value(reader.positional[0]) ??
      (reader.positional[0] ? "<expression>" : null);
    if (reader.kw.sheet_name) st.sheet = value(reader.kw.sheet_name);
    if (reader.kw.usecols)
      st.columns = uniq([...st.columns, ...list(value(reader.kw.usecols))]);
    if (st.format.startsWith("sql"))
      st.query = value(reader.positional[0]) ?? null;
    if (st.target) facts.datasets.push({ name: st.target, kind: "read", line });
  } else if (merge) {
    st.kind = "merge";
    const right = isPandas(merge) ? merge.positional[1] : merge.positional[0];
    const left = isPandas(merge) ? merge.positional[0] : null;
    const name = (arg) => {
      if (!arg) return null;
      if (arg.length === 1 && isName(arg[0])) return arg[0].raw;
      const sub = columnRefs(arg)[0];
      if (sub && sub.at === 0 && sub.end === arg.length) return sub.column; // sources["key"]
      return "<expression>";
    };
    st.merge = {
      method: merge.name,
      left: left ? name(left) : merge.receiver,
      right: name(right),
      how: value(merge.kw.how) ?? (merge.name === "join" ? "left" : "inner"),
      on: list(value(merge.kw.on)),
      leftOn: list(value(merge.kw.left_on)),
      rightOn: list(value(merge.kw.right_on)),
      ...(merge.kw.suffixes ? { suffixes: value(merge.kw.suffixes) } : {}),
      ...(merge.kw.indicator ? { indicator: value(merge.kw.indicator) } : {}),
    };
    st.columns = uniq([
      ...st.columns,
      ...st.merge.on,
      ...st.merge.leftOn,
      ...st.merge.rightOn,
    ]);
  } else if (concat) {
    st.kind = "concat";
    st.inputs = (concat.positional[0] || [])
      .filter((t) => isName(t))
      .map((t) => t.raw);
    st.axis = value(concat.kw.axis) ?? 0;
  } else if (dedupe) {
    st.kind = "dedupe";
    st.subset = list(value(dedupe.kw.subset ?? dedupe.positional[0]));
    st.keep = value(dedupe.kw.keep) ?? "first";
    st.columns = uniq([...st.columns, ...st.subset]);
    const sorted = calls.find((c) => c.name === "sort_values");
    if (sorted) st.orderBy = list(value(sorted.kw.by ?? sorted.positional[0]));
  } else if (sort) {
    st.kind = "sort";
    st.by = list(value(sort.kw.by ?? sort.positional[0]));
    st.ascending = value(sort.kw.ascending) ?? true;
    st.columns = uniq([...st.columns, ...st.by]);
  } else if (rename) {
    st.kind = "rename";
    st.renames = value(rename.kw.columns) ?? {};
    st.columns = uniq([
      ...st.columns,
      ...Object.keys(st.renames),
      ...Object.values(st.renames),
    ]);
  } else if (written?.column && (where || select || written.rowMask)) {
    st.kind = "conditional_column";
    st.column = written.column;
    const cond = written.rowMask || (where || select).positional[0] || [];
    st.conditions = conditions(cond, state.masks);
    if (where) {
      st.then = value(where.positional[1]) ?? "<expression>";
      st.else = value(where.positional[2]) ?? "<expression>";
    } else if (written.rowMask) st.then = value(rhs) ?? "<expression>";
    else st.choices = true;
  } else if (written?.column || written?.columns) {
    st.kind = "assign_column";
    st.column = written.column ?? null;
    if (written.columns) st.columnsWritten = written.columns;
    st.value = value(rhs);
    const ref = columnRefs(rhs);
    if (ref.length === 1 && ref[0].at === 0 && ref[0].end === rhs.length)
      st.copyOf = ref[0].column;
    st.format = uniq(
      all.filter((c) => FORMATTING.has(c.name)).map((c) => c.name),
    );
    if (eq.op !== "=") st.augmented = eq.op;
  } else if (written?.df && written.rowMask) {
    st.kind = "filter";
    st.conditions = conditions(written.rowMask, state.masks);
  } else if (query) {
    st.kind = "filter";
    st.query = value(query.positional[0]) ?? "<expression>";
  } else if (assign) {
    st.kind = "assign_column";
    st.columnsWritten = Object.keys(assign.kw);
  } else if (dropna) {
    st.kind = "filter";
    st.dropna = list(value(dropna.kw.subset));
  } else if (drop) {
    st.kind = "drop_columns";
    st.columnsDropped = list(value(drop.kw.columns ?? drop.positional[0]));
  } else if (written?.variable) {
    const sub = rhs.findIndex((t) => isP(t, "["));
    const isFilter =
      sub > 0 &&
      isName(rhs[sub - 1]) &&
      (() => {
        const close = closing(rhs, sub);
        const inner = rhs.slice(sub + 1, close);
        if (value(inner) !== undefined) return false;
        return conditions(inner, state.masks).length > 0;
      })();
    const locFilter = rhs.findIndex(
      (t, i) =>
        isName(t, "loc") && isP(rhs[i + 1], "[") && isP(rhs[i - 1], "."),
    );
    const cond = conditions(rhs, state.masks);
    if (isFilter || (locFilter > 0 && cond.length)) {
      st.kind = "filter";
      st.source = rhs[0]?.raw;
      st.conditions = cond;
    } else if (cond.length && calls.every((c) => MASK_METHODS.has(c.name))) {
      st.kind = "mask";
      st.conditions = cond;
      state.masks.set(written.variable, cond);
    } else {
      const sub0 = columnRefs(rhs)[0];
      const copy = calls.find((c) => c.name === "copy");
      if (
        sub0 &&
        sub0.at === 0 &&
        (sub0.end === rhs.length || (copy && sub0.end === copy.at - 1))
      ) {
        st.kind = "reference";
        st.source = sub0.column;
        facts.datasets.push({
          name: written.variable,
          kind: "reference",
          line,
          source: sub0.column,
        });
      } else if (rhs.length === 1 && isName(rhs[0])) {
        st.kind = "alias";
        st.source = rhs[0].raw;
      } else if (
        rhs.length >= 3 &&
        isName(rhs[0]) &&
        isP(rhs[1], ".") &&
        isName(rhs[2], "copy")
      ) {
        st.kind = "alias";
        st.source = rhs[0].raw;
      } else if (isLiteral(rhs[0]) && rhs.length === 1) {
        st.kind = "constant";
        st.value = literal(rhs[0]);
        facts.params.push({
          name: written.variable,
          line,
          value: literal(rhs[0]),
        });
      } else
        st.kind = calls.some((c) => AGGREGATING.has(c.name))
          ? "aggregate"
          : "assign";
    }
  } else if (!eq && calls.length) st.kind = "call";
  if (st.conditions)
    st.columns = uniq([...st.columns, ...st.conditions.map((c) => c.column)]);
  return st;
}

export function pythonFacts(text, { startId = 1, cell = 1 } = {}) {
  const facts = {
    language: "python",
    statements: [],
    datasets: [],
    identifiers: {},
    params: [],
    flags: [],
    functions: [],
  };
  return mergeInto(facts, text, { startId, cell });
}

/** Adds one cell's facts. Masks and import aliases carry across cells. */
export function mergeInto(facts, text, { cell = 1, state } = {}) {
  const shared =
    state ||
    facts._state ||
    (facts._state = { aliases: new Map(), masks: new Map(), blocks: [] });
  for (const entry of pythonLines(text)) {
    while (shared.blocks.length && entry.indent <= shared.blocks.at(-1).indent)
      shared.blocks.pop();
    const st = analyzeLine(entry, facts, shared);
    const inside = shared.blocks.filter((b) => b.st !== st).at(-1);
    if (inside) st.inFunction = inside.st.name;
    st.cell = cell;
    facts.statements.push({ id: `s${facts.statements.length + 1}`, ...st });
  }
  for (const item of [...facts.flags, ...facts.datasets, ...facts.params])
    item.cell ??= cell;
  const sources = facts.statements
    .filter((s) => s.kind === "reference")
    .map((s) => s.source);
  const reads = facts.statements
    .filter((s) => s.kind === "read")
    .map((s) => s.path);
  const merges = facts.statements
    .filter((s) => s.kind === "merge")
    .map((s) => s.merge.right)
    .filter(
      (r) =>
        r && r !== "<expression>" && !facts.datasets.some((d) => d.name === r),
    );
  facts.identifiers = {
    tables: uniq([
      ...sources,
      ...reads.filter((r) => typeof r === "string"),
      ...merges,
    ]),
    columns: uniq(facts.statements.flatMap((s) => s.columns || [])),
  };
  const seen = new Set();
  facts.flags = facts.flags.filter((f) => {
    const key = `${f.kind}:${f.cell}:${f.line}:${f.detail || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  Object.defineProperty(facts, "_state", {
    value: shared,
    enumerable: false,
    configurable: true,
  });
  return facts;
}
