/**
 * 17-source-database.js
 * Database-backed source-library API integration and administrator CSV replacement.
 */
const atlasSourceDatabaseState = {
  currentUser: null,
  canReplace: false,
  accessStatus: "loading",
  uploading: false,
};

async function atlasApiJson(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(
      payload?.error || `Request failed with status ${response.status}.`,
    );
    error.status = response.status;
    error.details = payload?.details || null;
    throw error;
  }
  return payload;
}

async function atlasFetchSourceLibrary() {
  return atlasApiJson("/api/source-library");
}

function atlasSourceImportStatusShouldShow() {
  if (atlasSourceDatabaseState.uploading) return true;
  if (atlasSourceDatabaseState.canReplace) return true;
  return (
    atlasSourceDatabaseState.accessStatus === "role_resolution_unavailable" ||
    atlasSourceDatabaseState.accessStatus === "role_payload_malformed" ||
    atlasSourceDatabaseState.accessStatus === "access_check_failed"
  );
}

function atlasSyncSourceImportStatus(statusHost) {
  if (!statusHost) return;
  statusHost.hidden = !atlasSourceImportStatusShouldShow();
}

async function atlasLoadSourceLibraryAccess() {
  const button = $("replaceSourceLibraryBtn");
  const statusHost = $("sourceLibraryImportStatus");
  atlasSourceDatabaseState.canReplace = false;
  atlasSourceDatabaseState.accessStatus = "loading";
  if (button) button.hidden = true;
  if (statusHost) statusHost.hidden = true;
  try {
    const access = await atlasApiJson("/api/source-library/access");
    atlasSourceDatabaseState.currentUser = access.user || null;
    atlasSourceDatabaseState.canReplace = access.canReplace === true;
    atlasSourceDatabaseState.accessStatus =
      access.accessStatus ||
      (atlasSourceDatabaseState.canReplace
        ? "required_role_present"
        : "required_role_absent");
    if (button) button.hidden = !atlasSourceDatabaseState.canReplace;
    if (statusHost) {
      const messages = {
        required_role_present: "CSV import replaces the whole library.",
        role_resolution_unavailable:
          "Import access could not be verified. Try again, or review the server authorization diagnostics.",
        role_payload_malformed:
          "Import access could not be verified because the StudioShare role response was not recognized.",
        required_role_absent:
          "Source-library import requires the StudioShare atlas-align-admin role.",
      };
      statusHost.textContent =
        messages[atlasSourceDatabaseState.accessStatus] ||
        "Source-library import is not available for this account.";
      statusHost.classList.remove("is-error", "is-uploading", "is-success");
      statusHost.classList.toggle(
        "is-enabled",
        atlasSourceDatabaseState.canReplace,
      );
      atlasSyncSourceImportStatus(statusHost);
    }
    return access;
  } catch (error) {
    atlasSourceDatabaseState.accessStatus = "access_check_failed";
    if (statusHost) {
      statusHost.textContent =
        "Import access could not be verified. Refresh the page or review the server logs.";
      statusHost.classList.add("is-error");
      atlasSyncSourceImportStatus(statusHost);
    }
    throw error;
  }
}

function atlasFormatCsvError(error) {
  if (!error?.details)
    return error?.message || "The source library could not be replaced.";
  const detail = Object.entries(error.details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  return detail ? `${error.message} ${detail}` : error.message;
}

async function atlasReplaceSourceLibraryCsv(file) {
  if (!atlasSourceDatabaseState.canReplace) {
    const message =
      atlasSourceDatabaseState.accessStatus === "access_check_failed" ||
      atlasSourceDatabaseState.accessStatus === "role_resolution_unavailable" ||
      atlasSourceDatabaseState.accessStatus === "role_payload_malformed"
        ? "Source-library import access could not be verified."
        : "You do not have permission to replace the source library.";
    throw new Error(message);
  }
  if (!file) return;
  if (
    !confirm(
      `Replace the entire ATLAS Field Library with ${file.name}? This action cannot be undone.`,
    )
  )
    return;
  const body = new FormData();
  body.append("file", file);
  atlasSourceDatabaseState.uploading = true;
  const button = $("replaceSourceLibraryBtn");
  const statusHost = $("sourceLibraryImportStatus");
  if (statusHost) {
    statusHost.classList.remove("is-error", "is-success");
    statusHost.textContent = `Validating and importing ${file.name}...`;
    statusHost.classList.add("is-uploading");
    atlasSyncSourceImportStatus(statusHost);
  }
  if (button) {
    button.disabled = true;
    button.textContent = "Replacing...";
  }
  try {
    const result = await atlasApiJson("/api/admin/field-library/replace", {
      method: "POST",
      body,
    });
    await loadSourceFileLibrary?.({});
    repoLibraryState.sourceFileCache?.clear();
    atlasInvalidateSourceDerivedState?.();
    refreshFieldPickerOptions?.();
    renderSourceFieldBrowser?.();
    renderFieldPickerPanel?.();
    renderValidationPanel?.();
    updateDashboardMetrics?.();
    const message = `Source library replaced: ${result.rowsImported} row(s) imported across ${result.columnsImported} columns.`;
    if (statusHost) {
      statusHost.textContent = message;
      statusHost.classList.add("is-success");
      atlasSyncSourceImportStatus(statusHost);
    }
    status(message, "ok");
  } catch (error) {
    if (statusHost) {
      statusHost.textContent = atlasFormatCsvError(error);
      statusHost.classList.add("is-error");
      atlasSyncSourceImportStatus(statusHost);
    }
    throw error;
  } finally {
    atlasSourceDatabaseState.uploading = false;
    statusHost?.classList.remove("is-uploading");
    if (button) {
      button.disabled = false;
      button.textContent = "Replace Source Library CSV";
    }
  }
}

const CUSTOM_FIELD_FORMATS = [
  "Text",
  "Number",
  "Decimal",
  "Date",
  "Date/Time",
  "Boolean",
  "Currency",
];

const CUSTOM_FIELD_FORMAT_DETAILS = {
  Text: { description: "Letters and symbols", icon: "format-text" },
  Number: { description: "Whole numbers", icon: "format-number" },
  Decimal: { description: "Numbers with decimals", icon: "format-decimal" },
  Date: { description: "Calendar date", icon: "format-date" },
  "Date/Time": { description: "Date and time", icon: "format-datetime" },
  Boolean: { description: "Yes / No", icon: "format-boolean" },
  Currency: { description: "Money amounts", icon: "format-currency" },
};

// Mirrors MAX_FIELDS in src/custom-source.js.
const CUSTOM_SOURCE_MAX_FIELDS = 200;
const CUSTOM_SOURCE_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
const customSourceState = { undo: null, sheets: [], rowSequence: 0 };

function atlasCustomSourceFormatOptions() {
  return CUSTOM_FIELD_FORMATS.map((format) => ({
    value: format,
    label: format,
    ...CUSTOM_FIELD_FORMAT_DETAILS[format],
  }));
}

function atlasPluralFields(count) {
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

/** Title-case button label, e.g. "Add 3 Fields". */
function atlasAddFieldsLabel(count) {
  return `Add ${count} ${count === 1 ? "Field" : "Fields"}`;
}

/** Display-name text: control characters become spaces, then trim and cap. */
function atlasCleanCustomFieldName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();
}

function atlasUniqueCustomFieldNames(values) {
  const seen = new Set();
  let empty = 0;
  let duplicate = 0;
  const names = [];
  for (const value of values) {
    const name = atlasCleanCustomFieldName(value);
    if (!name) empty += 1;
    else if (seen.has(name)) duplicate += 1;
    else {
      seen.add(name);
      names.push(name);
    }
  }
  return { names, empty, duplicate };
}

function atlasCustomSourceFieldRow({ display = "" } = {}) {
  const row = document.createElement("fieldset");
  const descriptionId = `customSourceDescription${++customSourceState.rowSequence}`;
  row.className = "custom-source-field";
  row.dataset.customField = "true";
  row.innerHTML = `<legend class="visually-hidden"></legend>
    <span aria-hidden="true" class="custom-source-field-index"></span>
    <label class="custom-source-cell"><span class="custom-source-cell-label">Display name</span>
      <input autocomplete="off" class="input full-input" data-field-display maxlength="200" required type="text">
    </label>
    <label class="custom-source-cell"><span class="custom-source-cell-label">Source field name</span>
      <input autocomplete="off" class="input full-input" data-field-name maxlength="200" placeholder="Same as display name" type="text">
    </label>
    <div class="custom-source-cell custom-source-format">${atlasChoiceControl({
      options: atlasCustomSourceFormatOptions(),
      selected: "Text",
      label: "Field format",
      heading: "Format",
      popover: "grid",
      attributes: 'data-field-format="" required',
    })}</div>
    <div class="custom-source-row-actions">
      <button aria-controls="${descriptionId}" aria-expanded="false" class="btn ghost custom-source-description-toggle" data-toggle-custom-description type="button">Description</button>
      <button class="btn ghost custom-source-remove" data-remove-custom-field type="button">${window.atlasIcon?.("close") || "×"}</button>
    </div>
    <label class="custom-source-description" for="${descriptionId}Input" hidden id="${descriptionId}"><span class="custom-source-cell-label">Description <span class="hint">Optional</span></span>
      <textarea class="input full-input" data-field-description id="${descriptionId}Input" maxlength="2000" rows="2"></textarea>
    </label>`;
  row.querySelector("[data-field-display]").value = display;
  return row;
}

function atlasCustomSourceRows(host = $("customSourceFields")) {
  return host ? [...host.querySelectorAll("[data-custom-field]")] : [];
}

function atlasCustomSourceRowIsBlank(row) {
  return [
    "[data-field-display]",
    "[data-field-name]",
    "[data-field-description]",
  ].every((selector) => !row.querySelector(selector)?.value.trim());
}

function atlasRenumberCustomSourceFields(host) {
  const rows = atlasCustomSourceRows(host);
  rows.forEach((row, index) => {
    const name = `Field ${index + 1}`;
    const legend = row.querySelector("legend");
    if (legend) legend.textContent = name;
    const number = row.querySelector(".custom-source-field-index");
    if (number) number.textContent = String(index + 1);
    const remove = row.querySelector("[data-remove-custom-field]");
    if (remove) {
      remove.disabled = rows.length === 1;
      remove.setAttribute("aria-label", `Remove ${name}`);
    }
  });
  const count = $("customSourceFieldCount");
  if (count) count.textContent = atlasPluralFields(rows.length);
  const addButton = $("addCustomSourceFieldBtn");
  if (addButton) addButton.disabled = rows.length >= CUSTOM_SOURCE_MAX_FIELDS;
}

function atlasShowCustomSourceNotice(message, undo = null) {
  const notice = $("customSourceNotice");
  customSourceState.undo = undo;
  if (!notice) return;
  notice.replaceChildren();
  if (!message) return;
  const text = document.createElement("span");
  text.textContent = message;
  notice.append(text);
  if (undo) {
    const button = document.createElement("button");
    button.className = "btn ghost";
    button.dataset.customSourceUndo = "true";
    button.type = "button";
    button.textContent = "Undo";
    notice.append(button);
  }
}

/**
 * Fills blank rows first, then appends rows up to the server's field limit.
 * @param {string[]} names cleaned display names
 */
function atlasAppendCustomSourceFields(names) {
  const host = $("customSourceFields");
  if (!host || !names.length) return null;
  const rows = atlasCustomSourceRows(host);
  const blanks = rows.filter(atlasCustomSourceRowIsBlank);
  const capacity =
    blanks.length + Math.max(0, CUSTOM_SOURCE_MAX_FIELDS - rows.length);
  const accepted = names.slice(0, capacity);
  const skipped = names.length - accepted.length;
  const filled = [];
  const added = [];
  for (const name of accepted) {
    const blank = blanks.shift();
    if (blank) {
      blank.querySelector("[data-field-display]").value = name;
      filled.push(blank);
    } else {
      const row = atlasCustomSourceFieldRow({ display: name });
      host.append(row);
      added.push(row);
    }
  }
  atlasRenumberCustomSourceFields(host);
  let message = accepted.length
    ? `Added ${atlasPluralFields(accepted.length)}.`
    : "No fields were added.";
  if (skipped) {
    message += ` ${skipped} ${skipped === 1 ? "name was" : "names were"} skipped because a source can have at most ${CUSTOM_SOURCE_MAX_FIELDS} fields.`;
  }
  atlasShowCustomSourceNotice(
    message,
    accepted.length
      ? () => {
          filled.forEach((row) => {
            const input = row.querySelector("[data-field-display]");
            if (input) input.value = "";
          });
          added.forEach((row) => row.remove());
          atlasRenumberCustomSourceFields(host);
          atlasShowCustomSourceNotice(
            `Removed the ${atlasPluralFields(accepted.length)} just added.`,
          );
          (
            filled[0]?.querySelector("[data-field-display]") ||
            $("addCustomSourceFieldBtn")
          )?.focus();
        }
      : null,
  );
  (filled[0] || added[0])?.querySelector("[data-field-display]")?.focus();
  return { added: accepted.length, skipped };
}

function atlasRemoveCustomSourceField(row) {
  const host = $("customSourceFields");
  const rows = atlasCustomSourceRows(host);
  const index = rows.indexOf(row);
  if (!host || index < 0 || rows.length === 1) return;
  const name = `Field ${index + 1}`;
  const next = rows[index + 1] || rows[index - 1];
  row.remove();
  atlasRenumberCustomSourceFields(host);
  atlasShowCustomSourceNotice(`Removed ${name}.`, () => {
    const current = atlasCustomSourceRows(host);
    if (current.length >= CUSTOM_SOURCE_MAX_FIELDS) {
      atlasShowCustomSourceNotice(
        `${name} could not be restored because the source already has ${CUSTOM_SOURCE_MAX_FIELDS} fields.`,
      );
      return;
    }
    host.insertBefore(row, current[index] || null);
    atlasRenumberCustomSourceFields(host);
    atlasShowCustomSourceNotice(`Restored ${name}.`);
    row.querySelector("[data-field-display]")?.focus();
  });
  (
    next?.querySelector("[data-remove-custom-field]:not(:disabled)") ||
    next?.querySelector("[data-field-display]")
  )?.focus();
}

function atlasToggleCustomSourcePanel(panelId, open) {
  const panels = {
    customSourceBulkPanel: "customSourceBulkToggle",
    customSourceImportPanel: "customSourceImportToggle",
  };
  for (const [id, toggleId] of Object.entries(panels)) {
    const panel = $(id);
    const toggle = $(toggleId);
    const show = id === panelId && open;
    if (panel) panel.hidden = !show;
    toggle?.setAttribute("aria-expanded", show ? "true" : "false");
  }
  if (!open) {
    $(panels[panelId])?.focus();
    return;
  }
  if (panelId === "customSourceBulkPanel") $("customSourceBulkNames")?.focus();
  else $("customSourceImportChooseBtn")?.focus();
}

function atlasCustomSourceBulkNames() {
  const text = $("customSourceBulkNames")?.value || "";
  return atlasUniqueCustomFieldNames(text.split(/\r?\n|\t/)).names;
}

function atlasSyncCustomSourceBulkButton() {
  const button = $("customSourceBulkAddBtn");
  if (!button) return;
  const count = atlasCustomSourceBulkNames().length;
  button.disabled = count === 0;
  button.textContent = count ? atlasAddFieldsLabel(count) : "Add Fields";
}

function atlasAddCustomSourceBulkFields() {
  const names = atlasCustomSourceBulkNames();
  if (!names.length) return;
  const textarea = $("customSourceBulkNames");
  if (textarea) textarea.value = "";
  atlasSyncCustomSourceBulkButton();
  $("customSourceBulkPanel").hidden = true;
  $("customSourceBulkToggle")?.setAttribute("aria-expanded", "false");
  atlasAppendCustomSourceFields(names);
}

/** Quote-aware CSV reader for one small file. */
function atlasParseCsvRows(text) {
  const source = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character !== '"') field += character;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Turns an ExcelJS cell value (rich text, formula, date, link) into text. */
function atlasCustomSourceCellText(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || "").join("");
    }
    if ("result" in value) return atlasCustomSourceCellText(value.result);
    if ("text" in value) return atlasCustomSourceCellText(value.text);
    return "";
  }
  return String(value);
}

async function atlasReadCustomSourceImportFile(file) {
  const extension = String(file.name || "")
    .toLowerCase()
    .split(".")
    .pop();
  if (!["xlsx", "xlsm", "csv"].includes(extension)) {
    throw new Error(
      "This file type cannot be imported. Choose an .xlsx, .xlsm, or .csv file.",
    );
  }
  if (file.size > CUSTOM_SOURCE_IMPORT_MAX_BYTES) {
    throw new Error(
      "This file is larger than 10 MB. Choose a smaller file, or copy the row into Add Several.",
    );
  }
  if (extension === "csv") {
    const rows = atlasParseCsvRows(await file.text());
    return [
      { name: file.name, rowCount: rows.length, row: (n) => rows[n - 1] || [] },
    ];
  }
  let ExcelJS;
  try {
    ExcelJS = await atlasEnsureExcelJs();
  } catch {
    throw new Error(
      "The Excel reader could not load. Check your connection, then choose the file again.",
    );
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error(
      "This file could not be read. It may be damaged or password protected. Save it as .xlsx or .csv and try again.",
    );
  }
  return workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    rowCount: sheet.rowCount,
    row: (n) => {
      const row = sheet.getRow(n);
      const values = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        values.push(atlasCustomSourceCellText(row.getCell(column).value));
      }
      return values;
    },
  }));
}

function atlasCustomSourceImportSelection() {
  const sheet =
    customSourceState.sheets[Number($("customSourceImportSheet")?.value) || 0];
  const rowNumber = Number($("customSourceImportRow")?.value);
  if (!sheet) return null;
  if (
    !Number.isInteger(rowNumber) ||
    rowNumber < 1 ||
    rowNumber > sheet.rowCount
  ) {
    return {
      sheet,
      rowNumber,
      error: `Enter a row number from 1 to ${sheet.rowCount}.`,
    };
  }
  return {
    sheet,
    rowNumber,
    ...atlasUniqueCustomFieldNames(sheet.row(rowNumber)),
  };
}

function atlasRenderCustomSourceImportPreview() {
  const preview = $("customSourceImportPreview");
  const addButton = $("customSourceImportAddBtn");
  const error = $("customSourceImportError");
  if (!preview || !addButton) return;
  preview.replaceChildren();
  addButton.disabled = true;
  addButton.textContent = "Add Fields";
  const selection = atlasCustomSourceImportSelection();
  if (!selection) return;
  if (selection.error) {
    if (error) error.textContent = selection.error;
    return;
  }
  if (error) error.textContent = "";
  const note = document.createElement("p");
  note.className = "custom-source-import-note";
  if (!selection.names.length) {
    note.textContent = `Row ${selection.rowNumber} has no values. Choose another row.`;
    preview.append(note);
    return;
  }
  const skipped = [];
  if (selection.empty)
    skipped.push(
      `${selection.empty} empty ${selection.empty === 1 ? "cell" : "cells"}`,
    );
  if (selection.duplicate)
    skipped.push(
      `${selection.duplicate} ${selection.duplicate === 1 ? "duplicate" : "duplicates"}`,
    );
  note.textContent = `${atlasPluralFields(selection.names.length)} will be added${
    skipped.length ? `, ${skipped.join(" and ")} skipped` : ""
  }.`;
  const list = document.createElement("ul");
  list.className = "custom-source-chips";
  list.setAttribute("aria-label", `Field names in row ${selection.rowNumber}`);
  for (const name of selection.names) {
    const item = document.createElement("li");
    item.textContent = name;
    list.append(item);
  }
  preview.append(note, list);
  addButton.disabled = false;
  addButton.textContent = atlasAddFieldsLabel(selection.names.length);
}

function atlasResetCustomSourceImport() {
  customSourceState.sheets = [];
  const sheetSelect = $("customSourceImportSheet");
  const rowInput = $("customSourceImportRow");
  if (sheetSelect) {
    sheetSelect.replaceChildren();
    sheetSelect.disabled = true;
  }
  if (rowInput) {
    rowInput.value = "1";
    rowInput.disabled = true;
    rowInput.removeAttribute("max");
  }
  const fileName = $("customSourceImportFileName");
  if (fileName) fileName.textContent = ".xlsx, .xlsm, or .csv, up to 10 MB";
  const error = $("customSourceImportError");
  if (error) error.textContent = "";
  $("customSourceImportPreview")?.replaceChildren();
  const addButton = $("customSourceImportAddBtn");
  if (addButton) {
    addButton.disabled = true;
    addButton.textContent = "Add Fields";
  }
}

function atlasSyncCustomSourceImportRowLimit() {
  const sheet =
    customSourceState.sheets[Number($("customSourceImportSheet")?.value) || 0];
  const rowInput = $("customSourceImportRow");
  if (!sheet || !rowInput) return;
  rowInput.max = String(Math.max(1, sheet.rowCount));
  rowInput.disabled = sheet.rowCount < 1;
}

async function atlasLoadCustomSourceImportFile(file) {
  const panel = $("customSourceImportPanel");
  atlasResetCustomSourceImport();
  const fileName = $("customSourceImportFileName");
  if (fileName) fileName.textContent = file.name;
  const error = $("customSourceImportError");
  const preview = $("customSourceImportPreview");
  panel?.setAttribute("aria-busy", "true");
  if (preview) preview.textContent = "Reading file…";
  try {
    const sheets = (await atlasReadCustomSourceImportFile(file)).filter(
      (sheet) => sheet.rowCount > 0,
    );
    if (preview) preview.textContent = "";
    if (!sheets.length) {
      throw new Error(
        "This file has no rows to import. Choose a file with field names in it.",
      );
    }
    customSourceState.sheets = sheets;
    const sheetSelect = $("customSourceImportSheet");
    if (sheetSelect) {
      sheets.forEach((sheet, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = sheet.name;
        sheetSelect.append(option);
      });
      sheetSelect.disabled = sheets.length === 1;
    }
    atlasSyncCustomSourceImportRowLimit();
    atlasRenderCustomSourceImportPreview();
  } catch (problem) {
    if (preview) preview.textContent = "";
    if (error)
      error.textContent = problem?.message || "This file could not be read.";
  } finally {
    panel?.removeAttribute("aria-busy");
  }
}

function atlasAddCustomSourceImportFields() {
  const selection = atlasCustomSourceImportSelection();
  if (!selection?.names?.length) return;
  $("customSourceImportPanel").hidden = true;
  $("customSourceImportToggle")?.setAttribute("aria-expanded", "false");
  atlasAppendCustomSourceFields(selection.names);
}

function atlasResetCustomSourceForm() {
  const form = $("customSourceForm");
  const host = $("customSourceFields");
  const error = $("customSourceError");
  form?.reset();
  if (error) error.textContent = "";
  atlasShowCustomSourceNotice("");
  atlasResetCustomSourceImport();
  atlasSyncCustomSourceBulkButton();
  ["customSourceBulkPanel", "customSourceImportPanel"].forEach((id) => {
    const panel = $(id);
    if (panel) panel.hidden = true;
  });
  ["customSourceBulkToggle", "customSourceImportToggle"].forEach((id) =>
    $(id)?.setAttribute("aria-expanded", "false"),
  );
  if (!host) return;
  host.replaceChildren(atlasCustomSourceFieldRow());
  atlasRenumberCustomSourceFields(host);
}

function atlasShowCustomSourceError(message) {
  const error = $("customSourceError");
  if (error) error.textContent = message;
}

function atlasReadCustomSourceFields() {
  return atlasCustomSourceRows().map((row) => ({
    legend: row.querySelector("legend")?.textContent || "Field",
    display: row.querySelector("[data-field-display]"),
    format: row.querySelector("[data-field-format]"),
    vanityLabel: row.querySelector("[data-field-display]")?.value.trim() || "",
    fieldName: row.querySelector("[data-field-name]")?.value.trim() || "",
    fieldFormat: row.querySelector("[data-field-format]")?.value || "",
    businessDescription:
      row.querySelector("[data-field-description]")?.value.trim() || "",
  }));
}

async function atlasSaveCustomSource(event) {
  event.preventDefault();
  const saveButton = $("customSourceSaveBtn");
  const sourceName = $("customSourceName")?.value.trim() || "";
  const sourceSystem = $("customSourceSystem")?.value.trim() || "";
  if (!sourceName) {
    atlasShowCustomSourceError("Enter a source name.");
    $("customSourceName")?.focus();
    return;
  }
  const rows = atlasReadCustomSourceFields();
  if (!rows.length) {
    atlasShowCustomSourceError("Add at least one field.");
    return;
  }
  for (const row of rows) {
    if (!row.vanityLabel) {
      atlasShowCustomSourceError(`Enter a display name for ${row.legend}.`);
      row.display?.focus();
      return;
    }
    if (!CUSTOM_FIELD_FORMATS.includes(row.fieldFormat)) {
      atlasShowCustomSourceError(`Select a format for ${row.legend}.`);
      row.format
        ?.closest(".atlas-choice-popover-field")
        ?.querySelector("[data-choice-popover-trigger]")
        ?.focus();
      return;
    }
  }
  if (saveButton) saveButton.disabled = true;
  $("customSourceForm")?.setAttribute("aria-busy", "true");
  atlasShowCustomSourceError("");
  try {
    await atlasApiJson("/api/source-library/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceName,
        sourceSystem,
        fields: rows.map(
          ({ vanityLabel, fieldName, fieldFormat, businessDescription }) => ({
            vanityLabel,
            fieldName,
            fieldFormat,
            businessDescription,
          }),
        ),
      }),
    });
    $("customSourceDialog")?.close();
    await loadSourceFileLibrary?.({});
    repoLibraryState.sourceFileCache?.clear();
    atlasInvalidateSourceDerivedState?.();
    refreshFieldPickerOptions?.();
    renderSourceFieldBrowser?.();
    renderFieldPickerPanel?.();
    renderValidationPanel?.();
    updateDashboardMetrics?.();
    status(`Added custom source ${sourceName}.`, "ok");
  } catch (error) {
    atlasShowCustomSourceError(
      error?.message ||
        "The custom source could not be saved. Check the source name and fields, then try again.",
    );
  } finally {
    if (saveButton) saveButton.disabled = false;
    $("customSourceForm")?.removeAttribute("aria-busy");
  }
}

function atlasOpenCustomSourceDialog() {
  const dialog = $("customSourceDialog");
  if (!dialog) return;
  if (dialog.parentElement !== document.body) document.body.append(dialog);
  atlasResetCustomSourceForm();
  window.atlasMountIcons?.(dialog);
  if (!dialog.open) dialog.showModal();
  $("customSourceName")?.focus();
}

function atlasBindCustomSourceDialog() {
  const openButton = $("addCustomSourceBtn");
  const dialog = $("customSourceDialog");
  const form = $("customSourceForm");
  const fields = $("customSourceFields");
  if (!openButton || !dialog || !form || !fields || dialog.dataset.atlasBound)
    return;
  dialog.dataset.atlasBound = "true";
  openButton.addEventListener("click", atlasOpenCustomSourceDialog);
  $("customSourceCancelBtn")?.addEventListener("click", () => dialog.close());
  $("addCustomSourceFieldBtn")?.addEventListener("click", () => {
    if (atlasCustomSourceRows(fields).length >= CUSTOM_SOURCE_MAX_FIELDS)
      return;
    const row = atlasCustomSourceFieldRow();
    fields.append(row);
    atlasRenumberCustomSourceFields(fields);
    row.querySelector("[data-field-display]")?.focus();
  });
  $("customSourceBulkToggle")?.addEventListener("click", () =>
    atlasToggleCustomSourcePanel(
      "customSourceBulkPanel",
      $("customSourceBulkPanel")?.hidden,
    ),
  );
  $("customSourceImportToggle")?.addEventListener("click", () =>
    atlasToggleCustomSourcePanel(
      "customSourceImportPanel",
      $("customSourceImportPanel")?.hidden,
    ),
  );
  $("customSourceBulkNames")?.addEventListener(
    "input",
    atlasSyncCustomSourceBulkButton,
  );
  $("customSourceBulkAddBtn")?.addEventListener(
    "click",
    atlasAddCustomSourceBulkFields,
  );
  $("customSourceImportChooseBtn")?.addEventListener("click", () =>
    $("customSourceImportFile")?.click(),
  );
  $("customSourceImportFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await atlasLoadCustomSourceImportFile(file);
  });
  $("customSourceImportSheet")?.addEventListener("change", () => {
    const rowInput = $("customSourceImportRow");
    if (rowInput) rowInput.value = "1";
    atlasSyncCustomSourceImportRowLimit();
    atlasRenderCustomSourceImportPreview();
  });
  $("customSourceImportRow")?.addEventListener(
    "input",
    atlasRenderCustomSourceImportPreview,
  );
  $("customSourceImportAddBtn")?.addEventListener(
    "click",
    atlasAddCustomSourceImportFields,
  );
  form.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-custom-panel]");
    if (close)
      atlasToggleCustomSourcePanel(close.dataset.closeCustomPanel, false);
    if (event.target.closest("[data-custom-source-undo]")) {
      const undo = customSourceState.undo;
      customSourceState.undo = null;
      undo?.();
    }
  });
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panel = event.target.closest(".custom-source-panel");
    if (!panel) return;
    event.preventDefault();
    atlasToggleCustomSourcePanel(panel.id, false);
  });
  fields.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-custom-description]");
    if (toggle) {
      const panel = $(toggle.getAttribute("aria-controls"));
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) panel.querySelector("textarea")?.focus();
      return;
    }
    const remove = event.target.closest("[data-remove-custom-field]");
    if (!remove || remove.disabled) return;
    atlasRemoveCustomSourceField(remove.closest("[data-custom-field]"));
  });
  form.addEventListener("submit", atlasSaveCustomSource);
}

async function atlasInitSourceDatabase() {
  atlasBindCustomSourceDialog();
  await atlasLoadSourceLibraryAccess();
  const button = $("replaceSourceLibraryBtn");
  const fileInput = $("replaceSourceLibraryFile");
  if (button && !button.dataset.atlasBound) {
    button.dataset.atlasBound = "true";
    button.addEventListener("click", () => fileInput?.click());
  }
  if (fileInput && !fileInput.dataset.atlasBound) {
    fileInput.dataset.atlasBound = "true";
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      try {
        if (file) await atlasReplaceSourceLibraryCsv(file);
      } catch (error) {
        status(atlasFormatCsvError(error), "bad");
      } finally {
        event.target.value = "";
      }
    });
  }
  atlasRenderFieldLibraryLightboard();
}

function atlasRenderFieldLibraryLightboard() {
  const root = $("fieldLibraryLightboard");
  if (!root) return;
  const provenance = repoLibraryState?.fieldLibraryProvenance;
  const active = provenance?.state || "";
  root.dataset.state = active || "checking";
  root.querySelectorAll("[data-lamp]").forEach((lamp) => {
    lamp.classList.toggle("is-lit", lamp.dataset.lamp === active);
  });
  const text = $("fieldLibraryLightboardText");
  if (text) {
    text.textContent = provenance?.detail || "Checking field library source";
  }
}
