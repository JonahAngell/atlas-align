/**
 * 29-export-dashboard.js
 *
 * Export page: a registry of export formats and the dashboard that shows one
 * card per visible format. Every export first saves the audit (or reloads the
 * locked version) so the file matches the stored audit.
 *
 * Add a format with ATLASExportFormats.register({...}); the fields are listed
 * on atlasRegisterExportFormat. Hidden formats stay registered but are not
 * offered on the Export page or in the My Audits export menu.
 */

// -----------------------------------------------------------------------------
// Format registry
// -----------------------------------------------------------------------------
const ATLAS_EXPORT_MIME_TYPES = Object.freeze({
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html",
  csv: "text/csv",
  md: "text/markdown",
});
const ATLAS_EXPORT_PREVIEW_LINES = 400;
const ATLAS_EXPORT_PREVIEW_ROWS = 12;
const ATLAS_EXPORT_PREVIEW_COLUMNS = 8;
const ATLAS_EXPORT_PREVIEW_CELL_CHARS = 160;
const ATLAS_EXPORT_PREVIEW_INDENT_REM = 1.5;
const ATLAS_EXPORT_FILE_NAME_MAX = 150;

const atlasExportFormats = [];
const atlasExportView = {
  // Increments whenever the Export page is invalidated, so cached builds and
  // sizes are recalculated from the current audit.
  generation: 0,
  auditId: "",
  fileNames: new Map(),
  built: new Map(),
  busy: new Set(),
  previewFormatId: null,
  previewSequence: 0,
};

/**
 * Registers an export format.
 * @param {object} format
 * @param {string} format.id - Stable identifier.
 * @param {string} format.label - Card title, such as "JSON".
 * @param {string} format.description - One sentence describing the file.
 * @param {string} format.extension - File extension without the dot.
 * @param {() => any} format.build - Returns, or resolves to, the file content
 *   or `{ content, workbook?, message?, kind? }`. Content is a string or bytes.
 * @param {() => string} format.fileName - Default file name without extension.
 * @param {string} [format.mimeType] - Defaults from the extension.
 * @param {string} [format.icon] - Icon name from 00-icons.js.
 * @param {string[]} [format.tags] - Short notes shown as badges on the card.
 * @param {string[]} [format.actions] - "download" and/or "copy".
 * @param {"text"|"html"|"workbook"|null} [format.preview] - Preview renderer.
 * @param {boolean} [format.hidden] - Registered but not offered.
 */
function atlasRegisterExportFormat(format) {
  const id = String(format?.id || "").trim();
  if (!id) throw new Error("An export format id is required.");
  if (atlasExportFormats.some((item) => item.id === id))
    throw new Error(`Export format ${id} is already registered.`);
  if (typeof format.build !== "function")
    throw new Error(`Export format ${id} needs a build function.`);
  const extension = String(format.extension || "").replace(/^\./, "");
  atlasExportFormats.push(
    Object.freeze({
      icon: "export",
      tags: [],
      actions: ["download"],
      preview: null,
      hidden: false,
      mimeType: ATLAS_EXPORT_MIME_TYPES[extension] || "application/octet-stream",
      ...format,
      id,
      extension,
    }),
  );
  atlasInvalidateExportPage();
}

function atlasExportFormat(id) {
  return atlasExportFormats.find((format) => format.id === id) || null;
}

function atlasVisibleExportFormats() {
  return atlasExportFormats.filter((format) => !format.hidden);
}

// -----------------------------------------------------------------------------
// File names and sizes
// -----------------------------------------------------------------------------
function atlasExportAuditBaseName() {
  return safeFileName(String(state.audit?.name || "").trim() || "audit");
}

/**
 * Removes characters that are not allowed in file names and a repeated
 * extension, leaving the name the user typed otherwise unchanged.
 */
function atlasSanitizeExportFileName(value, extension) {
  let name = String(value || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = `.${extension}`.toLowerCase();
  if (extension && name.toLowerCase().endsWith(suffix))
    name = name.slice(0, -suffix.length);
  return name
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, ATLAS_EXPORT_FILE_NAME_MAX);
}

function atlasExportDefaultFileName(format) {
  return (
    atlasSanitizeExportFileName(format.fileName?.(), format.extension) ||
    atlasExportAuditBaseName()
  );
}

function atlasExportFileNameValue(format) {
  return atlasExportView.fileNames.has(format.id)
    ? atlasExportView.fileNames.get(format.id)
    : atlasExportDefaultFileName(format);
}

function atlasExportFileName(format) {
  const name =
    atlasSanitizeExportFileName(atlasExportFileNameValue(format), format.extension) ||
    atlasExportDefaultFileName(format);
  return format.extension ? `${name}.${format.extension}` : name;
}

function atlasExportByteSize(content) {
  if (content == null) return 0;
  if (typeof content === "string") return new Blob([content]).size;
  if (typeof content.byteLength === "number") return content.byteLength;
  if (typeof content.size === "number") return content.size;
  return new Blob([content]).size;
}

function atlasFormatExportSize(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function atlasExportText(content) {
  return typeof content === "string"
    ? content
    : new TextDecoder().decode(content);
}

// -----------------------------------------------------------------------------
// Building
// -----------------------------------------------------------------------------
/** Marks cached builds stale and re-renders the page when it is visible. */
function atlasInvalidateExportPage() {
  atlasExportView.generation += 1;
  atlasInvalidatePages(["export"]);
  if (atlasActivePage() === "export") atlasRenderPage("export");
}

/**
 * Builds a format from the current audit, reusing the build for the current
 * page generation unless `force` is set.
 */
async function atlasBuildExport(format, { force = false } = {}) {
  const generation = atlasExportView.generation;
  const cached = atlasExportView.built.get(format.id);
  if (!force && cached?.generation === generation) {
    if (cached.error) throw cached.error;
    return cached.result;
  }
  let entry;
  try {
    const raw = await format.build();
    const result =
      raw && typeof raw === "object" && "content" in raw
        ? { ...raw }
        : { content: raw };
    result.size = atlasExportByteSize(result.content);
    entry = { generation, result };
    return result;
  } catch (error) {
    entry = { generation, error };
    throw error;
  } finally {
    if (generation === atlasExportView.generation) {
      atlasExportView.built.set(format.id, entry);
      atlasRenderExportSize(format.id);
    }
  }
}

/** Builds each visible format in turn so its card can show the file size. */
async function atlasRefreshExportSizes() {
  const generation = atlasExportView.generation;
  for (const format of atlasVisibleExportFormats()) {
    if (generation !== atlasExportView.generation) return;
    await atlasBuildExport(format).catch(() => null);
  }
}

/**
 * Saves pending changes before an export. A locked audit is never saved; if
 * another session locked a newer revision, that locked revision is reloaded.
 */
async function atlasPrepareExportSource() {
  if (!hasSelectedAudit?.())
    throw new Error("Select an audit before exporting.");
  const persistence = state.auditPersistence || {};
  const auditId =
    persistence.auditId === state.audit?.id && persistence.revisionId
      ? persistence.auditId
      : null;
  if (auditId && window.ATLASWorkflow?.feature?.("reads"))
    await window.ATLASWorkflow.refresh();
  if (auditId && window.ATLASWorkflow?.isPublishedLocked?.()) {
    const lockedRevisionId = window.ATLASWorkflow.summary?.currentRevisionId;
    if (Number(lockedRevisionId) !== Number(persistence.revisionId))
      await atlasLoadDatabaseAudit(auditId, { targetPage: "export" });
    return;
  }
  const canWrite = auditId
    ? persistence.access?.canEdit
    : state.currentUser?.access?.canCreate;
  // Read-only users cannot change the audit, so what they see is the stored version.
  if (!canWrite) return;
  if (!(await atlasSaveIfDirty("export")))
    throw new Error(
      "The audit could not be saved, so nothing was exported. Resolve the save problem, then export again.",
    );
}

/**
 * Saves the audit, builds the format, and downloads or copies it.
 * @param {string} formatId - Registered format id.
 * @param {"download"|"copy"} action - Requested action.
 */
async function atlasRunExport(formatId, action = "download") {
  const format = atlasExportFormat(formatId);
  if (!format || !format.actions.includes(action)) return false;
  if (atlasExportView.busy.has(format.id)) return false;
  atlasExportView.busy.add(format.id);
  atlasRenderExportBusy(format.id);
  try {
    await atlasPrepareExportSource();
    const result = await atlasBuildExport(format, { force: true });
    if (action === "copy") {
      if (!navigator.clipboard?.writeText)
        throw new Error(
          "This browser does not allow copying to the clipboard. Use Download instead.",
        );
      try {
        await navigator.clipboard.writeText(atlasExportText(result.content));
      } catch {
        throw new Error(
          "The browser blocked clipboard access. Try again, or use Download instead.",
        );
      }
      status(`${format.label} copied to the clipboard.`, "ok");
    } else {
      const fileName = atlasExportFileName(format);
      downloadBlob(fileName, result.content, format.mimeType);
      status(
        result.message || `${format.label} downloaded as ${fileName}.`,
        result.kind || "ok",
      );
    }
    return true;
  } catch (error) {
    status(`${format.label} export failed. ${error.message}`, "bad");
    return false;
  } finally {
    atlasExportView.busy.delete(format.id);
    atlasRenderExportBusy(format.id);
  }
}

// -----------------------------------------------------------------------------
// Dashboard rendering
// -----------------------------------------------------------------------------
function atlasExportActionLabel(format, action) {
  return action === "copy" ? "Copy to Clipboard" : "Download";
}

function atlasExportCardHtml(format) {
  const id = esc(format.id);
  const tags = format.tags.length
    ? `<ul class="export-card-tags" aria-label="${esc(format.label)} notes">${format.tags
        .map((tag) => `<li class="badge blue">${esc(tag)}</li>`)
        .join("")}</ul>`
    : "";
  const actions = format.actions
    .map(
      (action, index) =>
        `<button class="btn ${index === 0 ? "primary" : "secondary"} small" data-export-action="${esc(action)}" data-export-format-id="${id}" aria-label="${esc(`${atlasExportActionLabel(format, action)} ${format.label}`)}" type="button">${esc(atlasExportActionLabel(format, action))}</button>`,
    )
    .join("");
  const preview = format.preview
    ? `<button class="btn ghost small" data-export-action="preview" data-export-format-id="${id}" aria-controls="atlasExportPreview" aria-expanded="false" aria-label="${esc(`Preview ${format.label}`)}" type="button">Preview</button>`
    : "";
  return `<article class="card export-card" role="listitem" data-export-format="${id}" aria-labelledby="atlasExportTitle-${id}">
    <div class="export-card-head">
      <span class="export-card-icon" data-atlas-icon="${esc(format.icon)}"></span>
      <div class="export-card-heading">
        <h3 class="export-card-title" id="atlasExportTitle-${id}">${esc(format.label)}</h3>
        <p class="hint export-card-description">${esc(format.description)}</p>
      </div>
    </div>
    ${tags}
    <dl class="export-card-meta">
      <div><dt>Size</dt><dd data-export-size="${id}"></dd></div>
      <div><dt>File type</dt><dd>.${esc(format.extension)}</dd></div>
    </dl>
    <div class="export-filename">
      <label for="atlasExportFileName-${id}">File name</label>
      <div class="export-filename-field">
        <input class="input" id="atlasExportFileName-${id}" data-export-file-name="${id}" type="text" autocomplete="off" spellcheck="false" maxlength="${ATLAS_EXPORT_FILE_NAME_MAX}" aria-describedby="atlasExportExtension-${id}" />
        <span class="export-filename-extension" id="atlasExportExtension-${id}">.${esc(format.extension)}</span>
      </div>
    </div>
    <div class="export-card-actions">${actions}${preview}</div>
  </article>`;
}

function atlasRenderExportSize(formatId) {
  const host = document.querySelector(`[data-export-size="${CSS.escape(formatId)}"]`);
  if (!host) return;
  const entry = atlasExportView.built.get(formatId);
  const current = entry?.generation === atlasExportView.generation;
  host.classList.toggle("export-skeleton", !current);
  if (!current) {
    host.textContent = "Calculating…";
    host.setAttribute("aria-busy", "true");
    return;
  }
  host.removeAttribute("aria-busy");
  host.textContent = entry.error
    ? "Unavailable"
    : atlasFormatExportSize(entry.result.size);
  if (entry.error) host.title = entry.error.message;
  else host.removeAttribute("title");
}

function atlasRenderExportBusy(formatId) {
  const busy = atlasExportView.busy.has(formatId);
  document
    .querySelectorAll(
      `[data-export-format-id="${CSS.escape(formatId)}"]:not([data-export-action="preview"])`,
    )
    .forEach((button) => {
      button.disabled = busy;
      if (busy) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      button.textContent = busy
        ? "Preparing…"
        : atlasExportActionLabel(
            atlasExportFormat(formatId),
            button.dataset.exportAction,
          );
    });
}

/** Keeps file name edits for the audit they were typed for. */
function atlasSyncExportAudit() {
  const auditId = String(state.audit?.id || "");
  if (atlasExportView.auditId === auditId) return;
  atlasExportView.auditId = auditId;
  atlasExportView.fileNames.clear();
  atlasCloseExportPreview({ restoreFocus: false });
}

/** Renders the Export page from the registry and starts size calculation. */
function atlasRenderExportDashboard() {
  const grid = document.getElementById("atlasExportGrid");
  if (!grid) return;
  atlasSyncExportAudit();
  const formats = atlasVisibleExportFormats();
  const signature = formats.map((format) => format.id).join("|");
  if (grid.dataset.formats !== signature) {
    grid.innerHTML = formats.length
      ? formats.map(atlasExportCardHtml).join("")
      : '<p class="hint">No export formats are available. Formats appear here once they are registered.</p>';
    grid.dataset.formats = signature;
    window.atlasMountIcons?.(grid);
  }
  formats.forEach((format) => {
    const input = grid.querySelector(
      `[data-export-file-name="${CSS.escape(format.id)}"]`,
    );
    if (input && document.activeElement !== input)
      input.value = atlasExportFileNameValue(format);
    atlasRenderExportSize(format.id);
    atlasRenderExportBusy(format.id);
  });
  window.ATLASWorkflow?.renderLock?.();
  if (atlasExportView.previewFormatId)
    atlasShowExportPreview(atlasExportView.previewFormatId, { toggle: false });
  atlasRefreshExportSizes();
}

// -----------------------------------------------------------------------------
// Preview
// -----------------------------------------------------------------------------
function atlasExportPreviewTruncate(value) {
  const text = String(value ?? "");
  return text.length > ATLAS_EXPORT_PREVIEW_CELL_CHARS
    ? `${text.slice(0, ATLAS_EXPORT_PREVIEW_CELL_CHARS - 1)}…`
    : text;
}

function atlasRenderTextPreview(body, note, result) {
  const lines = atlasExportText(result.content).split("\n");
  const pre = document.createElement("pre");
  pre.className = "export-preview-text";
  pre.tabIndex = 0;
  pre.setAttribute("aria-label", "File contents");
  pre.textContent = lines.slice(0, ATLAS_EXPORT_PREVIEW_LINES).join("\n");
  body.replaceChildren(pre);
  note.textContent =
    lines.length > ATLAS_EXPORT_PREVIEW_LINES
      ? `Showing the first ${ATLAS_EXPORT_PREVIEW_LINES.toLocaleString()} of ${lines.length.toLocaleString()} lines.`
      : "";
}

function atlasRenderHtmlPreview(body, note, result, format) {
  const frame = document.createElement("iframe");
  frame.className = "export-preview-frame";
  // An empty sandbox runs no scripts and gives the page no access to the app.
  frame.setAttribute("sandbox", "");
  frame.title = `${format.label} export preview`;
  frame.srcdoc = atlasExportText(result.content);
  body.replaceChildren(frame);
  note.textContent = "Shown as it will appear when opened or pasted.";
}

function atlasRenderWorkbookPreview(body, note, result) {
  const sheets = result.workbook?.worksheets || [];
  if (!sheets.length) {
    body.innerHTML =
      '<p class="hint">This workbook has no sheets to preview.</p>';
    note.textContent = "";
    return;
  }
  let truncated = false;
  body.innerHTML = sheets
    .map((sheet) => {
      const rowCount = sheet.actualRowCount || sheet.rowCount || 0;
      const columnCount = Math.min(
        sheet.actualColumnCount || sheet.columnCount || 0,
        ATLAS_EXPORT_PREVIEW_COLUMNS,
      );
      if (
        rowCount > ATLAS_EXPORT_PREVIEW_ROWS ||
        (sheet.actualColumnCount || 0) > ATLAS_EXPORT_PREVIEW_COLUMNS
      )
        truncated = true;
      const rows = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= ATLAS_EXPORT_PREVIEW_ROWS) return;
        const cells = [];
        for (let column = 1; column <= columnCount; column += 1) {
          const cell = row.getCell(column);
          // Show Excel cell indents, such as nested Audit Logic steps.
          const indent = Number(cell.alignment?.indent) || 0;
          cells.push(
            `<td${indent ? ` style="padding-left: calc(0.5rem + ${indent * ATLAS_EXPORT_PREVIEW_INDENT_REM}rem)"` : ""}>${esc(atlasExportPreviewTruncate(cell.text))}</td>`,
          );
        }
        rows.push(`<tr>${cells.join("")}</tr>`);
      });
      return `<section class="export-preview-sheet"><h3>${esc(sheet.name)}</h3>${
        rows.length
          ? `<div class="tablewrap" tabindex="0" aria-label="${esc(sheet.name)} rows"><table class="export-preview-table"><tbody>${rows.join("")}</tbody></table></div>`
          : '<p class="hint">This sheet is empty.</p>'
      }</section>`;
    })
    .join("");
  note.textContent = truncated
    ? `Showing up to ${ATLAS_EXPORT_PREVIEW_ROWS} rows and ${ATLAS_EXPORT_PREVIEW_COLUMNS} columns of each sheet.`
    : "";
}

const ATLAS_EXPORT_PREVIEW_RENDERERS = Object.freeze({
  text: atlasRenderTextPreview,
  html: atlasRenderHtmlPreview,
  workbook: atlasRenderWorkbookPreview,
});

function atlasSetExportPreviewExpanded(formatId) {
  document
    .querySelectorAll('[data-export-action="preview"]')
    .forEach((button) =>
      button.setAttribute(
        "aria-expanded",
        String(button.dataset.exportFormatId === formatId),
      ),
    );
}

/**
 * Opens the preview panel for a format, or closes it when that format's
 * preview is already open and `toggle` is set.
 */
async function atlasShowExportPreview(formatId, { toggle = true } = {}) {
  const panel = document.getElementById("atlasExportPreview");
  const body = document.getElementById("atlasExportPreviewBody");
  const note = document.getElementById("atlasExportPreviewNote");
  const heading = document.getElementById("atlasExportPreviewHeading");
  const format = atlasExportFormat(formatId);
  if (!panel || !body || !note || !heading || !format?.preview) return;
  if (toggle && atlasExportView.previewFormatId === formatId && !panel.hidden)
    return atlasCloseExportPreview();
  const sequence = ++atlasExportView.previewSequence;
  const opening = panel.hidden || atlasExportView.previewFormatId !== formatId;
  atlasExportView.previewFormatId = formatId;
  atlasSetExportPreviewExpanded(formatId);
  heading.textContent = `${format.label} preview`;
  panel.hidden = false;
  panel.setAttribute("aria-busy", "true");
  note.textContent = "";
  body.innerHTML =
    '<div class="export-skeleton export-preview-skeleton" aria-hidden="true"></div><p class="hint">Building preview…</p>';
  if (opening && toggle) {
    panel.scrollIntoView({ block: "nearest" });
    heading.focus({ preventScroll: true });
  }
  try {
    const result = await atlasBuildExport(format);
    if (sequence !== atlasExportView.previewSequence) return;
    ATLAS_EXPORT_PREVIEW_RENDERERS[format.preview]?.(body, note, result, format);
  } catch (error) {
    if (sequence !== atlasExportView.previewSequence) return;
    body.innerHTML = `<p class="export-preview-error" role="alert">The preview could not be built. ${esc(error.message)}</p>`;
  } finally {
    if (sequence === atlasExportView.previewSequence)
      panel.removeAttribute("aria-busy");
  }
}

function atlasCloseExportPreview({ restoreFocus = true } = {}) {
  const panel = document.getElementById("atlasExportPreview");
  const formatId = atlasExportView.previewFormatId;
  atlasExportView.previewFormatId = null;
  atlasExportView.previewSequence += 1;
  atlasSetExportPreviewExpanded(null);
  if (!panel) return;
  panel.hidden = true;
  document.getElementById("atlasExportPreviewBody")?.replaceChildren();
  if (restoreFocus && formatId)
    document
      .querySelector(
        `[data-export-action="preview"][data-export-format-id="${CSS.escape(formatId)}"]`,
      )
      ?.focus();
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------
document.addEventListener("click", (event) => {
  if (event.target.closest?.("[data-export-preview-close]")) {
    atlasCloseExportPreview();
    return;
  }
  const button = event.target.closest?.(
    "#page-export [data-export-action][data-export-format-id]",
  );
  if (!button) return;
  const { exportAction, exportFormatId } = button.dataset;
  if (exportAction === "preview") atlasShowExportPreview(exportFormatId);
  else atlasRunExport(exportFormatId, exportAction);
});
document.addEventListener("input", (event) => {
  const formatId = event.target?.dataset?.exportFileName;
  if (formatId) atlasExportView.fileNames.set(formatId, event.target.value);
});
document.addEventListener("change", (event) => {
  const formatId = event.target?.dataset?.exportFileName;
  const format = formatId && atlasExportFormat(formatId);
  if (!format) return;
  // Show the name that will be used once the field is committed.
  const value = atlasSanitizeExportFileName(
    event.target.value,
    format.extension,
  );
  if (value) atlasExportView.fileNames.set(format.id, value);
  else atlasExportView.fileNames.delete(format.id);
  event.target.value = atlasExportFileNameValue(format);
});

// -----------------------------------------------------------------------------
// Built-in formats
// -----------------------------------------------------------------------------
atlasRegisterExportFormat({
  id: "json",
  label: "JSON",
  icon: "file-json",
  description:
    "The complete audit document. It can be imported back into ATLAS Align.",
  extension: "json",
  tags: ["Includes disabled steps"],
  preview: "text",
  fileName: () => atlasExportAuditBaseName(),
  build: () => JSON.stringify(state.audit, null, 2),
});
atlasRegisterExportFormat({
  id: "excel",
  label: "Excel",
  icon: "file-table",
  description:
    "Fields and Audit Logic as formatted worksheets. Disabled steps are left out.",
  extension: "xlsx",
  preview: "workbook",
  fileName: () => `${atlasExportAuditBaseName()}_audit_logic_${today()}`,
  build: async () => {
    const workbook = await buildAuditExcelWorkbook();
    return { workbook, content: await workbook.xlsx.writeBuffer() };
  },
});
atlasRegisterExportFormat({
  id: "qtest",
  label: "Qtest",
  icon: "file-check",
  description:
    "The Qtest test design workbook, with one scenario per enabled logic step.",
  extension: "xlsx",
  tags: ["Excel template"],
  preview: "workbook",
  fileName: () => `${atlasExportAuditBaseName()}_qtest_template_${today()}`,
  build: () => buildQtestExportFile(),
});
atlasRegisterExportFormat({
  id: "html",
  label: "HTML",
  icon: "file-code",
  description:
    "A styled page with the Fields and Audit Logic tables. Disabled steps are left out.",
  extension: "html",
  tags: ["Can be added directly to Confluence"],
  actions: ["download", "copy"],
  preview: "html",
  fileName: () => `${atlasExportAuditBaseName()}_${today()}`,
  build: () => auditHtmlDocument(),
});
atlasRegisterExportFormat({
  id: "csv",
  label: "CSV",
  icon: "file-table",
  description: "Audit Logic rows as comma-separated values.",
  extension: "csv",
  preview: "text",
  hidden: true,
  fileName: () => `${atlasExportAuditBaseName()}_audit_logic_${today()}`,
  build: () => auditCsvDocument(),
});
atlasRegisterExportFormat({
  id: "markdown",
  label: "Markdown",
  icon: "file-code",
  description: "Audit Logic as a Markdown table.",
  extension: "md",
  actions: ["download", "copy"],
  preview: "text",
  hidden: true,
  fileName: () => `${atlasExportAuditBaseName()}_audit_logic_${today()}`,
  build: () => markdown(),
});

window.ATLASExportFormats = {
  register: atlasRegisterExportFormat,
  get: atlasExportFormat,
  list: () => [...atlasExportFormats],
  visible: atlasVisibleExportFormats,
  run: atlasRunExport,
  render: atlasRenderExportDashboard,
  invalidate: atlasInvalidateExportPage,
};
