/**
 * Step type template language: a small, fixed-feature parser and renderer.
 *
 * Templates in step type definitions write English, automatic notes and the
 * Excel/SQL/Python formulas. They are parsed into a tree and walked; nothing
 * in a template is ever run as code, and lookups only read own properties.
 *
 * Syntax
 *   {{param.x}}                     value lookup (dotted path)
 *   {{helper arg key=value}}        helper call; args are paths, "strings",
 *                                   numbers, true/false/null or (sub helper)
 *   {{#if expr}}…{{else if expr}}…{{else}}…{{/if}}
 *   {{#unless expr}}…{{else}}…{{/unless}}
 *   {{#each list separator=", " lastSeparator=" and "}}…{{else}}…{{/each}}
 *       inside: {{this}}, {{this.x}}, {{x}} (item property), {{@index}},
 *       {{@number}} (index + 1), {{@first}}, {{@last}}, {{@count}}
 *   {{#switch expr}}{{#case "a" "b"}}…{{/case}}{{#default}}…{{/default}}{{/switch}}
 *   {{@root.param.x}}               root lookup from inside a loop
 *   {{> name}}  {{> name expr}}     include a partial (render's
 *                                   options.partials), optionally with expr
 *                                   as its context ({{this}} inside)
 *   (include "name" expr)           the same partial as a plain-text value
 *   {{! comment }}  {{~ trims whitespace before, ~}} trims whitespace after
 *   \{{                             a literal "{{"
 *
 * Output is plain text. Callers that show it in HTML escape it there, or
 * pass escapeText and escapeValue to render(): the first is applied to the
 * template's own text, the second to every {{value}}, so a value's quotes
 * can be escaped while the template's are not.
 *
 * Classic-script usage:
 *   ATLASStepTypes.templates.render("Sort by {{param.field}}.", data, { helpers })
 */
(function initializeStepTypeTemplates(global) {
  "use strict";

  const LIMITS = Object.freeze({
    templateLength: 20000,
    depth: 32,
    output: 200000,
    iterations: 10000,
  });
  const BLOCKS = Object.freeze(["if", "unless", "each", "switch"]);
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  /** The forms a format-keyed partial can have; "default" is the fallback. */
  const PARTIAL_FORMATS = Object.freeze([
    "english",
    "plain",
    "excel",
    "sql",
    "python",
    "default",
  ]);
  const PARTIAL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const SPECIAL_VARIABLES = Object.freeze([
    "index",
    "number",
    "first",
    "last",
    "count",
  ]);

  class TemplateError extends Error {
    constructor(message, source = "", offset = 0) {
      const before = String(source).slice(0, offset).split("\n");
      const line = before.length;
      const column = before[before.length - 1].length + 1;
      super(`${message} (line ${line}, column ${column})`);
      this.name = "TemplateError";
      this.reason = message;
      this.offset = offset;
      this.line = line;
      this.column = column;
    }
  }

  // ---------------------------------------------------------------------------
  // Lexer: text and {{tag}} tokens with whitespace-control flags.
  // ---------------------------------------------------------------------------

  function tokenize(source) {
    const tokens = [];
    let text = "";
    let textStart = 0;
    let index = 0;
    const pushText = () => {
      if (text) tokens.push({ kind: "text", value: text, offset: textStart });
      text = "";
    };
    while (index < source.length) {
      if (source.startsWith("\\{{", index)) {
        if (!text) textStart = index;
        text += "{{";
        index += 3;
        continue;
      }
      if (!source.startsWith("{{", index)) {
        if (!text) textStart = index;
        text += source[index];
        index += 1;
        continue;
      }
      pushText();
      const close = source.indexOf("}}", index + 2);
      if (close < 0) throw new TemplateError("Unclosed {{", source, index);
      let body = source.slice(index + 2, close);
      const trimBefore = body.startsWith("~");
      if (trimBefore) body = body.slice(1);
      const trimAfter = body.endsWith("~");
      if (trimAfter) body = body.slice(0, -1);
      tokens.push({
        kind: "tag",
        value: body.trim(),
        offset: index,
        bodyOffset: index + 2 + (trimBefore ? 1 : 0),
        trimBefore,
        trimAfter,
      });
      index = close + 2;
    }
    pushText();
    tokens.forEach((token, position) => {
      if (token.kind !== "tag") return;
      const previous = tokens[position - 1];
      const next = tokens[position + 1];
      if (token.trimBefore && previous?.kind === "text")
        previous.value = previous.value.replace(/\s+$/, "");
      if (token.trimAfter && next?.kind === "text")
        next.value = next.value.replace(/^\s+/, "");
    });
    return tokens.filter((token) => token.kind === "tag" || token.value);
  }

  // ---------------------------------------------------------------------------
  // Expression parser: helper calls, paths, literals and sub-expressions.
  // ---------------------------------------------------------------------------

  function expressionTokens(body, source, baseOffset) {
    const parts = [];
    let index = 0;
    while (index < body.length) {
      const char = body[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      const offset = baseOffset + index;
      if (char === "(" || char === ")" || char === "=") {
        parts.push({ kind: char, offset });
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        let value = "";
        let cursor = index + 1;
        while (cursor < body.length && body[cursor] !== char) {
          if (body[cursor] === "\\" && cursor + 1 < body.length) {
            const escaped = body[cursor + 1];
            value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
            cursor += 2;
          } else {
            value += body[cursor];
            cursor += 1;
          }
        }
        if (cursor >= body.length)
          throw new TemplateError("Unclosed string", source, offset);
        parts.push({ kind: "string", value, offset });
        index = cursor + 1;
        continue;
      }
      const match = /^[^\s()="']+/.exec(body.slice(index));
      parts.push({ kind: "word", value: match[0], offset });
      index += match[0].length;
    }
    return parts;
  }

  function parsePath(word, source, offset) {
    if (/^-?\d+(\.\d+)?$/.test(word))
      return { type: "literal", value: Number(word) };
    if (word === "true" || word === "false")
      return { type: "literal", value: word === "true" };
    if (word === "null") return { type: "literal", value: null };
    const segments = word.split(".");
    if (
      segments.some((segment) => !/^@?[A-Za-z_][\w-]*$/.test(segment)) ||
      segments.slice(1).some((segment) => segment.startsWith("@"))
    )
      throw new TemplateError(`"${word}" is not a valid name`, source, offset);
    if (segments.some((segment) => FORBIDDEN_KEYS.has(segment)))
      throw new TemplateError(`"${word}" is not allowed`, source, offset);
    if (
      segments[0].startsWith("@") &&
      segments[0] !== "@root" &&
      !SPECIAL_VARIABLES.includes(segments[0].slice(1))
    )
      throw new TemplateError(
        `Unknown variable ${segments[0]}`,
        source,
        offset,
      );
    return { type: "path", path: segments, offset };
  }

  /** Parses the tokens of one expression; a leading word followed by more is a call. */
  function parseExpression(parts, source, endOffset) {
    let position = 0;
    const atom = () => {
      const part = parts[position];
      if (!part) throw new TemplateError("Missing value", source, endOffset);
      if (part.kind === "string") {
        position += 1;
        return { type: "literal", value: part.value };
      }
      if (part.kind === "(") {
        position += 1;
        const start = position;
        let depth = 1;
        while (position < parts.length && depth) {
          if (parts[position].kind === "(") depth += 1;
          if (parts[position].kind === ")") depth -= 1;
          position += 1;
        }
        if (depth) throw new TemplateError("Unclosed (", source, part.offset);
        const inner = parts.slice(start, position - 1);
        if (!inner.length || inner[0].kind !== "word")
          throw new TemplateError(
            "A ( ) group must start with a helper name",
            source,
            part.offset,
          );
        return parseCall(inner, source, part.offset);
      }
      if (part.kind === "word") {
        position += 1;
        return parsePath(part.value, source, part.offset);
      }
      throw new TemplateError(`Unexpected "${part.kind}"`, source, part.offset);
    };
    const args = [];
    const hash = {};
    while (position < parts.length) {
      const part = parts[position];
      if (part.kind === "word" && parts[position + 1]?.kind === "=") {
        if (!/^[A-Za-z_]\w*$/.test(part.value))
          throw new TemplateError(
            `"${part.value}" is not a valid option name`,
            source,
            part.offset,
          );
        position += 2;
        hash[part.value] = atom();
        continue;
      }
      if (Object.keys(hash).length)
        throw new TemplateError(
          "Options (name=value) must come after the other values",
          source,
          part.offset,
        );
      args.push(atom());
    }
    return { args, hash };
  }

  function parseCall(parts, source, offset) {
    const [head, ...rest] = parts;
    if (!/^[A-Za-z_]\w*$/.test(head.value))
      throw new TemplateError(
        `"${head.value}" is not a valid helper name`,
        source,
        head.offset,
      );
    const { args, hash } = parseExpression(rest, source, offset);
    return { type: "call", name: head.value, args, hash, offset: head.offset };
  }

  /** A tag expression: a lone word is a value lookup or argument-free helper. */
  function parseTagExpression(body, source, offset) {
    const parts = expressionTokens(body, source, offset);
    if (!parts.length) throw new TemplateError("Empty {{ }}", source, offset);
    if (parts.length === 1 && parts[0].kind === "word") {
      const node = parsePath(parts[0].value, source, parts[0].offset);
      if (
        node.type === "path" &&
        node.path.length === 1 &&
        !/^@/.test(node.path[0])
      )
        return { type: "ref", name: node.path[0], offset: node.offset };
      return node;
    }
    if (parts[0].kind === "word" && parts[1]?.kind !== "=") {
      const node = parsePath(parts[0].value, source, parts[0].offset);
      if (node.type === "path" && node.path.length === 1 && parts.length > 1)
        return parseCall(parts, source, offset);
    }
    const { args, hash } = parseExpression(parts, source, offset);
    if (args.length !== 1 || Object.keys(hash).length)
      throw new TemplateError(
        "Start a helper call with the helper name",
        source,
        offset,
      );
    return args[0];
  }

  // ---------------------------------------------------------------------------
  // Tree builder.
  // ---------------------------------------------------------------------------

  const parseCache = new Map();

  function parse(source) {
    const text = source == null ? "" : String(source);
    if (parseCache.has(text)) return parseCache.get(text);
    if (text.length > LIMITS.templateLength)
      throw new TemplateError(
        `Template is longer than ${LIMITS.templateLength} characters`,
        text,
        LIMITS.templateLength,
      );
    const root = { type: "root", children: [] };
    const stack = [{ node: root, children: root.children }];
    const current = () => stack[stack.length - 1];

    for (const token of tokenize(text)) {
      if (token.kind === "text") {
        if (current().node.type === "switch") {
          if (token.value.trim())
            throw new TemplateError(
              "Only {{#case}} and {{#default}} can go directly inside {{#switch}}",
              text,
              token.offset,
            );
          continue;
        }
        current().children.push({ type: "text", value: token.value });
        continue;
      }
      const body = token.value;
      const offset = token.bodyOffset;
      if (body.startsWith("!")) continue;
      if (body.startsWith("#")) {
        const match = /^#(\w+)\s*([\s\S]*)$/.exec(body);
        const name = match?.[1] || "";
        const rest = match?.[2] || "";
        const parent = current().node;
        if (name === "case" || name === "default") {
          if (parent.type !== "switch")
            throw new TemplateError(
              `{{#${name}}} must be inside {{#switch}}`,
              text,
              token.offset,
            );
          if (name === "default" && rest.trim())
            throw new TemplateError(
              "{{#default}} takes no values",
              text,
              token.offset,
            );
          const values =
            name === "case"
              ? parseExpression(
                  expressionTokens(rest, text, offset),
                  text,
                  offset,
                )
              : { args: [], hash: {} };
          if (
            name === "case" &&
            (!values.args.length || Object.keys(values.hash).length)
          )
            throw new TemplateError(
              "{{#case}} needs one or more values",
              text,
              token.offset,
            );
          if (name === "default" && parent.fallback)
            throw new TemplateError(
              "{{#switch}} has more than one {{#default}}",
              text,
              token.offset,
            );
          const node = { type: name, values: values.args, children: [] };
          if (name === "case") parent.cases.push(node);
          else parent.fallback = node;
          stack.push({ node, children: node.children, offset: token.offset });
          continue;
        }
        if (!BLOCKS.includes(name))
          throw new TemplateError(
            `Unknown block {{#${name}}}`,
            text,
            token.offset,
          );
        if (stack.length > LIMITS.depth)
          throw new TemplateError(
            "Blocks are nested too deeply",
            text,
            token.offset,
          );
        if (!rest.trim())
          throw new TemplateError(
            `{{#${name}}} needs a value`,
            text,
            token.offset,
          );
        let node;
        if (name === "each") {
          const parts = expressionTokens(rest, text, offset + name.length + 1);
          const { args, hash } = parseExpression(parts, text, offset);
          if (args.length !== 1)
            throw new TemplateError(
              "{{#each}} takes one list",
              text,
              token.offset,
            );
          const allowed = ["separator", "lastSeparator", "pairSeparator"];
          const unknown = Object.keys(hash).find(
            (key) => !allowed.includes(key),
          );
          if (unknown)
            throw new TemplateError(
              `{{#each}} has no option "${unknown}"`,
              text,
              token.offset,
            );
          node = {
            type: "each",
            list: args[0],
            hash,
            children: [],
            inverse: null,
          };
        } else if (name === "switch") {
          node = {
            type: "switch",
            subject: parseTagExpression(rest, text, offset + name.length + 1),
            cases: [],
            fallback: null,
          };
        } else {
          node = {
            type: "if",
            negate: name === "unless",
            branches: [
              {
                test: parseTagExpression(rest, text, offset + name.length + 1),
                children: [],
              },
            ],
            inverse: null,
          };
        }
        if (parent.type === "switch")
          throw new TemplateError(
            "Only {{#case}} and {{#default}} can go directly inside {{#switch}}",
            text,
            token.offset,
          );
        current().children.push(node);
        const children =
          node.type === "if" ? node.branches[0].children : node.children || [];
        stack.push({ node, children, name, offset: token.offset });
        continue;
      }
      if (body === "else" || /^else\s+if\s/.test(body)) {
        const frame = current();
        const node = frame.node;
        const isIf = node.type === "if";
        if (!(isIf || node.type === "each"))
          throw new TemplateError(
            "{{else}} must be inside {{#if}}, {{#unless}} or {{#each}}",
            text,
            token.offset,
          );
        if (node.inverse)
          throw new TemplateError(
            "{{else}} after {{else}}",
            text,
            token.offset,
          );
        if (body === "else") {
          node.inverse = [];
          frame.children = node.inverse;
          continue;
        }
        if (!isIf || node.negate)
          throw new TemplateError(
            "{{else if}} is only allowed inside {{#if}}",
            text,
            token.offset,
          );
        const branch = {
          test: parseTagExpression(
            body.replace(/^else\s+if\s+/, ""),
            text,
            offset + body.indexOf("if") + 2,
          ),
          children: [],
        };
        node.branches.push(branch);
        frame.children = branch.children;
        continue;
      }
      if (body.startsWith("/")) {
        const name = body.slice(1).trim();
        const frame = current();
        const expected =
          frame.node.type === "case" || frame.node.type === "default"
            ? frame.node.type
            : frame.name;
        if (stack.length === 1 || name !== expected)
          throw new TemplateError(
            stack.length === 1
              ? `{{/${name}}} has no matching opening block`
              : `Expected {{/${expected}}} but found {{/${name}}}`,
            text,
            token.offset,
          );
        stack.pop();
        continue;
      }
      if (current().node.type === "switch")
        throw new TemplateError(
          "Only {{#case}} and {{#default}} can go directly inside {{#switch}}",
          text,
          token.offset,
        );
      if (body.startsWith(">")) {
        const match = /^>\s*(\S+)\s*([\s\S]*)$/.exec(body);
        if (!match)
          throw new TemplateError(
            "{{>}} needs a partial name",
            text,
            token.offset,
          );
        if (!PARTIAL_NAME.test(match[1]))
          throw new TemplateError(
            `"${match[1]}" is not a partial name`,
            text,
            token.offset,
          );
        const contextText = match[2].trim();
        current().children.push({
          type: "partial",
          name: match[1],
          context: contextText
            ? parseTagExpression(
                contextText,
                text,
                offset + body.indexOf(contextText, 1 + match[1].length),
              )
            : null,
          offset: token.offset,
        });
        continue;
      }
      current().children.push({
        type: "output",
        value: parseTagExpression(body, text, offset),
        offset: token.offset,
      });
    }
    if (stack.length > 1) {
      const open = current();
      const name =
        open.node.type === "case" || open.node.type === "default"
          ? open.node.type
          : open.name;
      throw new TemplateError(
        `{{#${name}}} is never closed`,
        text,
        open.offset,
      );
    }
    if (parseCache.size > 2000) parseCache.clear();
    parseCache.set(text, root);
    return root;
  }

  // ---------------------------------------------------------------------------
  // Values and built-in helpers.
  // ---------------------------------------------------------------------------

  function ownValue(target, key) {
    if (target == null || typeof target !== "object") return undefined;
    if (FORBIDDEN_KEYS.has(key)) return undefined;
    return Object.prototype.hasOwnProperty.call(target, key)
      ? target[key]
      : undefined;
  }

  /** Falsy: missing, null, false, "", whitespace-only text, empty list, NaN. */
  function truthy(value) {
    if (value == null || value === false) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "number") return !Number.isNaN(value);
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function toText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number")
      return Number.isFinite(value) ? String(value) : "";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value))
      return value.map(toText).filter(Boolean).join(", ");
    return "";
  }

  const comparable = (value) =>
    typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : toText(value);

  const BUILTIN_HELPERS = Object.freeze({
    eq: (args) => comparable(args[0]) === comparable(args[1]),
    ne: (args) => comparable(args[0]) !== comparable(args[1]),
    in: (args) =>
      args.slice(1).flat().map(comparable).includes(comparable(args[0])),
    not: (args) => !truthy(args[0]),
    and: (args) => args.length > 0 && args.every(truthy),
    or: (args) => args.some(truthy),
    blank: (args) => !truthy(args[0]),
    present: (args) => truthy(args[0]),
    gt: (args) => Number(args[0]) > Number(args[1]),
    lt: (args) => Number(args[0]) < Number(args[1]),
    default: (args) => args.find(truthy) ?? "",
    lower: (args) => toText(args[0]).toLowerCase(),
    upper: (args) => toText(args[0]).toUpperCase(),
    trim: (args) => toText(args[0]).trim(),
    concat: (args) => args.map(toText).join(""),
    count: (args) =>
      Array.isArray(args[0]) ? args[0].length : truthy(args[0]) ? 1 : 0,
    join: (args, hash) =>
      (Array.isArray(args[0]) ? args[0] : [])
        .map(toText)
        .join(hash.separator == null ? ", " : toText(hash.separator)),
    replace: (args) =>
      toText(args[0]).split(toText(args[1])).join(toText(args[2])),
    // (include "name" [value]) is {{> name [value]}} as a value: the
    // partial's plain text, so it can be compared, trimmed or passed on.
    include: (args, hash, tools) =>
      tools?.partial
        ? tools.partial(toText(args[0]), ...(args.length > 1 ? [args[1]] : []))
        : "",
  });

  // ---------------------------------------------------------------------------
  // Renderer.
  // ---------------------------------------------------------------------------

  function render(template, data = {}, options = {}) {
    const source = typeof template === "string" ? template : "";
    const tree = typeof template === "string" ? parse(template) : template;
    const helpers = { ...BUILTIN_HELPERS, ...(options.helpers || {}) };
    const budget = { output: 0, iterations: 0 };
    const escapes = {
      text:
        typeof options.escapeText === "function" ? options.escapeText : null,
      value:
        typeof options.escapeValue === "function" ? options.escapeValue : null,
    };
    const partials =
      options.partials && typeof options.partials === "object"
        ? options.partials
        : {};
    const context = {
      data,
      format: options.format || "",
      strict: Boolean(options.strict),
    };
    // The template whose offsets errors refer to, and how many partials deep
    // the walk is. Partials share the output and loop budgets.
    let currentSource = source;
    let partialDepth = 0;

    const fail = (message, offset = 0) => {
      throw new TemplateError(message, currentSource, offset);
    };

    /** The text of a partial for the current format. */
    function partialText(name, offset) {
      if (!Object.prototype.hasOwnProperty.call(partials, name))
        fail(`Unknown partial "${name}"`, offset);
      const value = partials[name];
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const form = Object.prototype.hasOwnProperty.call(value, context.format)
          ? value[context.format]
          : value.default;
        if (typeof form === "string") return form;
        fail(
          `Partial "${name}" has no ${context.format || "default"} form`,
          offset,
        );
      }
      return fail(`Partial "${name}" is not a template`, offset);
    }

    /** Walks a partial with `frames`, adding its output to `parts`. */
    function includePartial(name, frames, parts, offset) {
      const text = partialText(name, offset);
      if (partialDepth >= LIMITS.depth)
        fail(`Partials are nested more than ${LIMITS.depth} deep`, offset);
      const outerSource = currentSource;
      partialDepth += 1;
      try {
        currentSource = text;
        walk(parse(text).children, frames, parts);
      } catch (error) {
        if (
          !(error instanceof TemplateError) ||
          error.partialDepth > partialDepth
        )
          throw error;
        const wrapped = new TemplateError(
          `In partial "${name}" (line ${error.line}, column ${error.column}): ${error.reason}`,
          outerSource,
          offset,
        );
        wrapped.partialDepth = partialDepth;
        throw wrapped;
      } finally {
        partialDepth -= 1;
        currentSource = outerSource;
      }
      return parts;
    }

    const contextFrames = (value, frames) => [
      { loop: false, item: value },
      ...frames,
    ];

    function lookup(node, frames) {
      const [head, ...rest] = node.path;
      let value;
      if (head === "@root") value = data;
      else if (head.startsWith("@")) {
        const frame = frames.find((item) => item.loop);
        if (!frame) {
          if (context.strict)
            fail(`${head} is only available inside {{#each}}`, node.offset);
          return undefined;
        }
        const key = head.slice(1);
        value =
          key === "index"
            ? frame.index
            : key === "number"
              ? frame.index + 1
              : key === "first"
                ? frame.index === 0
                : key === "last"
                  ? frame.index === frame.count - 1
                  : frame.count;
        return rest.length ? undefined : value;
      } else if (head === "this") {
        value = frames.length ? frames[0].item : data;
      } else {
        const frame = frames[0];
        const item = frame?.item;
        value =
          item && typeof item === "object" && ownValue(item, head) !== undefined
            ? ownValue(item, head)
            : ownValue(data, head);
        if (value === undefined && context.strict && rest.length === 0)
          fail(`Unknown value "${head}"`, node.offset);
      }
      for (const key of rest) value = ownValue(value, key);
      return value;
    }

    function evaluate(node, frames) {
      if (node.type === "literal") return node.value;
      if (node.type === "path") return lookup(node, frames);
      if (node.type === "ref") {
        if (Object.prototype.hasOwnProperty.call(helpers, node.name))
          return callHelper(
            { name: node.name, args: [], hash: {}, offset: node.offset },
            frames,
          );
        return lookup({ path: [node.name], offset: node.offset }, frames);
      }
      if (node.type === "call") return callHelper(node, frames);
      return undefined;
    }

    function callHelper(node, frames) {
      if (!Object.prototype.hasOwnProperty.call(helpers, node.name))
        fail(`Unknown helper "${node.name}"`, node.offset);
      const args = node.args.map((arg) => evaluate(arg, frames));
      const hash = {};
      Object.entries(node.hash).forEach(([key, value]) => {
        hash[key] = evaluate(value, frames);
      });
      // partial(name[, value]) renders a partial as plain text (the caller's
      // {{output}} escapes the helper's result), with `value` as its context.
      const partial = (name, ...rest) => {
        const saved = { ...escapes };
        escapes.text = null;
        escapes.value = null;
        try {
          return includePartial(
            String(name),
            rest.length ? contextFrames(rest[0], frames) : frames,
            [],
            node.offset,
          ).join("");
        } finally {
          Object.assign(escapes, saved);
        }
      };
      return helpers[node.name](args, hash, {
        format: context.format,
        data,
        item: frames[0]?.item,
        partial,
      });
    }

    function emit(parts, value) {
      budget.output += value.length;
      if (budget.output > LIMITS.output)
        fail(`Output is longer than ${LIMITS.output} characters`);
      parts.push(value);
    }

    function walk(children, frames, parts) {
      for (const node of children) {
        if (node.type === "text")
          emit(parts, escapes.text ? escapes.text(node.value) : node.value);
        else if (node.type === "output") {
          const value = toText(evaluate(node.value, frames));
          emit(parts, escapes.value ? toText(escapes.value(value)) : value);
        } else if (node.type === "partial")
          includePartial(
            node.name,
            node.context
              ? contextFrames(evaluate(node.context, frames), frames)
              : frames,
            parts,
            node.offset,
          );
        else if (node.type === "if") {
          const branch = node.branches.find((item, index) => {
            const passed = truthy(evaluate(item.test, frames));
            return index === 0 && node.negate ? !passed : passed;
          });
          if (branch) walk(branch.children, frames, parts);
          else if (node.inverse) walk(node.inverse, frames, parts);
        } else if (node.type === "each") {
          const list = evaluate(node.list, frames);
          const items = Array.isArray(list) ? list : [];
          if (!items.length) {
            if (node.inverse) walk(node.inverse, frames, parts);
            continue;
          }
          const separator = toText(
            evaluate(
              node.hash.separator || { type: "literal", value: "" },
              frames,
            ),
          );
          const last = node.hash.lastSeparator
            ? toText(evaluate(node.hash.lastSeparator, frames))
            : separator;
          const pair = node.hash.pairSeparator
            ? toText(evaluate(node.hash.pairSeparator, frames))
            : last;
          items.forEach((item, index) => {
            budget.iterations += 1;
            if (budget.iterations > LIMITS.iterations)
              fail(`Loops ran more than ${LIMITS.iterations} times`);
            if (index > 0)
              emit(
                parts,
                index === items.length - 1
                  ? items.length === 2
                    ? pair
                    : last
                  : separator,
              );
            walk(
              node.children,
              [{ loop: true, item, index, count: items.length }, ...frames],
              parts,
            );
          });
        } else if (node.type === "switch") {
          const subject = comparable(evaluate(node.subject, frames));
          const match = node.cases.find((item) =>
            item.values.some(
              (value) => comparable(evaluate(value, frames)) === subject,
            ),
          );
          if (match) walk(match.children, frames, parts);
          else if (node.fallback) walk(node.fallback.children, frames, parts);
        }
      }
      return parts;
    }

    return walk(tree.children, [], []).join("");
  }

  // ---------------------------------------------------------------------------
  // Checks for the builder: syntax, helper names and value roots.
  // ---------------------------------------------------------------------------

  function walkNodes(tree, visit) {
    const visitExpression = (node) => {
      if (!node) return;
      visit(node);
      if (node.type === "call") {
        node.args.forEach(visitExpression);
        Object.values(node.hash).forEach(visitExpression);
      }
    };
    const visitChildren = (children = []) =>
      children.forEach((node) => {
        if (node.type === "output") visitExpression(node.value);
        if (node.type === "partial") visitExpression(node.context);
        if (node.type === "if") {
          node.branches.forEach((branch) => {
            visitExpression(branch.test);
            visitChildren(branch.children);
          });
          visitChildren(node.inverse || []);
        }
        if (node.type === "each") {
          visitExpression(node.list);
          Object.values(node.hash).forEach(visitExpression);
          visitChildren(node.children);
          visitChildren(node.inverse || []);
        }
        if (node.type === "switch") {
          visitExpression(node.subject);
          node.cases.forEach((item) => {
            item.values.forEach(visitExpression);
            visitChildren(item.children);
          });
          if (node.fallback) visitChildren(node.fallback.children);
        }
      });
    visitChildren(tree.children);
  }

  /** Every dotted value path a template reads, e.g. ["param.field_name"]. */
  function references(template) {
    const found = new Set();
    walkNodes(parse(template), (node) => {
      if (node.type === "path" && !node.path[0].startsWith("@"))
        found.add(node.path.join("."));
      if (node.type === "path" && node.path[0] === "@root")
        found.add(node.path.slice(1).join("."));
      if (node.type === "ref") found.add(node.name);
    });
    return [...found];
  }

  /**
   * Returns a list of problems instead of throwing. `helpers` lists the
   * helper names the caller will supply; `roots` lists the allowed first path
   * segments (loop item properties are not checked); `partials` lists the
   * partial names {{> }} may include (not checked when left out);
   * `partialHashes` maps a helper name to its hash key that names a partial,
   * e.g. {conditionTree: "leaf"}, so a literal name there is checked too.
   */
  function check(template, options = {}) {
    let tree;
    try {
      tree = parse(template);
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      return [
        {
          message: error.reason,
          offset: error.offset,
          line: error.line,
          column: error.column,
        },
      ];
    }
    const helperNames = new Set([
      ...Object.keys(BUILTIN_HELPERS),
      ...(options.helpers || []),
    ]);
    const roots = options.roots ? new Set(options.roots) : null;
    const partialNames = options.partials ? new Set(options.partials) : null;
    const problems = [];
    const report = (message, offset) => {
      const error = new TemplateError(message, String(template), offset || 0);
      problems.push({
        message,
        offset: error.offset,
        line: error.line,
        column: error.column,
      });
    };
    let loops = 0;
    const visitChildren = (children = []) =>
      children.forEach((node) => {
        const expressions = [];
        if (node.type === "output") expressions.push(node.value);
        if (node.type === "partial") {
          if (partialNames && !partialNames.has(node.name))
            report(`Unknown partial "${node.name}"`, node.offset);
          if (node.context) expressions.push(node.context);
        }
        if (node.type === "if")
          node.branches.forEach((branch) => expressions.push(branch.test));
        if (node.type === "each")
          expressions.push(node.list, ...Object.values(node.hash));
        if (node.type === "switch") {
          expressions.push(node.subject);
          node.cases.forEach((item) => expressions.push(...item.values));
        }
        expressions.forEach(function visitExpression(expression) {
          if (expression.type === "call") {
            if (!helperNames.has(expression.name))
              report(`Unknown helper "${expression.name}"`, expression.offset);
            const partialKey = Object.prototype.hasOwnProperty.call(
              options.partialHashes || {},
              expression.name,
            )
              ? options.partialHashes[expression.name]
              : null;
            const named = partialKey ? expression.hash[partialKey] : null;
            if (
              partialNames &&
              named?.type === "literal" &&
              !partialNames.has(String(named.value))
            )
              report(`Unknown partial "${named.value}"`, expression.offset);
            const included =
              expression.name === "include" ? expression.args[0] : null;
            if (
              partialNames &&
              included?.type === "literal" &&
              !partialNames.has(String(included.value))
            )
              report(`Unknown partial "${included.value}"`, expression.offset);
            expression.args.forEach(visitExpression);
            Object.values(expression.hash).forEach(visitExpression);
          }
          const head =
            expression.type === "path"
              ? expression.path[0]
              : expression.type === "ref" && !helperNames.has(expression.name)
                ? expression.name
                : null;
          if (
            head &&
            roots &&
            !loops &&
            !head.startsWith("@") &&
            head !== "this" &&
            !roots.has(head)
          )
            report(`Unknown value "${head}"`, expression.offset);
          if (head && head.startsWith("@") && head !== "@root" && !loops)
            report(
              `${head} is only available inside {{#each}}`,
              expression.offset,
            );
        });
        if (node.type === "if") {
          node.branches.forEach((branch) => visitChildren(branch.children));
          visitChildren(node.inverse || []);
        }
        if (node.type === "each") {
          loops += 1;
          visitChildren(node.children);
          loops -= 1;
          visitChildren(node.inverse || []);
        }
        if (node.type === "switch") {
          node.cases.forEach((item) => visitChildren(item.children));
          if (node.fallback) visitChildren(node.fallback.children);
        }
      });
    visitChildren(tree.children);
    return problems;
  }

  const api = Object.freeze({
    LIMITS,
    PARTIAL_FORMATS,
    BUILTIN_HELPERS,
    TemplateError,
    parse,
    render,
    check,
    references,
    truthy,
    toText,
  });
  global.ATLASStepTypes = global.ATLASStepTypes || {};
  global.ATLASStepTypes.templates = api;
})(typeof window !== "undefined" ? window : globalThis);
