import {
  FIELD_LIBRARY_COLUMNS,
  FIELD_LIBRARY_TABLE,
} from "./00-global-variables.js";
import { CsvValidationError, replaceFieldLibrary } from "./field-library.js";
import { parseFieldLibraryWorkbook } from "./field-library-workbook.js";
import { quoteIdentifier } from "./schema.js";
import { readSharePointWorkbook } from "./sharepoint-client.js";

const quotedColumns = FIELD_LIBRARY_COLUMNS.map(quoteIdentifier).join(", ");
const fieldLibraryQuery = `SELECT ${quotedColumns} FROM ${quoteIdentifier(FIELD_LIBRARY_TABLE)} ORDER BY ${quoteIdentifier("Current Source")}, ${quoteIdentifier("ID")}`;

let tail = Promise.resolve();

function enqueue(task) {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function recordsFromTable(parsed) {
  return parsed.rows.map((row) => {
    const record = {};
    parsed.headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

export async function readFieldLibraryRows(pool) {
  try {
    const result = await pool.query(fieldLibraryQuery);
    return result.rows;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "field_library_backup_failed",
        message: error.message,
      }),
    );
    return null;
  }
}

function provenanceFor(kind, rows) {
  if (!rows?.length) {
    return {
      state: "unavailable",
      label: "Unavailable",
      detail: "Field library unavailable.",
      rows: [],
    };
  }
  const detail = {
    not_configured: "SharePoint is not configured. Saved field library.",
    invalid_config: "SharePoint workbook unavailable. Saved field library.",
    unavailable: "SharePoint workbook unavailable. Saved field library.",
    invalid: "SharePoint workbook could not be read. Saved field library.",
  }[kind];
  return {
    state: "backup",
    label: "Backup",
    detail,
    rows,
  };
}

async function loadLiveFieldLibraryUncached(pool, options) {
  const downloadWorkbook = options.downloadWorkbook || readSharePointWorkbook;
  const parseWorkbook = options.parseWorkbook || parseFieldLibraryWorkbook;
  const replaceLibrary = options.replaceLibrary || replaceFieldLibrary;
  const readRows = options.readRows || readFieldLibraryRows;
  let downloaded = null;
  try {
    downloaded = await downloadWorkbook();
    if (downloaded.outcome === "not_configured" || downloaded.outcome === "invalid_config") {
      return provenanceFor(downloaded.outcome, await readRows(pool));
    }
    const parsed = await parseWorkbook(downloaded.bytes, {
      sheetName: downloaded.sheetName || "",
    });
    if (downloaded.outcome === "reloaded") {
      await replaceLibrary(pool, {
        parsed,
        originalFileName: downloaded.fileName,
        importedBy: "sharepoint",
        importedByUser: { username: "sharepoint" },
      });
    }
    return {
      state: "live",
      label: "Live",
      detail: "SharePoint workbook loaded.",
      rows: recordsFromTable(parsed),
    };
  } catch (error) {
    const kind = error instanceof CsvValidationError ? "invalid" : "unavailable";
    console.error(
      JSON.stringify({
        level: "error",
        event: "sharepoint_field_library_failed",
        message: error.message,
      }),
    );
    return provenanceFor(kind, await readRows(pool));
  }
}

export function loadLiveFieldLibrary(pool, options = {}) {
  return enqueue(() => loadLiveFieldLibraryUncached(pool, options));
}

export function fieldLibraryProvenance(result) {
  return {
    state: result.state,
    label: result.label,
    detail: result.detail,
  };
}
