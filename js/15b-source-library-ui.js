/**
 * 15b-source-library-ui.js
 * Split from 15-visual-ui-upgrades.js.
 * Audit/source contacts-style browser refinements and selected-source rendering/actions.
 * IMPORTANT: classic browser script; preserve the 15a-15g load order.
 */
/* Spacing/data-browser refinement layer */
let activeSourceLibraryTab = "all";
function sourceSystem(source) {
  const text = `${source.sourceFile || ""} ${source.alias || ""}`.toLowerCase();
  if (
    text.includes("workday") ||
    text.includes("wd.") ||
    text.includes("wd ") ||
    text.startsWith("wd")
  )
    return "workday";
  if (
    text.includes("sap") ||
    text.includes("sap.") ||
    /^zhr|^zhre|^hi\d|^pa\s/i.test(source.sourceFile || "")
  )
    return "sap";
  return "other";
}
function selectedSourceSet() {
  const audit = atlasDisplayDocument?.() || state.audit;
  return new Set(
    (audit.sources || [])
      .map((source) => atlasSourceMutationKey(source))
      .filter(Boolean),
  );
}
function sourceMatchesSearch(source, query) {
  if (!query) return true;
  return [
    source.sourceFile,
    source.alias,
    ...(source.fields || []).flatMap((field) => [
      field.fieldName,
      field.vanityLabel,
      field.label,
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

let activeSelectedSourceName = "";
let selectedSourceFieldSort = { key: "order", direction: "asc" };
let selectedSourceFieldDetailKey = "";
let selectedSourceTableScroll = { top: 0, left: 0 };

const SELECTED_SOURCE_FIELD_COLUMNS = [
  { key: "order", label: "#" },
  { key: "fieldName", label: "Field Name" },
  { key: "vanityLabel", label: "Vanity Label" },
  { key: "formatting", label: "Formatting" },
  { key: "dataCategory", label: "Data Category" },
  { key: "authorityType", label: "Authority Type" },
];

function selectedSourceFieldText(...values) {
  for (const value of values) {
    const text =
      typeof atlasCatalogTextValue === "function"
        ? atlasCatalogTextValue(value).trim()
        : String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function selectedSourceFieldEmptyCell(value) {
  const text = String(value ?? "").trim();
  if (!text)
    return '<span class="selected-source-empty" aria-label="Empty">—</span>';
  return esc(text);
}

function rememberSelectedSourceTableScroll() {
  const wrap = document.querySelector(
    "#sourcesList .selected-source-table-wrap",
  );
  if (!wrap) return;
  selectedSourceTableScroll = {
    top: wrap.scrollTop,
    left: wrap.scrollLeft,
  };
}

function restoreSelectedSourceTableScroll() {
  const wrap = document.querySelector(
    "#sourcesList .selected-source-table-wrap",
  );
  if (!wrap) return;
  wrap.scrollTop = selectedSourceTableScroll.top;
  wrap.scrollLeft = selectedSourceTableScroll.left;
}

function resetSelectedSourceFieldView() {
  selectedSourceFieldDetailKey = "";
  selectedSourceTableScroll = { top: 0, left: 0 };
}

function toggleSelectedSourceFieldSort(key) {
  if (!SELECTED_SOURCE_FIELD_COLUMNS.some((column) => column.key === key))
    return;
  if (selectedSourceFieldSort.key === key) {
    selectedSourceFieldSort = {
      key,
      direction: selectedSourceFieldSort.direction === "asc" ? "desc" : "asc",
    };
    return;
  }
  selectedSourceFieldSort = { key, direction: "asc" };
}

function compareSelectedSourceFieldRows(left, right) {
  const direction = selectedSourceFieldSort.direction === "desc" ? -1 : 1;
  const key = selectedSourceFieldSort.key;
  if (key === "order") return (left.order - right.order) * direction;
  const leftText = String(left[key] || "").trim();
  const rightText = String(right[key] || "").trim();
  if (!leftText && !rightText) return left.order - right.order;
  if (!leftText) return 1;
  if (!rightText) return -1;
  const compared = leftText.localeCompare(rightText, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  return compared ? compared * direction : left.order - right.order;
}

function scrollContactsLetter(containerSelector, letter) {
  const container = document.querySelector(containerSelector);
  const target = container?.querySelector(
    `[data-alpha-letter="${CSS.escape(letter)}"]`,
  );
  if (container && target)
    container.scrollTo({
      top: target.offsetTop - container.offsetTop,
      behavior: "smooth",
    });
}

function allAuditLibraryItems() {
  const items = [];
  (repoLibraryState?.audits || []).forEach((audit) =>
    items.push({
      value: `repo:${audit.id}`,
      title: audit.name || audit.id,
      detail: audit.description || audit.file || "",
      kind: "Repo Audit",
    }),
  );
  (state.savedFlows || []).forEach((flow) =>
    items.push({
      value: `local:${flow.id}`,
      title: flow.name || "Saved audit",
      detail: flow.updatedAt
        ? `Saved ${new Date(flow.updatedAt).toLocaleString()}`
        : "Saved in this browser",
      kind: "Saved Audit",
    }),
  );
  if (typeof workbookState !== "undefined" && workbookState.loaded)
    (workbookState.auditSheets || []).forEach((name) =>
      items.push({
        value: `workbook:${name}`,
        title: name,
        detail: "Workbook audit sheet",
        kind: "Workbook Import",
      }),
    );
  return alphaSortItems(items, (item) => item.title);
}

renderAuditLibrarySelect = function renderAuditLibraryContacts() {
  const select = $("auditLibrarySelect");
  const visual = $("auditLibraryVisual");
  const allItems = allAuditLibraryItems();
  const currentSearch = $("auditLibrarySearch")?.value || "";
  const query = currentSearch.toLowerCase().trim();
  const items = allItems.filter((item) =>
    `${item.title} ${item.detail} ${item.kind}`.toLowerCase().includes(query),
  );

  if (select) {
    select.innerHTML = allItems.length
      ? allItems
          .map(
            (item) =>
              `<option value="${esc(item.value)}">${esc(item.title)}</option>`,
          )
          .join("")
      : '<option value="">No audits available</option>';
  }

  if (!visual) return;

  const letters = alphaLetters(items, (item) => item.title);
  const rows = items.length
    ? items
        .map((item, idx) => {
          const letter = firstLetter(item.title);
          const previousLetter = idx ? firstLetter(items[idx - 1].title) : "";
          const header =
            letter !== previousLetter
              ? `<div class="contacts-letter-header audit-letter-header" data-alpha-letter="${esc(letter)}">${esc(letter)}</div>`
              : "";
          return `${header}<button type="button" class="contacts-row audit-contact-row" data-audit-library-value="${esc(item.value)}"><span class="audit-contact-content"><span class="contacts-title audit-contact-title">${esc(item.title)}</span><span class="contacts-detail audit-contact-detail">${esc(item.kind)}${item.detail ? ` · ${esc(item.detail)}` : ""}</span></span></button>`;
        })
        .join("")
    : '<p class="hint contacts-empty audit-contacts-empty">No audits match the current search.</p>';

  visual.innerHTML = `<div class="contacts-menu-header audit-library-search-row"><input id="auditLibrarySearch" value="${esc(currentSearch)}" placeholder="Search audits..."><button type="button" class="small" data-new-audit-from-library>+ New Audit</button></div><div class="contacts-list-shell audit-library-shell"><div class="contacts-list audit-library-list" data-contacts-list="audit">${rows}</div><div class="contacts-letter-index audit-letter-index">${letters.map((letter) => `<button type="button" data-scroll-letter="${esc(letter)}" data-scroll-scope="audit">${esc(letter)}</button>`).join("")}</div></div>`;
};

function filteredSourceEntries() {
  const tab = activeSourceLibraryTab || "all";
  const query = ($("sourceFieldSearch")?.value || "").toLowerCase().trim();
  const selected = selectedSourceSet();
  return alphaSortItems(
    sourceCatalogEntries(),
    (source) => source.sourceFile,
  ).filter((source) => {
    if (tab === "selected" && !selected.has(sourceCatalogKey(source)))
      return false;
    if (tab !== "all" && tab !== "selected" && sourceSystem(source) !== tab)
      return false;
    return sourceMatchesSearch(source, query);
  });
}

let atlasSourceUsageCache = { version: -1, audit: null, byKey: new Map() };
function atlasBuildSourceUsageIndex() {
  const audit = atlasDisplayDocument?.() || state.audit;
  if (
    atlasSourceUsageCache.version === atlasSourceDerivedVersion &&
    atlasSourceUsageCache.audit === audit
  )
    return atlasSourceUsageCache.byKey;
  const byKey = new Map();
  const ensure = (sourceLike) => {
    const identity = atlasResolveSourceIdentity(sourceLike);
    if (!identity.sourceKey || identity.ambiguous) return null;
    if (!byKey.has(identity.sourceKey))
      byKey.set(identity.sourceKey, {
        manualSelected: false,
        logicDerived: false,
        displayDerived: false,
        included: false,
        color: SOURCE_COLOR_PALETTE?.[0] || "#4d6fa9",
      });
    return byKey.get(identity.sourceKey);
  };
  (audit.sources || []).forEach((source) => {
    const usage = ensure(source);
    if (!usage) return;
    usage.manualSelected = true;
    usage.color = source.color || usage.color;
  });
  const markLogic = (value) => {
    const usage = ensure(value);
    if (usage) usage.logicDerived = true;
  };
  const qualifyingSteps = (audit.steps || []).filter((step) => {
    const type = String(step.step_type || step.type || "").toLowerCase();
    return (
      !step.autoGeneratedReference && type !== "reference" && type !== "join"
    );
  });
  if (typeof atlasLogicFieldReferences === "function") {
    atlasLogicFieldReferences(qualifyingSteps).forEach((reference) =>
      markLogic(
        reference.sourceKey || reference.sourceFile || reference.sourceAlias,
      ),
    );
  } else {
    qualifyingSteps.forEach((step) => {
      const p = step.params || {};
      [step.sourceKey, step.source, p.source_key, p.source_file].forEach(
        markLogic,
      );
    });
  }
  (audit.fields || []).forEach((field) => {
    const displayed = [field.displayed, field.display, field.isDisplayed].some(
      (value) => value === true || String(value || "").toLowerCase() === "yes",
    );
    if (!displayed) return;
    const usage = ensure(
      field.sourceKey || field.sourceFile || field.sourceAlias,
    );
    if (usage) usage.displayDerived = true;
  });
  byKey.forEach((usage) => {
    usage.included = usage.manualSelected;
  });
  atlasSourceUsageCache = {
    version: atlasSourceDerivedVersion,
    audit,
    byKey,
  };
  return byKey;
}
function atlasSourceUsageState(source) {
  const identity = atlasResolveSourceIdentity(source);
  const usage = !identity.ambiguous
    ? atlasBuildSourceUsageIndex().get(identity.sourceKey)
    : null;
  return (
    usage || {
      manualSelected: false,
      logicDerived: false,
      displayDerived: false,
      included: false,
      color: source.sourceColor || SOURCE_COLOR_PALETTE?.[0] || "#4d6fa9",
    }
  );
}
function atlasReplaceSourceButton(sourceKey) {
  if (
    typeof atlasAuditIsWorkflowLocked === "function" &&
    atlasAuditIsWorkflowLocked()
  )
    return "";
  const key = String(sourceKey || "").trim();
  if (!key) return "";
  return `<button type="button" class="btn secondary small" data-replace-source="${esc(key)}">Replace</button>`;
}
function atlasSafeAvatarUrl(value) {
  const avatar = String(value || "").trim();
  if (/^https:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith("/") && !avatar.startsWith("//")) return avatar;
  return "";
}
function atlasCustomSourceInitials(fullName) {
  const source = String(fullName || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : source.slice(0, 2)
  ).toUpperCase();
}
function atlasCustomSourceAvatarFallback(image) {
  image.remove();
}
function atlasBindCustomSourceAvatars(root) {
  root?.querySelectorAll(".source-custom-avatar img").forEach((image) => {
    image.addEventListener(
      "error",
      () => atlasCustomSourceAvatarFallback(image),
      { once: true },
    );
  });
}
function atlasCustomSourceBadge(source) {
  if (source?.origin !== "custom") return "";
  const createdBy = source.createdBy || {};
  const fullName = String(
    createdBy.fullName || createdBy.username || "Unknown user",
  ).trim();
  const initials = atlasCustomSourceInitials(fullName);
  const avatar = atlasSafeAvatarUrl(createdBy.avatar);
  const image = avatar
    ? `<img alt="" src="${esc(avatar)}" loading="lazy" referrerpolicy="no-referrer">`
    : "";
  return `<span class="source-inclusion-badge custom">Custom</span><button type="button" class="source-custom-creator" aria-label="${esc(fullName)}"><span class="avatar source-custom-avatar" aria-hidden="true">${esc(initials)}${image}</span><span class="source-custom-creator-name" role="tooltip">${esc(fullName)}</span></button>`;
}
function atlasSourceLibraryContext(source) {
  const title = String(
    source.sourceMetadata?.sourceTitle || source.sourceFile || source.name || "",
  ).trim();
  if (
    !title ||
    typeof atlasDisplayNameCollision !== "function" ||
    !atlasDisplayNameCollision(title)
  )
    return "";
  const systemLabels = { workday: "Workday", sap: "SAP", other: "Other" };
  const system = systemLabels[sourceSystem(source)] || "Other";
  const alias = String(source.alias || "").trim();
  const label = atlasSourceDisambiguatedLabel(source);
  const extraAlias =
    alias && alias !== title && !String(label).includes(alias) ? alias : "";
  return [system, extraAlias].filter(Boolean).join(" · ");
}
function atlasSourceLibraryMatchHtml(source, matchedFields) {
  if (!matchedFields.length) return "";
  const items = matchedFields.slice(0, 5).map((field) => {
    const name =
      field.vanityLabel ||
      field.label ||
      field.fieldName ||
      field.rawFieldName ||
      field.name ||
      "Field";
    const format = atlasCatalogTextValue(field.fieldFormat).trim();
    const samples = atlasCatalogTextValue(field.sampleValues).trim();
    const keys = (
      Array.isArray(field.matchingKeys)
        ? field.matchingKeys
        : String(field.matchingKeys || "").split(",")
    )
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const related = keys.length
      ? sourceCatalogEntries()
          .filter(
            (candidate) => sourceCatalogKey(candidate) !== sourceCatalogKey(source),
          )
          .flatMap((candidate) =>
            (candidate.fields || [])
              .filter((candidateField) => {
                const candidateKeys = (
                  Array.isArray(candidateField.matchingKeys)
                    ? candidateField.matchingKeys
                    : String(candidateField.matchingKeys || "").split(",")
                )
                  .map((item) =>
                    String(item || "")
                      .trim()
                      .toLowerCase(),
                  )
                  .filter(Boolean);
                return keys.some((key) =>
                  candidateKeys.includes(key.toLowerCase()),
                );
              })
              .map(
                (candidateField) =>
                  `${atlasSourceDisambiguatedLabel(candidate)}: ${candidateField.vanityLabel || candidateField.label || candidateField.fieldName || candidateField.rawFieldName || candidateField.name || "Field"}`,
              ),
          )
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(0, 4)
      : [];
    return { name, format, samples, related };
  });
  const names = items.map((item) => `<li>${esc(item.name)}</li>`).join("");
  const details = items
    .map((item) => {
      const bits = [
        item.format
          ? `<small><strong>Format:</strong> ${esc(item.format)}</small>`
          : "",
        item.samples
          ? `<small><strong>Samples:</strong> ${esc(item.samples)}</small>`
          : "",
        item.related.length
          ? `<small><strong>Related mappings:</strong> ${item.related.map(esc).join("; ")}</small>`
          : "",
      ].filter(Boolean);
      if (!bits.length) return "";
      return `<div class="source-library-field-match"><span>${esc(item.name)}</span>${bits.join("")}</div>`;
    })
    .filter(Boolean)
    .join("");
  const more =
    matchedFields.length > 5
      ? `<small>+${matchedFields.length - 5} more matching fields</small>`
      : "";
  const disclosure = details
    ? `<details class="source-library-field-match-more"><summary>Match details</summary>${details}</details>`
    : "";
  return `<div class="source-library-field-matches"><strong>Matches</strong><ul class="source-library-match-names">${names}</ul>${more}${disclosure}</div>`;
}
function atlasSourceLibraryPill(source) {
  const usage = atlasSourceUsageState(source);
  const query = ($("sourceFieldSearch")?.value || "").toLowerCase().trim();
  const matchedFields = query
    ? (source.fields || []).filter((field) =>
        atlasCatalogFieldSearchText(field).includes(query),
      )
    : [];
  const matchHtml = atlasSourceLibraryMatchHtml(source, matchedFields);
  const badges = [
    usage.logicDerived
      ? '<span class="source-inclusion-badge logic">Used in Logic</span>'
      : "",
    atlasCustomSourceBadge(source),
  ]
    .filter(Boolean)
    .join("");
  const fieldCount = source.fields?.length || 0;
  const context = atlasSourceLibraryContext(source);
  const countLabel = `${fieldCount} field${fieldCount === 1 ? "" : "s"}`;
  return `<article class="audit-source-picker-pill ${usage.included ? "included" : "available"}"${usage.included ? ` style="--source-pill-color:${esc(usage.color)}"` : ""}>
    <button type="button" class="audit-source-picker-main" data-source-detail-name="${esc(sourceCatalogKey(source))}">
      <span class="source-color-dot" aria-hidden="true"></span>
      <span class="source-library-pill-copy">
        <strong>${esc(atlasSourceDisambiguatedLabel(source))}</strong>
        <small>${esc(countLabel)}${context ? ` · ${esc(context)}` : ""}</small>
      </span>
    </button>
    ${badges ? `<span class="source-inclusion-badges">${badges}</span>` : ""}
    <div class="source-library-pill-actions">${usage.manualSelected ? atlasReplaceSourceButton(source.sourceKey || source.alias || "") : ""}<button type="button" class="btn small source-library-action-button ${usage.manualSelected ? "danger source-library-remove-button" : "primary source-library-add-button"}" data-source-action="${usage.manualSelected ? "remove" : "add"}" data-source-key="${esc(source.sourceKey || source.alias || "")}">${usage.manualSelected ? "Remove" : "Use"}</button></div>
    ${matchHtml}
  </article>`;
}
function atlasSourceLibraryTabsHtml(allSources) {
  const tabs = [
    ["all", "All", allSources],
    [
      "workday",
      "Workday",
      allSources.filter((source) => sourceSystem(source) === "workday"),
    ],
    [
      "sap",
      "SAP",
      allSources.filter((source) => sourceSystem(source) === "sap"),
    ],
    [
      "other",
      "Other",
      allSources.filter((source) => sourceSystem(source) === "other"),
    ],
    [
      "selected",
      "Included",
      allSources.filter((source) => atlasSourceUsageState(source).included),
    ],
  ];
  return tabs
    .map(
      ([key, label, items]) =>
        `<button type="button" class="source-library-tab ${activeSourceLibraryTab === key ? "active" : ""}" data-source-tab="${key}">${esc(label)} <span>${items.length}</span></button>`,
    )
    .join("");
}

renderSourceFieldBrowser = function renderSourceFieldBrowserAuditAwareInline() {
  const panel = $("sourceFieldBrowser");
  const tabRoot = $("sourceLibraryTabs");
  if (!panel) return;
  const allSources = sourceCatalogEntries();
  const sources = filteredSourceEntries();
  const includedCount = allSources.filter(
    (source) => atlasSourceUsageState(source).included,
  ).length;

  if (tabRoot) tabRoot.innerHTML = atlasSourceLibraryTabsHtml(allSources);
  panel.innerHTML = `
    <div class="source-library-inline-summary" aria-live="polite">
      <span><strong>${includedCount}</strong> included for this audit</span>
      <span>${allSources.length} available</span>
    </div>
    <div class="source-library-picker-results source-library-inline-results" data-source-library-results>
      ${sources.length ? sources.map(atlasSourceLibraryPill).join("") : '<p class="hint contacts-empty">No source files match the current search.</p>'}
    </div>`;
  atlasBindCustomSourceAvatars(panel);
};

function fieldRowsForSource(sourceName) {
  return fieldsForSource(sourceName).map((field, index) => {
    const fieldName = selectedSourceFieldText(
      field.fieldName,
      field.rawFieldName,
      field.name,
    );
    const orderNumber = Number(field.order);
    const order =
      Number.isFinite(orderNumber) && orderNumber > 0
        ? orderNumber
        : index + 1;
    return {
      key: String(
        field.id ||
          field.uniqueFieldIdentifier ||
          `field-${index}-${fieldName}`,
      ),
      order,
      fieldName,
      vanityLabel: selectedSourceFieldText(field.vanityLabel, field.label),
      formatting: selectedSourceFieldText(
        field.fieldFormat,
        field.formatting,
        field.format,
        field.formattingNotes,
      ),
      dataCategory: selectedSourceFieldText(field.dataCategory),
      authorityType: selectedSourceFieldText(field.authorityType),
      field,
    };
  });
}
function selectedSourceFieldHeaderHtml() {
  return SELECTED_SOURCE_FIELD_COLUMNS.map((column) => {
    const active = selectedSourceFieldSort.key === column.key;
    const ariaSort = active
      ? selectedSourceFieldSort.direction === "asc"
        ? "ascending"
        : "descending"
      : "none";
    const indicator = active
      ? selectedSourceFieldSort.direction === "asc"
        ? "▲"
        : "▼"
      : "";
    return `<th scope="col" aria-sort="${ariaSort}"><button type="button" class="selected-source-sort${active ? " is-sorted" : ""}" data-selected-field-sort="${esc(column.key)}" title="Sort by ${esc(column.label)}">${esc(column.label)}${indicator ? `<span class="selected-source-sort-indicator" aria-hidden="true">${indicator}</span>` : ""}</button></th>`;
  }).join("");
}
function selectedSourceFieldDetailHtml(row) {
  const field = row.field || {};
  const governance = field.governance || {};
  const samples =
    typeof atlasCatalogListHtml === "function"
      ? atlasCatalogListHtml(field.sampleValues)
      : "";
  const matching =
    typeof atlasCatalogListHtml === "function"
      ? atlasCatalogListHtml(field.matchingKeys)
      : "";
  const meta =
    typeof atlasCatalogMetaLine === "function"
      ? atlasCatalogMetaLine
      : (label, value) => {
          const text = selectedSourceFieldText(value);
          return text
            ? `<div class="small"><strong>${esc(label)}:</strong> ${esc(text)}</div>`
            : "";
        };
  const lines = [
    meta("Business Description", field.businessDescription),
    meta("Unique Field Identifier", field.uniqueFieldIdentifier),
    meta("Data Category", field.dataCategory),
    meta(
      "Field Format",
      selectedSourceFieldText(
        field.fieldFormat,
        field.formatting,
        field.format,
        field.formattingNotes,
      ),
    ),
    meta("Authority Type", field.authorityType),
    meta("Field Status", field.fieldStatus),
    meta("Field Type", field.fieldType),
    meta("Max Characters", field.maxCharacters),
    samples
      ? `<div class="small"><strong>Sample Values:</strong> ${samples}</div>`
      : "",
    matching
      ? `<div class="small"><strong>Related mappings:</strong> ${matching}</div>`
      : "",
    meta("Transformation Logic", field.transformationLogic),
    meta("Translation Logic", field.translationLogic),
    meta("Schema Location", field.schemaLocation),
    meta("Developer Notes", field.developerNotes),
    meta("Developer Join Notes", field.developerJoinNotes),
    meta("Field Owner", field.fieldOwner),
    meta("System of Record", field.systemOfRecord),
    meta("Downstream Impact", field.downstreamImpact),
    meta(
      "Governance Owner",
      governance.governanceOwner || governance.fieldOwner,
    ),
    meta("Last Validated", governance.lastValidatedDate),
    meta("Validation Notes", governance.validationNotes),
  ].filter(Boolean);
  const body = lines.length
    ? lines.join("")
    : '<p class="hint selected-source-empty-note">No additional metadata is attached to this field.</p>';
  return `<div class="selected-source-field-detail-panel"><div class="selected-source-field-detail-toolbar"><strong>${esc(row.fieldName || "Field")}</strong><button type="button" class="btn secondary" data-close-field-detail>Close</button></div><div class="source-field-metadata">${body}</div></div>`;
}
function selectedSourceFieldBodyHtml(rows) {
  return rows
    .map((row) => {
      const open = selectedSourceFieldDetailKey === row.key;
      const cells = [
        esc(String(row.order)),
        selectedSourceFieldEmptyCell(row.fieldName),
        selectedSourceFieldEmptyCell(row.vanityLabel),
        selectedSourceFieldEmptyCell(row.formatting),
        selectedSourceFieldEmptyCell(row.dataCategory),
        selectedSourceFieldEmptyCell(row.authorityType),
      ]
        .map((cell) => `<td>${cell}</td>`)
        .join("");
      const detail = open
        ? `<tr class="selected-source-field-detail"><td colspan="6">${selectedSourceFieldDetailHtml(row)}</td></tr>`
        : "";
      return `<tr class="selected-source-field-row${open ? " is-open" : ""}" data-selected-field-key="${esc(row.key)}" tabindex="0" role="button" aria-expanded="${open ? "true" : "false"}" aria-label="Show metadata for ${esc(row.fieldName || "field")}">${cells}</tr>${detail}`;
    })
    .join("");
}
function renderSelectedSourceColorControl(source) {
  const color = source.color || SOURCE_COLOR_PALETTE[0];
  return `<details class="compact-color-picker"><summary><span class="single-color-swatch" style="background:${esc(color)}"></span><span>${esc(color)}</span></summary><div class="compact-color-menu">${SOURCE_COLOR_PALETTE.map((paletteColor) => `<button type="button" class="color-swatch ${paletteColor === color ? "active" : ""}" data-source-palette-color="${esc(paletteColor)}" style="background:${esc(paletteColor)}" title="${esc(paletteColor)}"></button>`).join("")}<label class="custom-color-label">Custom <input type="color" data-source-custom-color value="${esc(color)}"></label></div></details>`;
}
function renderSelectedSourceTable(sourceName) {
  if (!sourceName)
    return '<p class="hint">Select a source to view its fields.</p>';
  const detail = selectedSourceDetail(sourceName);
  if (!detail)
    return '<p class="hint">The selected source is no longer available.</p>';
  const rows = fieldRowsForSource(sourceName);
  const identity = atlasResolveSourceIdentity(detail);
  const audit = atlasDisplayDocument?.() || state.audit;
  const includedSource = (audit.sources || []).find(
    (item) => atlasSourceMutationKey(item) === identity.sourceKey,
  );
  const included = Boolean(includedSource);
  const title =
    atlasSourceDisambiguatedLabel(detail) ||
    includedSource?.name ||
    sourceName;
  const technicalName =
    detail.alias ||
    identity.alias ||
    includedSource?.alias ||
    identity.sourceKey;
  const sortedRows = [...rows].sort(compareSelectedSourceFieldRows);
  const useButton = included
    ? ""
    : `<button type="button" class="btn primary" data-source-action="add" data-source-key="${esc(identity.sourceKey || sourceName)}" title="Use this source in the audit">Use</button>`;
  return `<section class="selected-source-data-view ${included ? "included" : "preview-only"}"><div class="selected-source-detail-header"><div class="selected-source-title-stack"><h4 class="selected-source-heading">${esc(title)}</h4><p class="hint">${esc(technicalName)} · ${rows.length} fields</p>${included ? "" : '<span class="source-preview-status">Preview only · Not yet in use</span>'}</div><div class="selected-source-preview-actions"><button type="button" class="btn secondary" data-close-source-data>Back to selected sources</button>${useButton}</div></div><div class="selected-source-table-wrap"><table class="selected-source-table"><thead><tr>${selectedSourceFieldHeaderHtml()}</tr></thead><tbody>${sortedRows.length ? selectedSourceFieldBodyHtml(sortedRows) : '<tr><td colspan="6" class="hint">This source has no fields.</td></tr>'}</tbody></table></div></section>`;
}
renderSources = function renderCombinedSelectedSources() {
  const target = e.sourcesList;
  const audit = atlasDisplayDocument?.() || state.audit;
  const sources = audit.sources || [];
  if (
    activeSelectedSourceName &&
    !selectedSourceDetail(activeSelectedSourceName)
  )
    activeSelectedSourceName = "";
  if (activeSelectedSourceName) {
    target.innerHTML = renderSelectedSourceTable(activeSelectedSourceName);
    restoreSelectedSourceTableScroll();
    return;
  }
  if (!sources.length) {
    target.innerHTML =
      '<p class="hint">No sources in this audit yet. Choose a source, then Use it.</p>';
    return;
  }
  target.innerHTML = `<div class="selected-source-list">${sources
    .map((source) => {
      const identityKey =
        source.sourceKey || atlasStableSourceKey(source) || source.name;
      const detail = selectedSourceDetail(identityKey);
      const rows = fieldRowsForSource(identityKey);
      const title = atlasSourceDisambiguatedLabel(detail || source);
      return `<div class="selected-source-compact-card" data-id="${esc(source.id)}" data-review-source-key="${esc(identityKey || source.id)}" style="--source-color:${esc(source.color || SOURCE_COLOR_PALETTE[0])}"><button type="button" class="selected-source-main" data-source-detail-name="${esc(identityKey)}"><span class="single-color-swatch" style="background:${esc(source.color || SOURCE_COLOR_PALETTE[0])}"></span><span><strong>${esc(title)}</strong><small>${esc(source.alias || detail?.alias || sourceAliasFor?.(identityKey) || identityKey)} · ${rows.length} fields</small></span></button>${renderSelectedSourceColorControl(source)}${atlasReplaceSourceButton(identityKey)}<button type="button" class="danger small" data-remove-selected-source="${esc(identityKey)}">Remove</button></div>`;
    })
    .join("")}</div>`;
};
renderFields = function renderFieldsMergedIntoSources() {
  if (e.fieldsList) e.fieldsList.innerHTML = "";
};

function atlasCommitAuditSourceChange({ action, sourceKeyOrFile }) {
  if (
    typeof atlasAuditIsWorkflowLocked === "function" &&
    atlasAuditIsWorkflowLocked()
  ) {
    status?.("This audit is read-only while approval is pending.", "bad");
    return { changed: false, workflowLocked: true };
  }
  const previousSelectedStepId = state.selectedStepId;
  const result =
    action === "remove"
      ? atlasRemoveSourceState(sourceKeyOrFile)
      : atlasAddSourceState(sourceKeyOrFile);

  if (!result.changed) return result;

  // Source mutation has completed. Synchronize generated references exactly once.
  syncAutoReferenceSteps();

  if (
    state.selectedStepId &&
    !state.audit.steps.some((step) => step.id === state.selectedStepId)
  ) {
    state.selectedStepId = state.audit.steps[0]?.id || null;
  }
  if (!state.selectedStepId && previousSelectedStepId) {
    state.selectedStepId = state.audit.steps[0]?.id || null;
  }

  // Reconcile the Sources page synchronously so the clicked action is visible immediately.
  renderSources?.();
  renderSourceFieldBrowser?.();
  renderFieldPickerPanel?.();
  updateDashboardMetrics?.();

  // Mark expensive backing data and hidden pages dirty; render them on first use.
  atlasMarkFieldPickerDirty?.();
  if (visualPickerState) renderMiniPicker?.();
  atlasInvalidatePages?.(["steps", "preview", "review", "overview"]);

  // Persist exactly once, after all state and UI work is complete.
  scheduleAutosave();
  status(
    `${action === "remove" ? "Removed" : "Added"} ${result.sourceFile || sourceKeyOrFile} ${action === "remove" ? "from" : "to"} this audit.`,
    "ok",
  );
  return result;
}

function atlasSourceActionFromControl(control) {
  if (control.matches("[data-remove-selected-source]")) return "remove";
  if (control.matches("[data-source-action]"))
    return control.dataset.sourceAction === "remove" ? "remove" : "add";
  return "add";
}

function atlasSourceKeyFromControl(control) {
  return (
    control.dataset.sourceKey ||
    control.dataset.removeSelectedSource ||
    control.dataset.addSourceToAudit ||
    control.dataset.sourceName ||
    ""
  );
}

// One capture-phase route owns both Source Library and Selected Sources & Fields actions.
document.addEventListener(
  "click",
  (event) => {
    const control = event.target.closest(
      "[data-source-action], [data-add-source-to-audit], [data-remove-selected-source]",
    );
    if (!control) return;
    const sourceKeyOrFile = atlasSourceKeyFromControl(control);
    if (!sourceKeyOrFile) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    atlasCommitAuditSourceChange({
      action: atlasSourceActionFromControl(control),
      sourceKeyOrFile,
    });
  },
  true,
);

const previousSpacingClickHandler = true;
document.addEventListener("click", (event) => {
  const newAudit = event.target.closest("[data-new-audit-from-library]");
  if (newAudit) {
    $("createAuditBtn")?.click();
    return;
  }
  const scrollButton = event.target.closest("[data-scroll-letter]");
  if (scrollButton) {
    scrollContactsLetter(
      scrollButton.dataset.scrollScope === "audit"
        ? '[data-contacts-list="audit"]'
        : '[data-contacts-list="source"]',
      scrollButton.dataset.scrollLetter || "",
    );
    return;
  }
  const sourceDetail = event.target.closest("[data-source-detail-name]");
  if (sourceDetail && sourceDetail.closest("#sourcesList")) {
    activeSelectedSourceName = sourceDetail.dataset.sourceDetailName || "";
    resetSelectedSourceFieldView();
    renderSources();
    return;
  }
  if (sourceDetail && sourceDetail.closest("#sourceFieldBrowser")) {
    activeSelectedSourceName = sourceDetail.dataset.sourceDetailName || "";
    resetSelectedSourceFieldView();
    renderSources();
    return;
  }
  const closeSourceData = event.target.closest("[data-close-source-data]");
  if (closeSourceData) {
    activeSelectedSourceName = "";
    resetSelectedSourceFieldView();
    renderSources();
    return;
  }
});

document.addEventListener("click", (event) => {
  const sortButton = event.target.closest("[data-selected-field-sort]");
  if (sortButton?.closest("#sourcesList")) {
    event.preventDefault();
    rememberSelectedSourceTableScroll();
    toggleSelectedSourceFieldSort(sortButton.dataset.selectedFieldSort || "");
    renderSources();
    return;
  }
  const closeFieldDetail = event.target.closest("[data-close-field-detail]");
  if (closeFieldDetail?.closest("#sourcesList")) {
    event.preventDefault();
    rememberSelectedSourceTableScroll();
    selectedSourceFieldDetailKey = "";
    renderSources();
    return;
  }
  const fieldRow = event.target.closest("[data-selected-field-key]");
  if (!fieldRow?.closest("#sourcesList") || event.target.closest("button, a"))
    return;
  event.preventDefault();
  rememberSelectedSourceTableScroll();
  const key = fieldRow.dataset.selectedFieldKey || "";
  selectedSourceFieldDetailKey =
    selectedSourceFieldDetailKey === key ? "" : key;
  renderSources();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const fieldRow = event.target.closest?.("[data-selected-field-key]");
  if (!fieldRow?.closest("#sourcesList")) return;
  event.preventDefault();
  fieldRow.click();
});

document.addEventListener(
  "scroll",
  (event) => {
    const wrap = event.target;
    if (!(wrap instanceof Element)) return;
    if (
      !wrap.classList.contains("selected-source-table-wrap") ||
      !wrap.closest("#sourcesList")
    )
      return;
    selectedSourceTableScroll = {
      top: wrap.scrollTop,
      left: wrap.scrollLeft,
    };
  },
  true,
);

document.addEventListener("input", (event) => {
  if (event.target?.id === "auditLibrarySearch") renderAuditLibrarySelect();
});

document.addEventListener("input", (event) => {
  if (event.target?.id === "sourceFieldSearch") renderSourceFieldBrowser();
});

document.addEventListener("click", (event) => {
  const palette = event.target.closest("[data-source-palette-color]");
  if (!palette) return;
  const card = palette.closest(".selected-source-compact-card");
  if (!card) return;
  const source = (state.audit.sources || []).find(
    (item) => item.id === card.dataset.id,
  );
  if (source) {
    source.color = palette.dataset.sourcePaletteColor;
    atlasInvalidatePages?.(["fields", "steps", "preview", "review"]);
    atlasRenderActivePage?.({ force: true });
    scheduleAutosave();
  }
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-source-custom-color]")) return;
  const card = event.target.closest(".selected-source-compact-card");
  if (!card) return;
  const source = (state.audit.sources || []).find(
    (item) => item.id === card.dataset.id,
  );
  if (source) {
    source.color = event.target.value;
    atlasInvalidatePages?.(["fields", "steps", "preview", "review"]);
    atlasRenderActivePage?.({ force: true });
    scheduleAutosave();
  }
});
