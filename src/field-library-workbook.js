import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { FIELD_LIBRARY_COLUMNS } from "./00-global-variables.js";
import {
  CsvValidationError,
  validateFieldLibraryTable,
} from "./field-library.js";

function plainCell(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || "").join("");
    }
    if (Object.prototype.hasOwnProperty.call(value, "result")) {
      return plainCell(value.result);
    }
    if (typeof value.text === "string") return value.text;
  }
  return String(value);
}

function rowValues(row, width) {
  const values = [];
  let used = 0;
  for (let column = 1; column <= width; column += 1) {
    const text = plainCell(row.getCell(column).value);
    if (text !== "") used = column;
    values.push(text);
  }
  return { values, used };
}

function headersMatch(headers) {
  return (
    headers.length === FIELD_LIBRARY_COLUMNS.length &&
    headers.every((header, index) => header === FIELD_LIBRARY_COLUMNS[index])
  );
}

function selectWorksheet(workbook, sheetName) {
  if (sheetName) return workbook.getWorksheet(sheetName) || null;
  return (
    workbook.worksheets.find((worksheet) => {
      const header = rowValues(worksheet.getRow(1), FIELD_LIBRARY_COLUMNS.length);
      return headersMatch(header.values);
    }) || null
  );
}

export async function parseFieldLibraryWorkbook(buffer, { sheetName = "" } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    throw new CsvValidationError("The workbook could not be read.");
  }

  const worksheet = selectWorksheet(workbook, sheetName);
  if (!worksheet) {
    throw new CsvValidationError(
      sheetName
        ? "The workbook does not contain the configured field-library sheet."
        : "The workbook does not contain a field-library sheet.",
    );
  }

  const width = FIELD_LIBRARY_COLUMNS.length;
  const header = rowValues(worksheet.getRow(1), width + 1);
  if (header.used > width) {
    throw new CsvValidationError(
      "Workbook column count does not match ATLAS Field Library.",
      { expected: width, received: header.used },
    );
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = rowValues(worksheet.getRow(rowNumber), width + 1);
    if (row.used > width) {
      throw new CsvValidationError("Workbook row has an unexpected column count.", {
        row: rowNumber,
        expected: width,
        received: row.used,
      });
    }
    if (row.values.every((value) => value === "")) continue;
    rows.push(row.values.slice(0, width));
  }

  const validated = validateFieldLibraryTable(
    header.values.slice(0, width),
    rows,
    "workbook",
  );
  return {
    ...validated,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
