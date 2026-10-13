import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import {
  FIELD_LIBRARY_COLUMNS,
  FIELD_LIBRARY_TABLE,
} from "./00-global-variables.js";
import { quoteIdentifier } from "./schema.js";
import { withTransaction } from "./db-transaction.js";
import { loadSql } from "./sql.js";

const quotedTable = quoteIdentifier(FIELD_LIBRARY_TABLE);
const quotedColumns = FIELD_LIBRARY_COLUMNS.map(quoteIdentifier).join(", ");
const sqlResource = (name) =>
  loadSql(`../sql/field-library/${name}.sql`, import.meta.url)
    .replaceAll("__FIELD_LIBRARY_TABLE__", quotedTable)
    .replaceAll("__FIELD_LIBRARY_COLUMNS__", quotedColumns);

const SQL = Object.freeze({
  createImportRecord: sqlResource("create-import-record"),
  createStageTable: sqlResource("create-stage-table"),
  insertStageBatch: sqlResource("insert-stage-batch"),
  countStagedRows: sqlResource("count-staged-rows"),
  truncateFieldLibrary: sqlResource("truncate-field-library"),
  copyStageToFieldLibrary: sqlResource("copy-stage-to-field-library"),
  completeImportRecord: sqlResource("complete-import-record"),
});

export class CsvValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CsvValidationError";
    this.details = details;
  }
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function validationCopy(source) {
  return source === "workbook"
    ? {
        empty: "The workbook must contain a header and at least one data row.",
        columnCount: "Workbook column count does not match ATLAS Field Library.",
        header: "Workbook header mismatch.",
        rowCount: "Workbook row has an unexpected column count.",
      }
    : {
        empty: "The CSV must contain a header and at least one data row.",
        columnCount: "CSV column count does not match ATLAS Field Library.",
        header: "CSV header mismatch.",
        rowCount: "CSV row has an unexpected column count.",
      };
}

export function validateFieldLibraryTable(headers, rows, source = "csv") {
  const messages = validationCopy(source);
  if (!Array.isArray(headers) || !Array.isArray(rows) || rows.length < 1) {
    throw new CsvValidationError(messages.empty);
  }
  if (headers.length !== FIELD_LIBRARY_COLUMNS.length) {
    throw new CsvValidationError(messages.columnCount, {
      expected: FIELD_LIBRARY_COLUMNS.length,
      received: headers.length,
    });
  }

  for (let index = 0; index < FIELD_LIBRARY_COLUMNS.length; index += 1) {
    if (headers[index] !== FIELD_LIBRARY_COLUMNS[index]) {
      throw new CsvValidationError(messages.header, {
        position: index + 1,
        expected: FIELD_LIBRARY_COLUMNS[index],
        received: headers[index],
      });
    }
  }

  const idIndex = FIELD_LIBRARY_COLUMNS.indexOf("ID");
  const ids = new Set();
  rows.forEach((row, rowIndex) => {
    const csvRow = rowIndex + 2;
    if (!Array.isArray(row) || row.length !== FIELD_LIBRARY_COLUMNS.length) {
      throw new CsvValidationError(messages.rowCount, {
        row: csvRow,
        expected: FIELD_LIBRARY_COLUMNS.length,
        received: Array.isArray(row) ? row.length : 0,
      });
    }
    const id = row[idIndex];
    if (id === "") {
      throw new CsvValidationError("ID cannot be blank.", { row: csvRow });
    }
    if (ids.has(id)) {
      throw new CsvValidationError("ID values must be unique.", {
        row: csvRow,
        id,
      });
    }
    ids.add(id);
  });

  return { headers, rows };
}

export function parseAndValidateCsv(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new CsvValidationError("The CSV must be valid UTF-8.");
  }

  let records;
  try {
    records = parse(stripBom(text), {
      bom: true,
      columns: false,
      relax_column_count: false,
      skip_empty_lines: false,
    });
  } catch (error) {
    throw new CsvValidationError("The CSV could not be parsed.", {
      parserMessage: error.message,
    });
  }

  if (records.length < 2) {
    throw new CsvValidationError(
      "The CSV must contain a header and at least one data row.",
    );
  }

  const [headers, ...rows] = records;
  const validated = validateFieldLibraryTable(headers, rows, "csv");
  return {
    ...validated,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function replaceFieldLibrary(
  pool,
  { buffer, parsed, originalFileName, importedBy, importedByUser },
) {
  const table = parsed || parseAndValidateCsv(buffer);
  return withTransaction(pool, async (client) => {
    const start = await client.query(SQL.createImportRecord, [
      originalFileName,
      table.rows.length,
      table.sha256,
      importedBy || null,
      importedByUser?.id || null,
      importedByUser?.username || null,
      importedByUser?.fullName || null,
      importedByUser?.email || null,
    ]);
    const importId = start.rows[0].id;

    await client.query(SQL.createStageTable);

    const batchSize = 500;
    for (let offset = 0; offset < table.rows.length; offset += batchSize) {
      const batch = table.rows.slice(offset, offset + batchSize);
      const values = [];
      const tuples = batch.map((row) => {
        const placeholders = row.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await client.query(
        SQL.insertStageBatch.replace(
          "__FIELD_LIBRARY_VALUES__",
          tuples.join(", "),
        ),
        values,
      );
    }

    const staged = await client.query(SQL.countStagedRows);
    if (staged.rows[0].count !== table.rows.length) {
      throw new Error("Staging row-count verification failed.");
    }

    await client.query(SQL.truncateFieldLibrary);
    await client.query(SQL.copyStageToFieldLibrary);
    await client.query(SQL.completeImportRecord, [importId]);

    return {
      status: "replaced",
      table: FIELD_LIBRARY_TABLE,
      rowsImported: table.rows.length,
      columnsImported: FIELD_LIBRARY_COLUMNS.length,
      sha256: table.sha256,
      importId,
    };
  });
}
