/**
 * A Python tokenizer for the pandas facts lexer. Groups tokens into logical
 * lines: brackets and backslashes join physical lines, comments are dropped.
 *
 * Token types: name, string, number, mask (⟨L1⟩), op, punct.
 * Each logical line: { tokens, line, endLine, indent }.
 */

const THREE = ["**=", "//=", ">>=", "<<=", "..."];
const TWO = [
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "->",
  "**",
  "//",
  "<<",
  ">>",
  ":=",
];

export function pythonLines(text) {
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = [];
  let tokens = [];
  let depth = 0;
  let line = 1;
  let startLine = 1;
  let indent = 0;
  let atLineStart = true;
  let i = 0;
  const end = () => {
    if (tokens.length)
      lines.push({
        tokens,
        line: startLine,
        endLine: tokens.at(-1).endLine ?? tokens.at(-1).line,
        indent,
      });
    tokens = [];
  };
  const push = (type, raw, value = raw, extra = {}) => {
    if (!tokens.length) startLine = line;
    tokens.push({ type, raw, value, line, ...extra });
  };
  while (i < source.length) {
    const ch = source[i];
    if (atLineStart) {
      const match = /^[ \t]*/.exec(source.slice(i));
      if (depth === 0 && !tokens.length)
        indent = match[0].replace(/\t/g, "    ").length;
      i += match[0].length;
      atLineStart = false;
      continue;
    }
    if (ch === "\n") {
      if (depth === 0) end();
      line += 1;
      atLineStart = true;
      i += 1;
      continue;
    }
    if (ch === "\\" && source[i + 1] === "\n") {
      line += 1;
      i += 2;
      continue;
    }
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    const prefix = /^([rRbBuUfF]{0,2})('''|"""|'|")/.exec(
      source.slice(i, i + 5),
    );
    if (prefix && (prefix[1] === "" || /[A-Za-z]/.test(ch))) {
      const quote = prefix[2];
      const start = i;
      const first = line;
      i += prefix[0].length;
      let value = "";
      while (i < source.length) {
        if (source[i] === "\\" && !/r/i.test(prefix[1])) {
          value += source[i + 1] ?? "";
          if (source[i + 1] === "\n") line += 1;
          i += 2;
          continue;
        }
        if (source.startsWith(quote, i)) {
          i += quote.length;
          break;
        }
        if (source[i] === "\n") {
          if (quote.length === 1) break;
          line += 1;
        }
        value += source[i];
        i += 1;
      }
      const saved = line;
      line = first;
      push("string", source.slice(start, i), value, {
        prefix: prefix[1].toLowerCase(),
        endLine: saved,
      });
      line = saved;
      continue;
    }
    if (ch === "⟨") {
      const match = /^⟨L\d+⟩/.exec(source.slice(i, i + 12));
      if (match) {
        push("mask", match[0]);
        i += match[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      const match =
        /^(?:0[xob][0-9a-f_]+|\d[\d_]*\.?[\d_]*(?:e[+-]?\d+)?j?|\.\d+(?:e[+-]?\d+)?)/i.exec(
          source.slice(i),
        );
      push("number", match[0]);
      i += match[0].length;
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      const match = /^[\p{L}\p{N}_]+/u.exec(source.slice(i));
      push("name", match[0]);
      i += match[0].length;
      continue;
    }
    const three = source.slice(i, i + 3);
    const two = source.slice(i, i + 2);
    if (THREE.includes(three)) {
      push("op", three);
      i += 3;
      continue;
    }
    if (TWO.includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      end();
      i += 1;
      continue;
    }
    push("([{)]},:.;@".includes(ch) ? "punct" : "op", ch);
    i += 1;
  }
  end();
  return lines;
}

export const isP = (token, ch) => token?.type === "punct" && token.raw === ch;
export const isName = (token, ...names) =>
  token?.type === "name" && (!names.length || names.includes(token.raw));

/** Index of the bracket closing the one at `open`. */
export function closing(tokens, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const want = pairs[tokens[open]?.raw];
  let depth = 0;
  for (let i = open; i < tokens.length; i += 1) {
    if (tokens[i].type !== "punct") continue;
    if (pairs[tokens[i].raw]) depth += 1;
    else if (")]}".includes(tokens[i].raw) && --depth === 0)
      return tokens[i].raw === want ? i : i;
  }
  return tokens.length - 1;
}
