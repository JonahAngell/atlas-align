/**
 * A T-SQL tokenizer for the facts lexer. Comments are dropped. Every token
 * keeps its 1-based line so facts can point back at the code.
 *
 * Token types: word, ident ([x] or "x"), var (@x), temp (#x), string,
 * number, mask (⟨L1⟩ from the scanner), op, punct.
 */

const OPERATORS = ["<>", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "||"];

export function sqlTokens(text) {
  const source = String(text ?? "");
  const tokens = [];
  let i = 0;
  let line = 1;
  let lineStart = true;
  const push = (type, raw, value = raw) => {
    tokens.push({
      type,
      raw,
      value,
      upper: type === "word" ? raw.toUpperCase() : null,
      line,
      first: lineStart,
    });
    lineStart = false;
  };
  const count = (raw) => {
    for (const ch of raw) if (ch === "\n") line += 1;
  };
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      lineStart = true;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "-" && source[i + 1] === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      count(source.slice(i, stop));
      i = stop;
      continue;
    }
    // N'...' and '...' with '' as an escaped quote.
    if (ch === "'" || ((ch === "N" || ch === "n") && source[i + 1] === "'")) {
      const start = i;
      const startLine = line;
      i += ch === "'" ? 1 : 2;
      let value = "";
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          value += "'";
          i += 2;
        } else if (source[i] === "'") {
          i += 1;
          break;
        } else {
          value += source[i];
          i += 1;
        }
      }
      const raw = source.slice(start, i);
      const first = lineStart;
      line = startLine;
      push("string", raw, value);
      tokens[tokens.length - 1].first = first;
      count(raw);
      continue;
    }
    if (ch === "[" || ch === '"') {
      const close = ch === "[" ? "]" : '"';
      const start = i;
      i += 1;
      let value = "";
      while (i < source.length) {
        if (source[i] === close && source[i + 1] === close) {
          value += close;
          i += 2;
        } else if (source[i] === close) {
          i += 1;
          break;
        } else {
          value += source[i];
          i += 1;
        }
      }
      push("ident", source.slice(start, i), value);
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
    if (ch === "@" || ch === "#") {
      const match = /^[@#]{1,2}[\p{L}\p{N}_$#@]*/u.exec(source.slice(i));
      push(ch === "@" ? "var" : "temp", match[0]);
      i += match[0].length;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(
        source.slice(i),
      );
      push("number", match[0]);
      i += match[0].length;
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      const match = /^[\p{L}\p{N}_$]+/u.exec(source.slice(i));
      push("word", match[0]);
      i += match[0].length;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if ("=<>+-*/%&|^~".includes(ch)) push("op", ch);
    else push("punct", ch);
    i += 1;
  }
  return tokens;
}

export const isWord = (token, ...words) =>
  token?.type === "word" && words.includes(token.upper);

export const isPunct = (token, ch) =>
  token?.type === "punct" && token.raw === ch;
