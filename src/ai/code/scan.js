/**
 * Runs before any code leaves ATLAS.
 *
 * - Credentials block the request: nothing is sent until they're removed.
 * - PII-like values (long digit runs, emails, phone numbers, user home paths)
 *   are masked reversibly. The AI sees ⟨L1⟩; the real value is restored into
 *   step params afterwards and never leaves ATLAS.
 * - Ordinary literals (status words, short codes, dates) are sent unchanged.
 */

const SECRET_RULES = Object.freeze([
  {
    kind: "private_key",
    label: "a private key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    kind: "connection_password",
    label: "a password in a connection string",
    // Only inside a connection string: after ; or a quote, ending at ; or a quote.
    pattern:
      /[;'"]\s*(password|pwd)\s*=\s*(?!%\(|\$|<)[^;'"\s{}[\]()]{3,}\s*(?:;|['"]|$)/i,
  },
  {
    kind: "assigned_secret",
    label: "a password, token or key in the code",
    pattern:
      /\b[\w.]*(password|passwd|secret|token|api_?key|access_?key|client_?secret)\w*\s*[:=]\s*[rbuf]?(['"])(?!\s*\2)(?!<|\{|\$|%\(|your[-_ ])[^'"]{4,}\2/i,
  },
  {
    kind: "bearer",
    label: "an authorization header",
    pattern:
      /\bauthorization\b['"]?\s*[:=,]\s*['"]?\s*(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {
    kind: "aws_key",
    label: "a cloud access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    kind: "url_credentials",
    label: "a username and password in a URL",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"]{3,}@/i,
  },
]);

const MASK_RULES = Object.freeze([
  {
    kind: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "home_path",
    pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\?Users\\\\?)[^\s/\\'"]+/g,
  },
  {
    kind: "phone",
    pattern: /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g,
  },
  { kind: "number", pattern: /(?<![\w.])\d{6,}(?![\w.])/g },
]);

/** Credentials found in the code: [{ file, cell, line, kind, label }]. */
export function findSecrets(ingested) {
  const findings = [];
  for (const file of ingested.files)
    for (const cell of file.cells)
      cell.lines.forEach((text, i) => {
        for (const rule of SECRET_RULES)
          if (rule.pattern.test(text)) {
            findings.push({
              file: file.id,
              fileName: file.name,
              cell: cell.index,
              line: i + 1,
              kind: rule.kind,
              label: rule.label,
            });
            break;
          }
      });
  return findings;
}

/** The message a user sees when a secret blocks translation. */
export function secretMessage(findings) {
  const first = findings[0];
  const where = `${first.fileName}${first.cell > 1 ? `, cell ${first.cell}` : ""}, line ${first.line}`;
  const more =
    findings.length > 1
      ? ` ${findings.length - 1} more line(s) look the same.`
      : "";
  return `${where} looks like ${first.label}. Remove it and try again: ATLAS doesn't send credentials to the AI service.${more}`;
}

/**
 * A masked copy of the ingested code and the values it hides.
 * Returns { ingested, values: Map(token → value), counts: { kind: n } }.
 */
export function maskCode(ingested) {
  const values = new Map();
  const tokens = new Map();
  const counts = {};
  const mask = (kind, value) => {
    if (!tokens.has(value)) {
      const token = `⟨L${tokens.size + 1}⟩`;
      tokens.set(value, token);
      values.set(token, value);
    }
    counts[kind] = (counts[kind] || 0) + 1;
    return tokens.get(value);
  };
  const files = ingested.files.map((file) => ({
    ...file,
    cells: file.cells.map((cell) => ({
      ...cell,
      lines: cell.lines.map((line) =>
        MASK_RULES.reduce(
          (text, rule) =>
            text.replace(rule.pattern, (match) => mask(rule.kind, match)),
          line,
        ),
      ),
    })),
  }));
  return { ingested: { ...ingested, files }, values, counts };
}

/** Puts masked values back into every string inside `value`. */
export function unmask(value, values) {
  if (typeof value === "string")
    return value.replace(/⟨L\d+⟩/g, (token) => values.get(token) ?? token);
  if (Array.isArray(value)) return value.map((item) => unmask(item, values));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, unmask(item, values)]),
    );
  return value;
}
