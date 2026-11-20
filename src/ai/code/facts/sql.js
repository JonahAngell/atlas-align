/**
 * T-SQL facts: a deterministic inventory of what a SQL Server script does.
 * Not a full parser. It finds statements, data sets, tables, columns,
 * conditions and joins well enough to ground and check a translation.
 *
 * Shape (shared with the pandas facts):
 *   { language, statements, datasets, identifiers: { tables, columns },
 *     params, flags }
 */
import { isPunct, isWord, sqlTokens } from "./sql-tokens.js";

const CLAUSES = new Set([
  "SELECT",
  "INTO",
  "FROM",
  "WHERE",
  "GROUP",
  "HAVING",
  "ORDER",
  "UNION",
  "EXCEPT",
  "INTERSECT",
  "OPTION",
  "FOR",
]);
const JOIN_WORDS = new Set([
  "JOIN",
  "INNER",
  "LEFT",
  "RIGHT",
  "FULL",
  "CROSS",
  "OUTER",
]);
/** LEFT and RIGHT are also string functions: LEFT( is never a join. */
const isJoinWord = (tokens, i) =>
  tokens[i]?.type === "word" &&
  JOIN_WORDS.has(tokens[i].upper) &&
  !isPunct(tokens[i + 1], "(");
const SET_OPS = new Set(["UNION", "EXCEPT", "INTERSECT"]);
const KEYWORDS = new Set([
  ...CLAUSES,
  ...JOIN_WORDS,
  "ALL",
  "AND",
  "ANY",
  "AS",
  "ASC",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASE",
  "CAST",
  "CONVERT",
  "CREATE",
  "CURSOR",
  "DECLARE",
  "DEFAULT",
  "DELETE",
  "DESC",
  "DISTINCT",
  "DROP",
  "ELSE",
  "END",
  "ESCAPE",
  "EXEC",
  "EXECUTE",
  "EXISTS",
  "FETCH",
  "GO",
  "IF",
  "IN",
  "INSERT",
  "IS",
  "LIKE",
  "MATCHED",
  "MERGE",
  "NEXT",
  "NOCOUNT",
  "NOT",
  "NULL",
  "OFF",
  "ON",
  "OR",
  "OVER",
  "PARTITION",
  "PERCENT",
  "PIVOT",
  "PRINT",
  "RETURN",
  "ROWS",
  "SET",
  "SOME",
  "TABLE",
  "THEN",
  "TOP",
  "TRUNCATE",
  "UNPIVOT",
  "UPDATE",
  "USE",
  "USING",
  "VALUES",
  "WHEN",
  "WHILE",
  "WITH",
  "TARGET",
  "SOURCE",
  "TIES",
  "APPLY",
  "TRAN",
  "TRANSACTION",
  "COMMIT",
  "ROLLBACK",
  "TRY",
  "CATCH",
  "OPEN",
  "CLOSE",
  "DEALLOCATE",
  "INT",
  "BIGINT",
  "NVARCHAR",
  "VARCHAR",
  "CHAR",
  "NCHAR",
  "DATE",
  "DATETIME",
  "DATETIME2",
  "BIT",
  "DECIMAL",
  "NUMERIC",
  "FLOAT",
  "MAX",
  "PRIMARY",
  "KEY",
  "IDENTITY",
  "TRUE",
  "FALSE",
]);
// Functions ATLAS maps to blank tests and format_field (§11.1).
const MAPPED_FUNCTIONS = new Set([
  "ISNULL",
  "COALESCE",
  "CONVERT",
  "CAST",
  "LEFT",
  "RIGHT",
  "REPLICATE",
  "LTRIM",
  "RTRIM",
  "TRIM",
  "NULLIF",
  "UPPER",
  "LOWER",
  "LEN",
  "SUBSTRING",
  "CONCAT",
  "CONCAT_WS",
  "REPLACE",
  "CHARINDEX",
  "REVERSE",
  "ROUND",
  "GETDATE",
  "DATEADD",
  "DATEDIFF",
  "FORMAT",
  "TRY_CAST",
  "TRY_CONVERT",
]);
const AGGREGATES = new Set(["SUM", "COUNT", "AVG", "MIN", "MAX", "STRING_AGG"]);
const COMPARE = new Set(["=", "<>", "!=", "<", ">", "<=", ">="]);
const STARTERS = new Set([
  "WITH",
  "SELECT",
  "UPDATE",
  "INSERT",
  "DELETE",
  "MERGE",
  "DECLARE",
  "SET",
  "USE",
  "EXEC",
  "EXECUTE",
  "IF",
  "ELSE",
  "WHILE",
  "BEGIN",
  "END",
  "CREATE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "PRINT",
  "OPEN",
  "FETCH",
  "CLOSE",
  "DEALLOCATE",
  "RETURN",
  "COMMIT",
  "ROLLBACK",
]);

const isName = (t) =>
  t &&
  (t.type === "ident" ||
    t.type === "temp" ||
    (t.type === "word" && !KEYWORDS.has(t.upper)));
const isLiteral = (t) =>
  t && ["string", "number", "mask", "var"].includes(t.type);
const literal = (t) => (t.type === "string" ? t.value : t.raw);
const uniq = (items) => [...new Set(items.filter(Boolean))];

/** Depth of every token, with each '(' at the depth outside it. */
function depths(tokens) {
  let depth = 0;
  return tokens.map((t) => {
    if (isPunct(t, ")")) depth = Math.max(0, depth - 1);
    const d = depth;
    if (isPunct(t, "(")) depth += 1;
    return d;
  });
}

function closeParen(tokens, open) {
  let depth = 0;
  for (let i = open; i < tokens.length; i += 1) {
    if (isPunct(tokens[i], "(")) depth += 1;
    else if (isPunct(tokens[i], ")") && --depth === 0) return i;
  }
  return tokens.length - 1;
}

/** a.b.c, [x].[y], #t, t.* starting at i. */
function chainAt(tokens, i) {
  if (
    !isName(tokens[i]) &&
    !(tokens[i]?.type === "word" && isPunct(tokens[i + 1], "."))
  )
    return null;
  const parts = [tokens[i].value];
  let j = i + 1;
  let star = false;
  while (isPunct(tokens[j], ".")) {
    const next = tokens[j + 1];
    if (next?.type === "op" && next.raw === "*") {
      star = true;
      j += 2;
      break;
    }
    if (isPunct(next, ".")) {
      parts.push("");
      j += 1;
      continue;
    }
    if (next && (next.type === "ident" || next.type === "word")) {
      parts.push(next.value);
      j += 2;
    } else break;
  }
  return { parts, star, end: j };
}

/** dbo.Table, [db].[dbo].[Table] and Table all name the same table. */
export function tableName(parts) {
  return parts.filter((part) => part !== "").at(-1) || "";
}

function columnOf(chain) {
  const parts = chain.parts.filter((part) => part !== "");
  return {
    name: parts.at(-1),
    qualifier: parts.length > 1 ? parts.at(-2) : null,
  };
}

/** Every column reference in a token range, skipping functions and keywords. */
function columnsIn(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (isPunct(tokens[i - 1], ".")) continue;
    if (t.type === "word" && isPunct(tokens[i + 1], "(")) continue;
    const chain = chainAt(tokens, i);
    if (!chain || chain.star) {
      if (chain) i = chain.end - 1;
      continue;
    }
    if (t.type === "temp") {
      i = chain.end - 1;
      continue;
    }
    out.push(columnOf(chain));
    i = chain.end - 1;
  }
  return out;
}

function functionsIn(tokens) {
  return uniq(
    tokens
      .filter((t, i) => t.type === "word" && isPunct(tokens[i + 1], "("))
      .map((t) => t.upper),
  );
}

/** [{ column, qualifier, op, value?, values?, compareColumn?, via? }] */
function conditions(tokens) {
  const out = [];
  const after = (j) => {
    let not = false;
    if (isWord(tokens[j], "NOT")) {
      not = true;
      j += 1;
    }
    const t = tokens[j];
    if (t?.type === "op" && COMPARE.has(t.raw)) {
      const next = tokens[j + 1];
      if (isLiteral(next)) return { op: t.raw, value: literal(next) };
      const chain = next && chainAt(tokens, j + 1);
      if (chain) return { op: t.raw, compareColumn: columnOf(chain).name };
      return { op: t.raw };
    }
    if (isWord(t, "IS")) {
      const negated = isWord(tokens[j + 1], "NOT");
      return { op: negated ? "is not null" : "is null" };
    }
    if (isWord(t, "LIKE")) {
      const next = tokens[j + 1];
      return {
        op: not ? "not like" : "like",
        ...(isLiteral(next) ? { value: literal(next) } : {}),
      };
    }
    if (isWord(t, "IN") && isPunct(tokens[j + 1], "(")) {
      const close = closeParen(tokens, j + 1);
      const values = tokens
        .slice(j + 2, close)
        .filter(isLiteral)
        .map(literal);
      const subquery = isWord(tokens[j + 2], "SELECT");
      return {
        op: not ? "not in" : "in",
        ...(subquery ? { subquery: true } : { values }),
      };
    }
    if (isWord(t, "BETWEEN")) {
      const a = tokens[j + 1];
      const b = tokens[j + 3];
      return { op: "between", values: [a, b].filter(isLiteral).map(literal) };
    }
    return null;
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (
      t.type === "word" &&
      isPunct(tokens[i + 1], "(") &&
      !KEYWORDS.has(t.upper)
    ) {
      const close = closeParen(tokens, i + 1);
      const inner = columnsIn(tokens.slice(i + 2, close));
      const tail = after(close + 1);
      inner.forEach((c) =>
        out.push({
          column: c.name,
          qualifier: c.qualifier,
          op: tail?.op ?? null,
          via: t.upper,
          ...(tail?.value !== undefined ? { value: tail.value } : {}),
        }),
      );
      i = close;
      continue;
    }
    if (isPunct(tokens[i - 1], ".")) continue;
    const chain = chainAt(tokens, i);
    if (!chain || chain.star || t.type === "temp") {
      if (chain) i = chain.end - 1;
      continue;
    }
    const tail = after(chain.end);
    const c = columnOf(chain);
    out.push({
      column: c.name,
      qualifier: c.qualifier,
      op: tail?.op ?? null,
      ...(tail || {}),
    });
    i = chain.end - 1;
  }
  return out;
}

/** Splits a range at depth-0 tokens matching test. */
function splitAt(tokens, test) {
  const d = depths(tokens);
  const parts = [[]];
  tokens.forEach((t, i) => {
    if (d[i] === 0 && test(t)) parts.push([]);
    else parts.at(-1).push(t);
  });
  return parts.filter((part) => part.length);
}

function selectItem(tokens) {
  const t0 = tokens[0];
  const last = tokens.at(-1);
  const item = { name: null, star: false, expression: false, case: false };
  item.case = tokens.some((t) => isWord(t, "CASE"));
  item.columns = columnsIn(tokens).map((c) => c.name);
  item.functions = functionsIn(tokens);
  if (tokens.length === 1 && t0.type === "op" && t0.raw === "*")
    return { ...item, star: true };
  const chain = chainAt(tokens, 0);
  if (chain && chain.end === tokens.length) {
    if (chain.star)
      return { ...item, star: true, qualifier: chain.parts.at(-1) };
    return {
      ...item,
      name: columnOf(chain).name,
      source: columnOf(chain).name,
    };
  }
  // T-SQL alias = expression
  if (isName(t0) && tokens[1]?.type === "op" && tokens[1].raw === "=")
    return { ...item, name: t0.value, expression: true };
  if (tokens.length > 1 && isWord(tokens.at(-2), "AS"))
    return { ...item, name: last.value, expression: true };
  const before = tokens.at(-2);
  if (
    tokens.length > 1 &&
    (last.type === "ident" ||
      (last.type === "word" && !KEYWORDS.has(last.upper))) &&
    !isPunct(before, ".") &&
    before?.type !== "op"
  )
    return { ...item, name: last.value, expression: true };
  return { ...item, expression: true };
}

function windowsIn(tokens) {
  const out = [];
  tokens.forEach((t, i) => {
    if (!isWord(t, "OVER") || !isPunct(tokens[i + 1], "(")) return;
    const close = closeParen(tokens, i + 1);
    const body = tokens.slice(i + 2, close);
    const fnClose = i - 1;
    let fnOpen = fnClose;
    let depth = 0;
    for (let k = fnClose; k >= 0; k -= 1) {
      if (isPunct(tokens[k], ")")) depth += 1;
      if (isPunct(tokens[k], "(") && --depth === 0) {
        fnOpen = k;
        break;
      }
    }
    const fn = tokens[fnOpen - 1]?.upper || null;
    const orderAt = body.findIndex((b) => isWord(b, "ORDER"));
    const partitionAt = body.findIndex((b) => isWord(b, "PARTITION"));
    const partitionBy =
      partitionAt < 0
        ? []
        : columnsIn(
            body.slice(partitionAt + 2, orderAt < 0 ? body.length : orderAt),
          ).map((c) => c.name);
    const orderBy =
      orderAt < 0 ? [] : columnsIn(body.slice(orderAt + 2)).map((c) => c.name);
    let alias = null;
    const a = tokens[close + 1];
    if (isWord(a, "AS")) alias = tokens[close + 2]?.value ?? null;
    else if (a && (a.type === "ident" || isName(a))) alias = a.value;
    out.push({ function: fn, partitionBy, orderBy, alias });
  });
  return out;
}

function tableSources(tokens, unit) {
  const d = depths(tokens);
  let i = 0;
  let joinType = null;
  const readSource = () => {
    let source = null;
    if (isPunct(tokens[i], "(")) {
      const close = closeParen(tokens, i);
      const inner = analyzeQuery(tokens.slice(i + 1, close));
      unit.reads.push(...inner.reads);
      unit.flags.push(...inner.flags);
      source = { table: null, subquery: true };
      i = close + 1;
    } else {
      const chain = chainAt(tokens, i);
      if (!chain) {
        i += 1;
        return null;
      }
      source = { table: tableName(chain.parts) };
      unit.reads.push(source.table);
      i = chain.end;
    }
    if (isWord(tokens[i], "WITH") && isPunct(tokens[i + 1], "("))
      i = closeParen(tokens, i + 1) + 1;
    if (isWord(tokens[i], "AS")) i += 1;
    if (tokens[i] && (tokens[i].type === "ident" || isName(tokens[i]))) {
      source.alias = tokens[i].value;
      i += 1;
    }
    if (isWord(tokens[i], "WITH") && isPunct(tokens[i + 1], "("))
      i = closeParen(tokens, i + 1) + 1;
    return source;
  };
  const first = readSource();
  if (first) unit.from.push(first);
  while (i < tokens.length) {
    const t = tokens[i];
    if (d[i] !== 0) {
      i += 1;
      continue;
    }
    if (isPunct(t, ",")) {
      i += 1;
      const s = readSource();
      if (s) unit.from.push(s);
      continue;
    }
    if (isWord(t, "PIVOT", "UNPIVOT")) {
      unit.flags.push({ kind: "pivot", line: t.line });
      i = isPunct(tokens[i + 1], "(") ? closeParen(tokens, i + 1) + 1 : i + 1;
      continue;
    }
    if (isJoinWord(tokens, i)) {
      const words = [];
      while (isJoinWord(tokens, i) || isWord(tokens[i], "APPLY")) {
        words.push(tokens[i].upper);
        i += 1;
      }
      if (words.includes("APPLY")) {
        unit.flags.push({
          kind: "apply",
          line: t.line,
          detail: words.join(" "),
        });
        joinType = words.includes("CROSS") ? "cross apply" : "outer apply";
      } else if (words.includes("CROSS")) joinType = "cross";
      else
        joinType = (
          ["LEFT", "RIGHT", "FULL"].find((w) => words.includes(w)) || "inner"
        ).toLowerCase();
      const source = readSource();
      if (!source) continue;
      const join = { type: joinType, ...source, on: [], line: t.line };
      if (isWord(tokens[i], "ON")) {
        i += 1;
        const start = i;
        while (
          i < tokens.length &&
          !(
            d[i] === 0 &&
            (isJoinWord(tokens, i) || isWord(tokens[i], "PIVOT", "UNPIVOT"))
          ) &&
          !(d[i] === 0 && isPunct(tokens[i], ","))
        )
          i += 1;
        const on = tokens.slice(start, i);
        splitAt(on, (x) => isWord(x, "AND")).forEach((part) => {
          const opAt = part.findIndex(
            (x) => x.type === "op" && COMPARE.has(x.raw),
          );
          if (opAt < 0) return join.on.push({ expression: true });
          const left = columnsIn(part.slice(0, opAt))[0];
          const right = columnsIn(part.slice(opAt + 1))[0];
          const value = part.slice(opAt + 1).find(isLiteral);
          join.on.push({
            left: left
              ? `${left.qualifier ? `${left.qualifier}.` : ""}${left.name}`
              : null,
            op: part[opAt].raw,
            right: right
              ? `${right.qualifier ? `${right.qualifier}.` : ""}${right.name}`
              : value
                ? literal(value)
                : null,
          });
        });
        unit.columns.push(...columnsIn(on).map((c) => c.name));
      }
      unit.joins.push(join);
      continue;
    }
    i += 1;
  }
}

function emptyUnit(kind, tokens) {
  return {
    kind,
    line: tokens[0]?.line ?? 0,
    endLine: tokens.at(-1)?.line ?? 0,
    reads: [],
    from: [],
    joins: [],
    where: [],
    having: [],
    outputs: [],
    caseTargets: [],
    groupBy: [],
    orderBy: [],
    windows: [],
    setOps: [],
    functions: [],
    columns: [],
    flags: [],
    distinct: false,
  };
}

/** SELECT … [UNION SELECT …]. Returns a unit with clause facts. */
function analyzeQuery(tokens, kind = "select") {
  const unit = emptyUnit(kind, tokens);
  const d = depths(tokens);
  const branches = [[]];
  tokens.forEach((t, i) => {
    if (d[i] === 0 && t.type === "word" && SET_OPS.has(t.upper)) {
      const all = isWord(tokens[i + 1], "ALL");
      unit.setOps.push(`${t.upper.toLowerCase()}${all ? " all" : ""}`);
      branches.push([]);
    } else if (!(
      d[i] === 0 &&
      isWord(t, "ALL") &&
      SET_OPS.has(tokens[i - 1]?.upper)
    ))
      branches.at(-1).push(t);
  });
  branches.forEach((branch, b) => {
    const bd = depths(branch);
    const marks = [];
    branch.forEach((t, i) => {
      if (
        bd[i] === 0 &&
        t.type === "word" &&
        CLAUSES.has(t.upper) &&
        !(t.upper === "FOR" && !isWord(branch[i + 1], "XML", "JSON"))
      )
        marks.push({ word: t.upper, at: i });
    });
    marks.forEach((mark, m) => {
      const end = marks[m + 1]?.at ?? branch.length;
      let body = branch.slice(mark.at + 1, end);
      if (mark.word === "GROUP" || mark.word === "ORDER") body = body.slice(1); // BY
      if (mark.word === "SELECT") {
        if (isWord(body[0], "DISTINCT")) {
          unit.distinct = true;
          body = body.slice(1);
        } else if (isWord(body[0], "ALL")) body = body.slice(1);
        if (isWord(body[0], "TOP")) {
          unit.flags.push({ kind: "top", line: body[0].line });
          body = body.slice(
            isPunct(body[1], "(") ? closeParen(body, 1) + 1 : 2,
          );
          if (isWord(body[0], "PERCENT")) body = body.slice(1);
          if (isWord(body[0], "WITH") && isWord(body[1], "TIES"))
            body = body.slice(2);
        }
        const items = splitAt(body, (t) => isPunct(t, ",")).map(selectItem);
        if (b === 0) unit.outputs = items;
        items.forEach((item) => {
          if (item.case && item.name) unit.caseTargets.push(item.name);
          unit.functions.push(...item.functions);
          unit.columns.push(...item.columns);
        });
        unit.windows.push(...windowsIn(body));
        if (
          items.some((item) => item.functions.some((f) => AGGREGATES.has(f))) &&
          !unit.windows.length
        )
          unit.aggregate = true;
      } else if (mark.word === "INTO") {
        const chain = chainAt(body, 0);
        if (chain) unit.into = tableName(chain.parts);
      } else if (mark.word === "FROM") tableSources(body, unit);
      else if (mark.word === "WHERE" || mark.word === "HAVING") {
        const found = conditions(body);
        unit[mark.word === "WHERE" ? "where" : "having"].push(...found);
        unit.columns.push(...found.map((c) => c.column));
        unit.functions.push(...functionsIn(body));
        body.forEach((t, i) => {
          if (isWord(t, "SELECT") && isPunct(body[i - 1], "(")) {
            const close = closeParen(body, i - 1);
            const inner = analyzeQuery(body.slice(i, close));
            unit.reads.push(...inner.reads);
          }
        });
      } else if (mark.word === "GROUP")
        unit.groupBy.push(...columnsIn(body).map((c) => c.name));
      else if (mark.word === "ORDER")
        splitAt(body, (t) => isPunct(t, ",")).forEach((part) => {
          const c = columnsIn(part)[0];
          if (c)
            unit.orderBy.push({
              column: c.name,
              descending: part.some((t) => isWord(t, "DESC")),
            });
        });
    });
  });
  if (unit.groupBy.length || unit.having.length)
    unit.flags.push({ kind: "group_by", line: unit.line });
  unit.reads = uniq(unit.reads);
  unit.functions = uniq(unit.functions);
  unit.columns = uniq(unit.columns);
  return unit;
}

function analyzeUpdate(tokens) {
  const unit = emptyUnit("update", tokens);
  let i = 1;
  if (isWord(tokens[i], "TOP")) {
    unit.flags.push({ kind: "top", line: tokens[i].line });
    i = closeParen(tokens, i + 1) + 1;
  }
  const chain = chainAt(tokens, i);
  if (chain) unit.target = tableName(chain.parts);
  const d = depths(tokens);
  const at = (word) =>
    tokens.findIndex((t, k) => k > i && d[k] === 0 && isWord(t, word));
  const set = at("SET");
  const from = at("FROM");
  const where = at("WHERE");
  const setEnd =
    [from, where].filter((k) => k > 0).sort((a, b) => a - b)[0] ??
    tokens.length;
  splitAt(tokens.slice(set + 1, setEnd), (t) => isPunct(t, ",")).forEach(
    (part) => {
      const target = chainAt(part, 0);
      const expression = part.slice((target?.end ?? 0) + 1);
      unit.outputs.push({
        name: target ? columnOf(target).name : null,
        expression: true,
        case: expression.some((t) => isWord(t, "CASE")),
        columns: columnsIn(expression).map((c) => c.name),
        functions: functionsIn(expression),
      });
      unit.functions.push(...functionsIn(expression));
    },
  );
  unit.caseTargets = unit.outputs.filter((o) => o.case).map((o) => o.name);
  if (from > 0)
    tableSources(
      tokens.slice(from + 1, where > 0 ? where : tokens.length),
      unit,
    );
  if (where > 0) unit.where = conditions(tokens.slice(where + 1));
  unit.columns = uniq([
    ...unit.outputs.flatMap((o) => [o.name, ...o.columns]),
    ...unit.where.map((c) => c.column),
  ]);
  unit.reads = uniq([...unit.reads, unit.target]);
  unit.functions = uniq(unit.functions);
  return unit;
}

function analyzeDelete(tokens) {
  const unit = emptyUnit("delete", tokens);
  let i = 1;
  if (isWord(tokens[i], "FROM")) i += 1;
  const chain = chainAt(tokens, i);
  if (chain) unit.target = tableName(chain.parts);
  const where = tokens.findIndex((t) => isWord(t, "WHERE"));
  if (where > 0) unit.where = conditions(tokens.slice(where + 1));
  unit.reads = uniq([unit.target]);
  unit.columns = uniq(unit.where.map((c) => c.column));
  return unit;
}

function analyzeInsert(tokens) {
  let i = 1;
  if (isWord(tokens[i], "INTO")) i += 1;
  const chain = chainAt(tokens, i);
  const select = tokens.findIndex((t) => isWord(t, "SELECT"));
  const unit =
    select > 0
      ? analyzeQuery(tokens.slice(select), "insert")
      : emptyUnit("insert", tokens);
  unit.line = tokens[0].line;
  if (chain) unit.target = tableName(chain.parts);
  if (tokens.some((t) => isWord(t, "VALUES"))) unit.values = true;
  if (tokens.some((t) => isWord(t, "EXEC", "EXECUTE")))
    unit.flags.push({ kind: "exec", line: tokens[0].line });
  return unit;
}

/** Splits a script into statements, with GO lines and USE kept as markers. */
function statements(tokens) {
  const out = [];
  let current = [];
  let caseDepth = 0;
  let depth = 0;
  let mainSelect = false;
  const flush = () => {
    if (current.length) out.push(current);
    current = [];
    mainSelect = false;
    caseDepth = 0;
  };
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    if (isWord(t, "GO") && t.first && (tokens[i + 1]?.first ?? true)) {
      flush();
      out.push([t]);
      return flush();
    }
    if (depth === 0 && isPunct(t, ";")) return flush();
    if (
      depth === 0 &&
      t.type === "word" &&
      STARTERS.has(t.upper) &&
      current.length
    ) {
      const lead = current[0].upper;
      const inMerge = lead === "MERGE";
      const continues =
        inMerge ||
        caseDepth > 0 ||
        (t.upper === "SET" && ["UPDATE", "MERGE"].includes(lead)) ||
        (t.upper === "WITH" && isPunct(tokens[i + 1], "(")) ||
        (t.upper === "SELECT" &&
          (SET_OPS.has(prev?.upper) ||
            isWord(prev, "ALL", "FOR", "AS") ||
            (["WITH", "INSERT"].includes(lead) && !mainSelect))) ||
        (["INSERT", "UPDATE", "DELETE"].includes(t.upper) &&
          lead === "WITH" &&
          !mainSelect) ||
        (t.upper === "EXEC" && lead === "INSERT");
      if (!continues) flush();
      else if (
        t.upper === "SELECT" ||
        ["INSERT", "UPDATE", "DELETE"].includes(t.upper)
      )
        mainSelect = true;
    }
    if (isWord(t, "CASE")) caseDepth += 1;
    if (isWord(t, "END") && caseDepth > 0) caseDepth -= 1;
    if (isPunct(t, "(")) depth += 1;
    if (isPunct(t, ")")) depth = Math.max(0, depth - 1);
    current.push(t);
  });
  flush();
  return out;
}

function analyzeStatement(tokens, facts) {
  const lead = tokens[0];
  const line = lead.line;
  const endLine = tokens.at(-1).line;
  const flag = (kind, detail) =>
    facts.flags.push({ kind, line, ...(detail ? { detail } : {}) });
  const word = lead.upper;
  if (word === "GO") return [{ kind: "batch", line, endLine }];
  if (word === "USE")
    return [{ kind: "use", line, endLine, database: tokens[1]?.value }];
  if (word === "WITH") {
    const units = [];
    let i = 1;
    while (i < tokens.length) {
      const name = tokens[i];
      let j = i + 1;
      if (isPunct(tokens[j], "(")) j = closeParen(tokens, j) + 1;
      if (!isWord(tokens[j], "AS") || !isPunct(tokens[j + 1], "(")) break;
      const close = closeParen(tokens, j + 1);
      const unit = analyzeQuery(tokens.slice(j + 2, close), "cte");
      unit.name = name.value;
      unit.line = name.line;
      unit.endLine = tokens[close].line;
      units.push(unit);
      facts.datasets.push({ name: name.value, kind: "cte", line: name.line });
      i = close + 1;
      if (isPunct(tokens[i], ",")) i += 1;
      else break;
    }
    const rest = tokens.slice(i);
    if (rest.length) units.push(...analyzeStatement(rest, facts));
    return units;
  }
  if (word === "SELECT") {
    const unit = analyzeQuery(tokens);
    if (unit.into) {
      unit.kind = "select_into";
      unit.target = unit.into;
      facts.datasets.push({
        name: unit.into,
        kind: unit.into.startsWith("#") ? "temp" : "table",
        line,
      });
    }
    return [unit];
  }
  if (word === "UPDATE") return [analyzeUpdate(tokens)];
  if (word === "DELETE") return [analyzeDelete(tokens)];
  if (word === "INSERT") return [analyzeInsert(tokens)];
  if (word === "DECLARE") {
    if (tokens.some((t) => isWord(t, "CURSOR"))) {
      flag("cursor");
      return [{ kind: "cursor", line, endLine }];
    }
    if (tokens[1]?.type === "var" && isWord(tokens[2], "TABLE")) {
      facts.datasets.push({
        name: tokens[1].raw,
        kind: "table_variable",
        line,
      });
      return [{ kind: "declare_table", line, endLine, target: tokens[1].raw }];
    }
    splitAt(tokens.slice(1), (t) => isPunct(t, ",")).forEach((part) => {
      if (part[0]?.type !== "var") return;
      const eq = part.findIndex((t) => t.type === "op" && t.raw === "=");
      const value =
        eq > 0 && part.length === eq + 2 && isLiteral(part[eq + 1])
          ? literal(part[eq + 1])
          : undefined;
      facts.params.push({
        name: part[0].raw,
        type: part[1]?.upper ?? null,
        line,
        ...(value !== undefined ? { value } : {}),
      });
    });
    return [{ kind: "declare", line, endLine }];
  }
  if (word === "SET") {
    if (tokens[1]?.type === "var") {
      const param = facts.params.find(
        (p) => p.name.toLowerCase() === tokens[1].raw.toLowerCase(),
      );
      const value =
        tokens.length === 4 && isLiteral(tokens[3])
          ? literal(tokens[3])
          : undefined;
      if (param && value !== undefined) param.value = value;
      if (tokens.some((t) => isWord(t, "SELECT")))
        facts.flags.push({ kind: "set_from_query", line });
      return [{ kind: "set", line, endLine, target: tokens[1].raw }];
    }
    return [{ kind: "option", line, endLine }];
  }
  if (word === "EXEC" || word === "EXECUTE") {
    const dynamic =
      isPunct(tokens[1], "(") ||
      tokens.some((t) => /^sp_executesql$/i.test(t.value || ""));
    flag(dynamic ? "dynamic_sql" : "exec");
    return [{ kind: dynamic ? "dynamic_sql" : "exec", line, endLine }];
  }
  if (word === "MERGE") {
    flag("merge");
    const into = isWord(tokens[1], "INTO") ? 2 : 1;
    const chain = chainAt(tokens, into);
    return [
      {
        kind: "merge",
        line,
        endLine,
        target: chain ? tableName(chain.parts) : null,
      },
    ];
  }
  if (["OPEN", "FETCH", "CLOSE", "DEALLOCATE"].includes(word)) {
    flag("cursor");
    return [{ kind: "cursor", line, endLine }];
  }
  if (["IF", "ELSE", "WHILE"].includes(word)) {
    flag("control_flow", word);
    const select = tokens.findIndex((t) => isWord(t, "SELECT"));
    return [
      {
        kind: "control",
        line,
        endLine,
        ...(select > 0
          ? { reads: analyzeQuery(tokens.slice(select)).reads }
          : {}),
      },
    ];
  }
  if (word === "CREATE" && isWord(tokens[1], "TABLE")) {
    const chain = chainAt(tokens, 2);
    const name = chain ? tableName(chain.parts) : null;
    if (name)
      facts.datasets.push({
        name,
        kind: name.startsWith("#") ? "temp" : "table",
        line,
      });
    return [{ kind: "create_table", line, endLine, target: name }];
  }
  if (["DROP", "TRUNCATE", "ALTER", "CREATE"].includes(word))
    return [{ kind: "ddl", line, endLine }];
  if (["BEGIN", "END", "COMMIT", "ROLLBACK", "RETURN", "PRINT"].includes(word))
    return [{ kind: "other", line, endLine }];
  return [{ kind: "unknown", line, endLine }];
}

/** Marks ROW_NUMBER / COUNT(*) OVER (PARTITION BY …) filtered on 1 as dedupe. */
function findDedupes(units, flags) {
  const byName = new Map(
    units.filter((u) => u.name).map((u) => [u.name.toLowerCase(), u]),
  );
  const used = new Set();
  units.forEach((unit) => {
    for (const read of unit.reads || []) {
      const source = byName.get(String(read).toLowerCase());
      for (const w of source?.windows || []) {
        if (
          !w.alias ||
          !["ROW_NUMBER", "COUNT"].includes(w.function) ||
          !w.partitionBy.length
        )
          continue;
        const filter = (unit.where || []).find(
          (c) =>
            c.column === w.alias && c.op === "=" && String(c.value) === "1",
        );
        if (!filter) continue;
        unit.dedupe = {
          keep: w.function === "ROW_NUMBER" ? "first" : "none",
          partitionBy: w.partitionBy,
          orderBy: w.orderBy,
        };
        used.add(w);
      }
    }
  });
  units.forEach((unit) =>
    (unit.windows || []).forEach((w) => {
      if (!used.has(w))
        flags.push({ kind: "window", line: unit.line, detail: w.function });
    }),
  );
}

export function sqlFacts(text) {
  const facts = {
    language: "sql",
    statements: [],
    datasets: [],
    identifiers: {},
    params: [],
    flags: [],
  };
  const units = statements(sqlTokens(text)).flatMap((tokens) =>
    analyzeStatement(tokens, facts),
  );
  findDedupes(units, facts.flags);
  units.forEach((unit) =>
    facts.flags.push(...(unit.flags || []).map((f) => ({ ...f }))),
  );
  units.forEach((unit) => delete unit.flags);
  const defined = new Set(facts.datasets.map((d) => d.name.toLowerCase()));
  const tables = uniq(units.flatMap((u) => u.reads || [])).filter(
    (t) => !defined.has(t.toLowerCase()),
  );
  facts.statements = units.map((unit, index) => ({
    id: `s${index + 1}`,
    ...unit,
  }));
  facts.identifiers = {
    tables,
    columns: uniq(units.flatMap((u) => u.columns || [])).filter(
      (c) => !c.startsWith("@"),
    ),
  };
  const seen = new Set();
  facts.flags = facts.flags.filter((f) => {
    const key = `${f.kind}:${f.line}:${f.detail || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return facts;
}
