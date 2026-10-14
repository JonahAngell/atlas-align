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

function atlasCustomSourceFormatOptions() {
  return CUSTOM_FIELD_FORMATS.map(
    (format) => `<option value="${esc(format)}">${esc(format)}</option>`,
  ).join("");
}

function atlasCustomSourceFieldRow() {
  const row = document.createElement("fieldset");
  row.className = "custom-source-field";
  row.dataset.customField = "true";
  row.innerHTML = `<legend></legend>
    <label class="custom-source-label">Display name
      <input autocomplete="off" class="input full-input" data-field-display maxlength="200" required type="text">
    </label>
    <label class="custom-source-label">Source field name
      <span class="hint">Optional. Uses the display name when blank.</span>
      <input autocomplete="off" class="input full-input" data-field-name maxlength="200" type="text">
    </label>
    <div class="custom-source-label atlas-choice-field"><span class="atlas-choice-heading">Format</span>${atlasChoiceControl({
      options: CUSTOM_FIELD_FORMATS,
      selected: "Text",
      variant: "chips",
      label: "Field format",
      attributes: 'data-field-format="" required',
    })}</div>
    <label class="custom-source-label">Description
      <span class="hint">Optional</span>
      <textarea class="input full-input" data-field-description maxlength="2000" rows="2"></textarea>
    </label>
    <button class="btn ghost" data-remove-custom-field type="button">Remove field</button>`;
  return row;
}

function atlasRenumberCustomSourceFields(host) {
  const rows = [...host.querySelectorAll("[data-custom-field]")];
  rows.forEach((row, index) => {
    const legend = row.querySelector("legend");
    if (legend) legend.textContent = `Field ${index + 1}`;
    const remove = row.querySelector("[data-remove-custom-field]");
    if (remove) remove.disabled = rows.length === 1;
  });
}

function atlasResetCustomSourceForm() {
  const form = $("customSourceForm");
  const host = $("customSourceFields");
  const error = $("customSourceError");
  form?.reset();
  if (error) error.textContent = "";
  if (!host) return;
  host.replaceChildren(atlasCustomSourceFieldRow());
  atlasRenumberCustomSourceFields(host);
}

function atlasShowCustomSourceError(message) {
  const error = $("customSourceError");
  if (error) error.textContent = message;
}

function atlasReadCustomSourceFields() {
  return [...document.querySelectorAll("#customSourceFields [data-custom-field]")].map(
    (row) => ({
      legend: row.querySelector("legend")?.textContent || "Field",
      display: row.querySelector("[data-field-display]"),
      format: row.querySelector("[data-field-format]"),
      vanityLabel: row.querySelector("[data-field-display]")?.value.trim() || "",
      fieldName: row.querySelector("[data-field-name]")?.value.trim() || "",
      fieldFormat: row.querySelector("[data-field-format]")?.value || "",
      businessDescription:
        row.querySelector("[data-field-description]")?.value.trim() || "",
    }),
  );
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
      row.format?.focus();
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
    const row = atlasCustomSourceFieldRow();
    fields.append(row);
    atlasRenumberCustomSourceFields(fields);
    row.querySelector("[data-field-display]")?.focus();
  });
  fields.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-custom-field]");
    if (!remove || remove.disabled) return;
    remove.closest("[data-custom-field]")?.remove();
    atlasRenumberCustomSourceFields(fields);
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
