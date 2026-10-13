/**
 * 13-catalog-field-browser.js
 *
 * Enhanced source/field browser rendering with catalog metadata search and selected source actions.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Catalog metadata formatting helpers
// -----------------------------------------------------------------------------
/**
 * Flattens catalog metadata into searchable text.
 * @param {any} value - Value to process or assign.
 */
function atlasCatalogTextValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (value && typeof value === "object")
    return Object.values(value).map(atlasCatalogTextValue).join(" ");
  return value == null ? "" : String(value);
}
/**
 * Renders metadata lists as small HTML labels.
 * @param {any} values - Input used by atlasCatalogListHtml.
 */
function atlasCatalogListHtml(values) {
  const items = (
    Array.isArray(values) ? values : String(values || "").split(",")
  )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return items.length
    ? items.map((item) => `<span class="badge">${esc(item)}</span>`).join(" ")
    : "";
}
/**
 * Renders one metadata label/value line.
 * @param {any} label - Human-readable label.
 * @param {any} value - Value to process or assign.
 */
function atlasCatalogMetaLine(label, value) {
  const text = atlasCatalogTextValue(value).trim();
  return text
    ? `<div class="small"><strong>${esc(label)}:</strong> ${esc(text)}</div>`
    : "";
}
/**
 * Builds searchable text for a catalog field.
 * @param {any} field - Field record.
 */
function atlasCatalogFieldSearchText(field) {
  return [
    field.fieldName,
    field.rawFieldName,
    field.name,
    field.vanityLabel,
    field.label,
    field.businessDescription,
    field.dataCategory,
    field.fieldFormat,
    field.fieldType,
    field.authorityType,
    field.fieldStatus,
    field.transformationLogic,
    field.translationLogic,
    field.schemaLocation,
    field.developerNotes,
    field.developerJoinNotes,
    atlasCatalogTextValue(field.sampleValues),
    atlasCatalogTextValue(field.matchingKeys),
    atlasCatalogTextValue(field.governance),
  ]
    .join(" ")
    .toLowerCase();
}
/**
 * Builds searchable text for a source and its fields.
 * @param {any} source - Source file record.
 */
function sourceSearchText(source) {
  return [
    source.sourceFile,
    source.alias,
    atlasCatalogTextValue(source.sourceMetadata),
    ...(source.fields || []).map(atlasCatalogFieldSearchText),
  ]
    .join(" ")
    .toLowerCase();
}
/**
 * Renders source metadata details.
 * @param {any} source - Source file record.
 */
function atlasCatalogSourceMetadataHtml(source) {
  const meta = source.sourceMetadata || {};
  return [
    atlasCatalogMetaLine("Source System", meta.sourceSystem),
    atlasCatalogMetaLine("Source Title", meta.sourceTitle),
    atlasCatalogMetaLine("Frequency", meta.frequency),
    atlasCatalogMetaLine("Population", meta.population),
    atlasCatalogMetaLine("File Format", meta.sourceFileFormat),
    atlasCatalogMetaLine("Source Owner", meta.sourceOwner),
  ]
    .filter(Boolean)
    .join("");
}
/**
 * Renders field metadata details.
 * @param {any} field - Field record.
 */
function atlasCatalogFieldMetadataHtml(field) {
  const matching = atlasCatalogListHtml(field.matchingKeys);
  const samples = atlasCatalogListHtml(field.sampleValues);
  const governance = field.governance || {};
  return `<div class="hint source-field-metadata">
    ${atlasCatalogMetaLine("Business Description", field.businessDescription)}
    ${atlasCatalogMetaLine("Data Category", field.dataCategory)}
    ${atlasCatalogMetaLine("Field Format", field.fieldFormat)}
    ${atlasCatalogMetaLine("Authority Type", field.authorityType)}
    ${matching ? `<div class="small"><strong>Related mappings:</strong> ${matching}</div>` : ""}
    ${samples ? `<div class="small"><strong>Sample Values:</strong> ${samples}</div>` : ""}
    ${atlasCatalogMetaLine("Governance Owner", governance.governanceOwner || governance.fieldOwner)}
    ${atlasCatalogMetaLine("Last Validated", governance.lastValidatedDate)}
    ${atlasCatalogMetaLine("Validation Notes", governance.validationNotes)}
  </div>`;
}

// -----------------------------------------------------------------------------
// Catalog field browser rendering
// -----------------------------------------------------------------------------
/**
 * Handles the renderSourceFieldBrowser portion of the ATLAS Align client-side workflow.
 */
function getSourceFieldBrowserModel() {
  const query = ($("sourceFieldSearch")?.value || "").toLowerCase().trim();
  const selected = new Set(
    (state.audit.sources || []).map((source) => sourceCatalogKey(source)),
  );
  const allSources = sourceCatalogEntries();

  return {
    query,
    selected,
    allSources,
  };
}

function sourceFieldBrowserMatchesSearch(source, query) {
  if (!query) return true;
  return sourceSearchText(source).includes(query);
}

// -----------------------------------------------------------------------------
// Catalog field browser events
// -----------------------------------------------------------------------------
/**
 * Wires source-browser search and selection events.
 */
function bindCatalogFieldBrowserEvents() {
  $("sourceFieldSearch")?.addEventListener("input", () =>
    renderSourceFieldBrowser(),
  );
  // Source add/remove mutations are owned by atlasCommitAuditSourceChange in
  // 15b-source-library-ui.js. This listener only owns field selection.
  document.body.addEventListener("click", (event) => {
    const fieldButton = event.target.closest(
      "[data-source-file][data-field-name]",
    );
    if (fieldButton)
      applyLibraryFieldToSelectedStep(
        fieldButton.dataset.sourceFile || "",
        fieldButton.dataset.fieldName || "",
      );
  });
}
const renderAllBaseForCatalogFieldBrowser = renderAll;
/**
 * Central render coordinator for the current audit UI.
 */
renderAll = function renderAllWithCatalogFieldBrowser(options = {}) {
  return renderAllBaseForCatalogFieldBrowser(options);
};
