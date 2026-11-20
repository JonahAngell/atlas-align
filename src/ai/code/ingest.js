/**
 * Reads pasted or uploaded code into a fixed shape the rest of the pipeline
 * uses: files → cells → lines, each line addressable as { file, cell, line }.
 *
 * Notebook outputs, execution counts and attachments are dropped here and
 * never reach the AI service: outputs often hold real data rows.
 */

export const CODE_LIMITS = Object.freeze({
  maxFiles: 5,
  maxTotalBytes: 500 * 1024,
  maxNameLength: 120,
});

const EXTENSIONS = Object.freeze({
  ".sql": "sql",
  ".py": "python",
  ".ipynb": "python",
  ".txt": null,
});

export class CodeInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "CodeInputError";
    this.status = 400;
  }
}

function extensionOf(name) {
  const match = /\.[A-Za-z0-9]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}

/**
 * Guesses SQL or pandas from the text. Used for pasted code and .txt files.
 * Returns null when it can't tell.
 */
export function detectLanguage(text) {
  const sample = String(text || "").slice(0, 20000);
  const python = [
    /^\s*(import|from)\s+(pandas|numpy)\b/m,
    /\bpd\.(read_\w+|merge|concat|DataFrame)\s*\(/,
    /\bdf\w*\s*\[\s*['"][^'"]+['"]\s*\]/,
    /\.(merge|drop_duplicates|sort_values|loc|iloc)\b/,
    /^\s*def\s+\w+\s*\(/m,
  ].filter((pattern) => pattern.test(sample)).length;
  const sql = [
    /\bselect\b[\s\S]+?\bfrom\b/i,
    /\b(left|inner|right|full)\s+(outer\s+)?join\b/i,
    /\bwhere\b/i,
    /^\s*(with|declare|update|insert)\b/im,
    /^\s*go\s*$/im,
  ].filter((pattern) => pattern.test(sample)).length;
  if (python >= 2 && python > sql) return "python";
  if (sql >= 2 && sql > python) return "sql";
  return null;
}

function splitLines(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
}

function notebookCells(text, name) {
  let notebook;
  try {
    notebook = JSON.parse(text);
  } catch (_error) {
    throw new CodeInputError(
      `${name} isn't a valid notebook file, so it can't be read. Save it again from Jupyter and upload it again.`,
    );
  }
  if (!notebook || !Array.isArray(notebook.cells))
    throw new CodeInputError(
      `${name} has no notebook cells, so there's nothing to read. Check you uploaded the notebook itself.`,
    );
  const cells = [];
  notebook.cells.forEach((cell, index) => {
    const kind = cell?.cell_type;
    if (kind !== "code" && kind !== "markdown") return;
    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : String(cell.source ?? "");
    // Only the source is kept. outputs, execution_count, attachments and
    // metadata are not copied.
    cells.push({ index: index + 1, kind, lines: splitLines(source) });
  });
  return cells;
}

/**
 * files: [{ name, text, language? }]. A pasted snippet is a file without an
 * extension and with an optional language. Returns
 * { files: [{ id, name, language, cells: [{ index, kind, lines }] }] }.
 */
export function ingestCode(files) {
  if (!Array.isArray(files) || !files.length)
    throw new CodeInputError(
      "No code was received. Paste code or choose a .sql, .py or .ipynb file.",
    );
  if (files.length > CODE_LIMITS.maxFiles)
    throw new CodeInputError(
      `${files.length} files were sent, but ATLAS reads up to ${CODE_LIMITS.maxFiles} at a time. Remove some files and try again.`,
    );
  let total = 0;
  const out = files.map((file, index) => {
    const name = String(file?.name || "")
      .trim()
      .slice(0, CODE_LIMITS.maxNameLength);
    const label = name || `Pasted code ${index + 1}`;
    if (typeof file?.text !== "string")
      throw new CodeInputError(
        `${label} has no text, so it can't be read. Upload it again.`,
      );
    total += Buffer.byteLength(file.text, "utf8");
    if (total > CODE_LIMITS.maxTotalBytes)
      throw new CodeInputError(
        `The code is larger than ${CODE_LIMITS.maxTotalBytes / 1024} KB, so it can't be translated in one go. Split it into smaller files and translate them one at a time.`,
      );
    if (file.text.includes("\u0000"))
      throw new CodeInputError(
        `${label} looks like a binary file, not code. Upload the .sql, .py or .ipynb file.`,
      );
    const extension = extensionOf(name);
    if (name && extension && !(extension in EXTENSIONS))
      throw new CodeInputError(
        `${label} isn't a file type ATLAS can translate. Use a .sql, .py, .ipynb or .txt file.`,
      );
    const cells =
      extension === ".ipynb"
        ? notebookCells(file.text, label)
        : [{ index: 1, kind: "code", lines: splitLines(file.text) }];
    const codeText = cells
      .filter((cell) => cell.kind === "code")
      .map((cell) => cell.lines.join("\n"))
      .join("\n");
    const declared = ["sql", "python"].includes(file.language)
      ? file.language
      : null;
    const language =
      EXTENSIONS[extension] || declared || detectLanguage(codeText);
    if (!language)
      throw new CodeInputError(
        `ATLAS couldn't tell whether ${label} is SQL Server or pandas code. Choose the language and try again.`,
      );
    return { id: `f${index + 1}`, name: label, language, cells };
  });
  return { files: out };
}

/** Every code line with its address. Markdown cells are skipped. */
export function* codeLines(ingested) {
  for (const file of ingested.files)
    for (const cell of file.cells) {
      if (cell.kind !== "code") continue;
      for (let i = 0; i < cell.lines.length; i += 1)
        yield {
          file: file.id,
          cell: cell.index,
          line: i + 1,
          text: cell.lines[i],
        };
    }
}
