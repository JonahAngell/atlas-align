/** Display Fields page. */
const atlasOriginalRequirementsFieldRows = requirementsFieldRows;
function atlasDisplayPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function atlasDisplayKey(value) {
  if (value?.canonicalKey) return atlasDisplayPart(value.canonicalKey);
  return `${atlasDisplayPart(value?.sourceKey || value?.sourceFile || value?.uniqueId || "calculated field")}::${atlasDisplayPart(value?.fieldName || value?.fieldTitle || value?.name)}`;
}
function atlasDisplayNormalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function atlasDisplaySourceByKey(identity = {}, sources = []) {
  const wantedKey = atlasDisplayNormalize(identity.sourceKey);
  const wantedAlias = atlasDisplayNormalize(identity.alias);
  const keysOf = (source) =>
    [source?.sourceKey, source?.catalogKey, source?.sourceReferenceId]
      .map(atlasDisplayNormalize)
      .filter(Boolean);
  const aliasesOf = (source) =>
    [source?.alias, source?.sourceAlias]
      .map(atlasDisplayNormalize)
      .filter(Boolean);
  if (wantedKey) {
    const byKey = sources.filter((source) => keysOf(source).includes(wantedKey));
    if (byKey.length === 1) return byKey[0];
    const byAliasKey = sources.filter((source) =>
      aliasesOf(source).includes(wantedKey),
    );
    if (byAliasKey.length === 1) return byAliasKey[0];
  }
  if (wantedAlias && wantedAlias !== wantedKey) {
    const byAlias = sources.filter((source) =>
      aliasesOf(source).includes(wantedAlias),
    );
    if (byAlias.length === 1) return byAlias[0];
  }
  return null;
}
function atlasDisplayPaletteColor(source, sources = []) {
  const palette =
    Array.isArray(SOURCE_COLOR_PALETTE) && SOURCE_COLOR_PALETTE.length
      ? SOURCE_COLOR_PALETTE
      : [];
  if (!palette.length) return "";
  if (!source) return palette[0];
  const used = new Set();
  let resolved = source.color || palette[0];
  sources.forEach((item, index) => {
    const color =
      item.color ||
      palette.find((entry) => !used.has(entry)) ||
      palette[index % palette.length];
    used.add(color);
    if (item === source) resolved = color;
  });
  return resolved;
}
function atlasDisplaySourceColor(identity = {}) {
  const audit =
    (typeof atlasDisplayDocument === "function"
      ? atlasDisplayDocument()
      : null) || state.audit;
  if (
    audit === state.audit &&
    typeof atlasEnsureAuditSourceColors === "function"
  )
    atlasEnsureAuditSourceColors();
  const sources = audit?.sources || [];
  return atlasDisplayPaletteColor(
    atlasDisplaySourceByKey(identity, sources),
    sources,
  );
}
function atlasDisplayResolvedSourceColor(identity = {}) {
  const fromAudit =
    typeof atlasSelectedSourceColor === "function"
      ? atlasSelectedSourceColor(
          identity.sourceKey || identity.sourceFile || identity.alias || "",
        )
      : "";
  return fromAudit || atlasDisplaySourceColor(identity) || "";
}
function atlasDisplaySameToken(left, right) {
  return Boolean(left) && atlasDisplayPart(left) === atlasDisplayPart(right);
}
function atlasDisplayCreatedMatch(row) {
  if (typeof atlasCreatedFieldEntries !== "function") return null;
  const title = atlasDisplayPart(
    row?.fieldTitle || row?.fieldName || row?.name,
  );
  if (!title) return null;
  const matches = atlasCreatedFieldEntries({ includeUnavailable: true }).filter(
    (item) => atlasDisplayPart(item.fieldName || item.rawFieldName) === title,
  );
  if (!matches.length) return null;
  const markedCalculated =
    !row?.uniqueId ||
    atlasDisplayPart(row.uniqueId) === "calculated field" ||
    atlasDisplayPart(row.sourceFile) === "calculated field" ||
    atlasDisplayPart(row.sourceKey) === "calculated-field" ||
    atlasDisplayPart(row.canonicalKey).startsWith("calculated:");
  if (markedCalculated) return matches.length === 1 ? matches[0] : null;
  const identity = requirementsSourceIdentity(row.uniqueId || row.sourceFile);
  const catalogFields = (sourceCatalogEntries?.() || [])
    .filter((source) =>
      [source.sourceKey, source.sourceFile, source.alias, source.name].some(
        (value) =>
          [
            identity.sourceKey,
            identity.sourceFile,
            identity.alias,
            row.uniqueId,
          ]
            .filter(Boolean)
            .some((candidate) => atlasDisplaySameToken(candidate, value)),
      ),
    )
    .flatMap((source) => source.fields || []);
  const inCatalog = catalogFields.some((field) =>
    [field.rawFieldName, field.fieldName, field.name, field.label].some(
      (value) => atlasDisplayPart(value) === title,
    ),
  );
  if (inCatalog) return null;
  const sameSource = (item) =>
    [item.sourceKey, item.sourceFile, item.sourceAlias].some((value) =>
      [identity.sourceKey, identity.sourceFile, identity.alias, row.uniqueId]
        .filter(Boolean)
        .some((candidate) => atlasDisplaySameToken(candidate, value)),
    );
  const attached = matches.filter((item) => item.attached && sameSource(item));
  if (attached.length === 1) return attached[0];
  const standalone = matches.filter((item) => !item.attached);
  return standalone.length === 1 ? standalone[0] : null;
}
function atlasDisplayCreatedFieldContext(row) {
  const created = atlasDisplayCreatedMatch(row);
  if (!created) return null;
  const attached = Boolean(created.attached);
  const sourceColor = attached
    ? created.sourceColor ||
      atlasDisplayResolvedSourceColor({
        sourceKey: created.sourceKey,
        sourceFile: created.sourceFile,
        alias: created.sourceAlias,
      }) ||
      ATLAS_CALCULATED_COLOR
    : created.sourceColor || ATLAS_CALCULATED_COLOR;
  return {
    canonicalKey: `calculated:${created.creatorStepId}`,
    creatorStepId: created.creatorStepId,
    attached,
    identity: {
      sourceKey: "calculated-field",
      sourceFile: "Calculated Field",
      alias: "Calculated Field",
    },
    sourceColor,
  };
}
function atlasDisplayCanonicalKey(row, calculated) {
  const context = calculated ? atlasDisplayCreatedFieldContext(row) : null;
  return context?.canonicalKey || atlasDisplayKey(row);
}
function atlasDisplayPreferences(
  audit = atlasDisplayDocument?.() || state.audit,
) {
  if (Array.isArray(audit?.displayFields)) return audit.displayFields;
  if (audit === state.audit) state.audit.displayFields = [];
  return [];
}
function atlasDisplayLogicKeys() {
  return new Set(
    requirementsLogicFieldReferences().map((item) =>
      atlasDisplayKey({
        sourceFile:
          requirementsSourceIdentity(item.sourceFile).sourceKey ||
          item.sourceFile,
        fieldName: item.fieldName,
      }),
    ),
  );
}
function atlasDisplayCatalogRow(preference) {
  const identity = requirementsSourceIdentity(
    preference.sourceFile || preference.sourceKey,
  );
  const field = (
    fieldsForSource?.(identity.sourceFile || preference.sourceFile) || []
  ).find((item) =>
    [item.rawFieldName, item.fieldName, item.name, item.label].some(
      (value) =>
        atlasDisplayPart(value) === atlasDisplayPart(preference.fieldName),
    ),
  );
  return {
    uniqueId:
      identity.sourceKey || preference.sourceKey || preference.sourceFile || "",
    sourceFile: identity.sourceFile || preference.sourceFile || "",
    fieldTitle:
      field?.rawFieldName ||
      field?.fieldName ||
      field?.name ||
      preference.fieldName ||
      "",
    vanityLabel:
      field?.auditSpecificVanityLabel ||
      field?.vanityLabel ||
      field?.globalVanityLabel ||
      field?.label ||
      preference.fieldName ||
      "",
    displayFormat:
      field?.displayFormat || field?.formatting || field?.format || "",
    dataCategory: field?.dataCategory || field?.category || "",
    notes: "",
  };
}
function atlasDisplayRows(options = {}) {
  const base = atlasOriginalRequirementsFieldRows(options),
    prefs = atlasDisplayPreferences(),
    logic = atlasDisplayLogicKeys(),
    rows = new Map();
  base.forEach((row, index) => {
    const context = atlasDisplayCreatedFieldContext(row),
      calculated =
        Boolean(context) ||
        !row.uniqueId ||
        atlasDisplayPart(row.uniqueId) === "calculated field",
      key = context?.canonicalKey || atlasDisplayKey(row),
      legacyKey = atlasDisplayKey(row),
      matching = prefs.filter(
        (item) =>
          atlasDisplayCanonicalKey(item, calculated) === key ||
          atlasDisplayKey(item) === legacyKey,
      ),
      saved = matching.length === 1 ? matching[0] : null,
      identity = calculated
        ? context?.identity || {
            sourceKey: "calculated-field",
            sourceFile: "Calculated Field",
            alias: "Calculated Field",
          }
        : requirementsSourceIdentity(row.uniqueId || row.sourceFile),
      sourceColor = calculated
        ? context?.sourceColor || "#7da2d8"
        : atlasDisplayResolvedSourceColor({
            sourceKey: identity.sourceKey || row.uniqueId,
            sourceFile: identity.sourceFile,
            alias: identity.ambiguous ? "" : identity.alias,
          });
    if (saved?.removed || rows.has(key)) return;
    rows.set(key, {
      ...row,
      uniqueId: calculated ? "Calculated Field" : row.uniqueId || "",
      sourceFile: calculated
        ? "Calculated Field"
        : identity.sourceFile || row.uniqueId || "",
      sourceAlias: calculated
        ? "Calculated Field"
        : identity.alias || row.uniqueId || "",
      key,
      canonicalKey: context?.canonicalKey || "",
      creatorStepId: context?.creatorStepId || "",
      calculated,
      attachedCalculated: Boolean(context?.attached),
      sourceColor,
      usedInLogic: calculated || logic.has(legacyKey),
      manuallyAttached: false,
      displayed: saved ? saved.displayed !== false : true,
      order: saved?.order ?? index,
    });
  });
  prefs.forEach((pref, index) => {
    const row = atlasDisplayCatalogRow(pref),
      context = atlasDisplayCreatedFieldContext({
        ...row,
        sourceFile: pref.sourceFile,
        sourceKey: pref.sourceKey,
        canonicalKey: pref.canonicalKey,
      }),
      calculated =
        Boolean(context) ||
        atlasDisplayPart(pref.sourceFile) === "calculated field" ||
        atlasDisplayPart(pref.sourceKey) === "calculated-field" ||
        atlasDisplayPart(pref.canonicalKey).startsWith("calculated:"),
      key = context?.canonicalKey || atlasDisplayKey(pref);
    if (pref.removed || rows.has(key)) return;
    const identity = calculated
        ? context?.identity || {
            sourceKey: "calculated-field",
            sourceFile: "Calculated Field",
            alias: "Calculated Field",
          }
        : requirementsSourceIdentity(pref.sourceKey || pref.sourceFile),
      sourceColor = calculated
        ? context?.sourceColor || "#7da2d8"
        : atlasDisplayResolvedSourceColor({
            sourceKey: pref.sourceKey || identity.sourceKey,
            sourceFile: identity.sourceFile,
            alias: identity.ambiguous ? "" : identity.alias,
          });
    rows.set(key, {
      ...row,
      uniqueId: calculated ? "Calculated Field" : row.uniqueId || "",
      sourceFile: calculated ? "Calculated Field" : row.sourceFile,
      sourceAlias: calculated
        ? "Calculated Field"
        : identity.alias || row.sourceFile,
      key,
      canonicalKey: context?.canonicalKey || pref.canonicalKey || "",
      creatorStepId: context?.creatorStepId || "",
      calculated,
      attachedCalculated: Boolean(context?.attached),
      sourceColor,
      usedInLogic: calculated || logic.has(atlasDisplayKey(pref)),
      manuallyAttached: !logic.has(atlasDisplayKey(pref)) && !calculated,
      displayed: pref.displayed !== false,
      order: pref.order ?? base.length + index,
    });
  });
  return [...rows.values()]
    .sort(
      (a, b) => a.order - b.order || a.fieldTitle.localeCompare(b.fieldTitle),
    )
    .map((row, index) => ({
      ...row,
      rowNumber: index + 1,
      display: row.displayed ? "Yes" : "No",
    }));
}
requirementsFieldRows = function requirementsFieldRowsWithDisplaySelection(
  options = {},
) {
  const rows = atlasDisplayRows(options);
  return options.includeHidden ? rows : rows.filter((row) => row.displayed);
};
function atlasSaveDisplayField(row, displayed) {
  if (atlasIsReviewerMode?.()) return;
  const prefs = atlasDisplayPreferences(state.audit),
    key = row.key || atlasDisplayKey(row),
    existing = prefs.find(
      (item) =>
        atlasDisplayKey(item) === key ||
        atlasDisplayCanonicalKey(item, row.calculated) === key,
    ),
    value = {
      canonicalKey: row.canonicalKey || existing?.canonicalKey || "",
      sourceKey:
        existing?.sourceKey || row.uniqueId || row.sourceFile || "",
      sourceFile:
        existing?.sourceFile || row.sourceFile || row.uniqueId || "",
      fieldName: existing?.fieldName || row.fieldTitle,
      displayed: !!displayed,
      removed: false,
      order: row.order ?? existing?.order ?? prefs.length,
    };
  existing ? Object.assign(existing, value) : prefs.push(value);
}
const ATLAS_DISPLAY_LOGIC_DELETE_REASON =
  "This field is referenced in logic and cannot be deleted from Display Fields.";
function atlasDisplayFieldDeleteControl(row) {
  const label = `Delete ${row.vanityLabel || row.fieldTitle} from Display Fields`;
  if (!row.usedInLogic) {
    return `<button type="button" class="secondary small display-field-delete" data-display-field-delete="${esc(row.key)}" aria-label="${esc(label)}">Delete</button>`;
  }
  const reason = esc(ATLAS_DISPLAY_LOGIC_DELETE_REASON);
  return `<span class="display-field-delete-lock" title="${reason}"><button type="button" class="secondary small display-field-delete" disabled aria-disabled="true" data-display-field-delete="${esc(row.key)}" aria-label="${esc(label)}" title="${reason}">Delete</button></span>`;
}
function atlasDisplayFieldMeta(row) {
  const parts = [row.vanityLabel, row.displayFormat, row.dataCategory]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  parts.push(row.usedInLogic ? "Used in logic" : "Not used in logic");
  return parts.map((part) => esc(part)).join(" · ");
}
let atlasDisplayRowCache = new Map();
function atlasDisplayCachedRow(key) {
  return (
    atlasDisplayRowCache.get(key) ||
    requirementsFieldRows({ includeHidden: true, includeNotes: false }).find(
      (item) => item.key === key,
    )
  );
}
function atlasSyncDisplayFieldsToolbar(rows) {
  const hidden = rows.filter((row) => !row.displayed).length,
    all = $("displayAllFieldsBtn");
  if (all) {
    all.disabled = hidden === 0;
    all.title = rows.length
      ? hidden
        ? ""
        : "Every field is already displayed."
      : "Add a field first.";
  }
  ["displayFieldsSortSourceBtn", "displayFieldsSortAlphaBtn"].forEach((id) => {
    const button = $(id);
    if (!button) return;
    button.disabled = rows.length < 2;
    button.title = rows.length < 2 ? "Add at least two fields to sort." : "";
  });
}
function renderDisplayFieldsPage() {
  const host = $("displayFieldsTable");
  if (!host) return;
  const rows = requirementsFieldRows({
    includeHidden: true,
    includeNotes: false,
  });
  atlasDisplayRowCache = new Map(rows.map((row) => [row.key, row]));
  atlasSyncDisplayFieldsToolbar(rows);
  const pill = (value, row, kind) => {
    const locked = kind === "field" && row.usedInLogic;
    const classes = [
      "display-field-pill",
      `${kind}-pill`,
      row.calculated ? "calculated-field-pill" : "",
      locked ? "is-logic-locked" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const badge =
      row.calculated && kind !== "source"
        ? '<span class="display-field-pill-badge">Calculated</span>'
        : "";
    const reason = locked
      ? ` title="${esc(ATLAS_DISPLAY_LOGIC_DELETE_REASON)}"`
      : "";
    const color = row.sourceColor || "";
    const swatch = kind === "source" && color ? esc(color) : "";
    const style = swatch
      ? ` style="--source-pill-color:${swatch};--source-color:${swatch};--display-field-color:${swatch}"`
      : ` style="--display-field-color:${esc(color || "#7da2d8")}"`;
    const dot = swatch
      ? '<span class="source-color-dot" aria-hidden="true"></span>'
      : "";
    return `<span class="${classes}"${reason}${style}>${dot}${esc(value)}${badge}</span>`;
  };
  host.innerHTML = rows.length
    ? `<div class="display-fields-table-wrap"><table class="display-fields-table"><thead><tr><th scope="col" aria-label="Reorder"></th><th>Source</th><th>Field Title</th><th class="display-field-col-detail">Vanity Label</th><th class="display-field-col-detail">Display Format</th><th class="display-field-col-detail">Data Category</th><th class="display-field-col-detail">Used in Logic</th><th>Displayed</th></tr></thead><tbody>${rows
        .map(
          (row) =>
            `<tr class="${row.usedInLogic ? "display-field-logic-locked" : ""}" draggable="true" data-display-field-row="${esc(row.key)}"><td><span class="display-field-drag-handle" draggable="true" tabindex="0" role="button" aria-label="Reorder ${esc(row.vanityLabel || row.fieldTitle)}" title="Drag to reorder or use Alt+Up and Alt+Down">⋮⋮</span></td><td>${pill(row.sourceAlias || row.uniqueId || "Calculated Field", row, "source")}</td><td class="display-field-identity">${pill(row.fieldTitle, row, "field")}<div class="display-field-meta">${atlasDisplayFieldMeta(row)}</div></td><td class="display-field-col-detail">${esc(row.vanityLabel)}</td><td class="display-field-col-detail">${esc(row.displayFormat)}</td><td class="display-field-col-detail">${esc(row.dataCategory)}</td><td class="display-field-col-detail">${row.usedInLogic ? "Yes" : "No"}</td><td><div class="display-fields-actions"><label class="display-fields-switch"><input type="checkbox" role="switch" data-display-field-toggle="${esc(row.key)}" aria-label="Include ${esc(row.vanityLabel || row.fieldTitle)} in preview and export" ${row.displayed ? "checked" : ""}><span class="display-fields-switch-track" aria-hidden="true"></span><span data-display-field-switch-label>${row.displayed ? "Displayed" : "Hidden"}</span></label>${atlasDisplayFieldDeleteControl(row)}</div></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="empty-state"><strong>No fields are available.</strong><p>Add logic fields or select a display-only field from an included source.</p></div>`;
  const audit = atlasDisplayDocument?.() || state.audit,
    enabled = (audit.sources || []).length > 0,
    button = $("addDisplayFieldBtn");
  if (button) {
    button.disabled = !enabled;
    button.title = enabled ? "" : "Add a source to this audit first.";
  }
}
function atlasDisplayPickerSources() {
  const audit = atlasDisplayDocument?.() || state.audit;
  return (audit.sources || []).map((source) =>
    requirementsSourceIdentity(source),
  );
}
function atlasDisplayPickerEntries() {
  const selectedKeys = new Set(
    atlasDisplayRows({ includeHidden: true }).map((row) => row.key),
  );
  const calculatedSourceKey =
    typeof ATLAS_CREATED_SOURCE === "string"
      ? ATLAS_CREATED_SOURCE
      : "calculated-fields";
  const sourceEntries = atlasDisplayPickerSources().flatMap((identity) => {
    const sourceFile = identity.sourceFile || identity.sourceKey || "";
    const sourceColor =
      atlasDisplayResolvedSourceColor(identity) ||
      atlasDisplaySourceColor(identity);
    return (fieldsForSource?.(sourceFile) || [])
      .filter((field) => !field.isCreatedField)
      .map((field) => {
        const fieldName =
          field.rawFieldName ||
          field.fieldName ||
          field.name ||
          field.label ||
          "";
        const created = Boolean(field.isCreatedField);
        const key =
          created && field.creatorStepId
            ? `calculated:${field.creatorStepId}`
            : atlasDisplayKey({
                sourceKey: identity.sourceKey,
                sourceFile,
                fieldName,
              });
        return {
          key,
          label:
            field.auditSpecificVanityLabel ||
            field.vanityLabel ||
            field.globalVanityLabel ||
            field.label ||
            fieldName,
          rawName: fieldName,
          sourceKey: created
            ? identity.sourceKey || field.sourceKey || sourceFile
            : identity.sourceKey || sourceFile,
          sourceLabel:
            identity.alias || sourceFile || identity.sourceKey || "Other",
          sourceColor: created
            ? field.sourceColor || sourceColor
            : sourceColor,
          custom: created,
          badge: created ? "Custom" : "",
          creatorStepId: field.creatorStepId || "",
          disabled: selectedKeys.has(key),
        pickerSource: sourceFile,
        pickerField: fieldName,
      };
    });
  });
  const createdFields =
    typeof atlasCreatedFieldEntries === "function"
      ? atlasCreatedFieldEntries({ includeUnavailable: true })
      : [];
  const attached = createdFields
    .filter((field) => field.attached)
    .map((field) => {
      const identity = atlasDisplayPickerSources().find((source) =>
        [source.sourceKey, source.sourceFile, source.alias].some((value) =>
          [field.sourceKey, field.sourceFile, field.sourceAlias].some(
            (candidate) => atlasDisplaySameToken(value, candidate),
          ),
        ),
      );
      const sourceFile =
        identity?.sourceFile || field.sourceFile || field.sourceKey || "";
      const key = field.creatorStepId
        ? `calculated:${field.creatorStepId}`
        : atlasDisplayKey({
            sourceKey: identity?.sourceKey || field.sourceKey,
            sourceFile,
            fieldName: field.fieldName,
          });
      return {
        key,
        label: field.vanityLabel || field.label || field.fieldName,
        rawName: field.fieldName,
        sourceKey: identity?.sourceKey || field.sourceKey || sourceFile,
        sourceLabel:
          identity?.alias || field.sourceAlias || sourceFile || "Other",
        sourceColor:
          field.sourceColor ||
          (identity ? atlasDisplayResolvedSourceColor(identity) : "") ||
          "#7da2d8",
        custom: true,
        badge: "Custom",
        creatorStepId: field.creatorStepId || "",
        disabled: selectedKeys.has(key),
        pickerSource: sourceFile,
        pickerField: field.fieldName,
      };
    });
  const standalone = createdFields
    .filter((field) => !field.attached)
    .map((field) => {
      const key = field.creatorStepId
        ? `calculated:${field.creatorStepId}`
        : atlasDisplayKey({
            sourceKey: "calculated-field",
            fieldName: field.fieldName,
          });
      return {
        key,
        label: field.vanityLabel || field.label || field.fieldName,
        rawName: field.fieldName,
        sourceKey: calculatedSourceKey,
        sourceLabel: "Calculated Fields",
        sourceColor: field.sourceColor || "#7da2d8",
        custom: true,
        badge: "Custom",
        creatorStepId: field.creatorStepId || "",
        disabled: selectedKeys.has(key),
        pickerSource: calculatedSourceKey,
        pickerField: field.fieldName,
      };
    });
  return [...sourceEntries, ...attached, ...standalone];
}
function atlasOpenDisplayPicker() {
  if (!window.ATLASVisualPicker?.open) {
    console.error("ATLAS Display Fields: shared Visual Picker is unavailable.");
    status?.(
      "The field picker is unavailable. Reload the page and try again.",
      "error",
    );
    return false;
  }
  return window.ATLASVisualPicker.open({
    mode: "field",
    title: "Visual Field Picker",
    guidance:
      "Select one or more fields from sources included in this audit.",
    searchPlaceholder: "Search selected sources and fields...",
    entries: atlasDisplayPickerEntries(),
    sort: "source",
    multiple: true,
    selectAll: true,
    selectionNoun: "field",
    closeOnSelect: false,
    onSelect(entry) {
      const entries = Array.isArray(entry) ? entry : entry ? [entry] : [];
      if (!entries.length) return;
      atlasAddDisplayFields(entries);
    },
  });
}
function atlasStageCreatedDisplayField(entry) {
  const fieldName = entry?.pickerField || entry?.rawName || "";
  const key = String(entry?.key || "");
  if (!fieldName || !key.startsWith("calculated:")) {
    return {
      ok: false,
      stale: true,
      message:
        "That field is no longer available. Reopen the picker and try again.",
    };
  }
  if (
    atlasDisplayRows({ includeHidden: true }).some((row) => row.key === key)
  ) {
    return {
      ok: false,
      message: "That field is already included in Display Fields.",
    };
  }
  return {
    ok: true,
    fieldName,
    key,
    row: {
      uniqueId: "Calculated Field",
      sourceKey: "calculated-field",
      sourceFile: "Calculated Field",
      fieldTitle: fieldName,
      canonicalKey: key,
      creatorStepId: entry.creatorStepId || key.slice("calculated:".length),
      order: atlasDisplayPreferences().length,
    },
  };
}
function atlasStageDisplayField(sourceFile, fieldName, entry = null) {
  if (entry?.custom) return atlasStageCreatedDisplayField(entry);
  const identity = atlasDisplayPickerSources().find((source) =>
    [source.sourceFile, source.sourceKey, source.alias]
      .filter(Boolean)
      .includes(sourceFile),
  );
  const field = identity
    ? (fieldsForSource?.(identity.sourceFile || sourceFile) || []).find(
        (item) =>
          [item.rawFieldName, item.fieldName, item.name, item.label].some(
            (value) => atlasDisplayPart(value) === atlasDisplayPart(fieldName),
          ),
      )
    : null;
  const resolvedFieldName =
    field?.rawFieldName ||
    field?.fieldName ||
    field?.name ||
    field?.label ||
    "";
  if (!identity || !field || !resolvedFieldName) {
    return {
      ok: false,
      stale: true,
      identity,
      field,
      message:
        "That field is no longer available. Reopen the picker and try again.",
    };
  }
  const sourceFileName = identity.sourceFile || sourceFile;
  const key = atlasDisplayKey({
    sourceKey: identity.sourceKey,
    sourceFile: sourceFileName,
    fieldName: resolvedFieldName,
  });
  if (
    atlasDisplayRows({ includeHidden: true }).some((row) => row.key === key)
  ) {
    return {
      ok: false,
      message: "That field is already included in Display Fields.",
    };
  }
  return {
    ok: true,
    fieldName: resolvedFieldName,
    key,
    row: {
      uniqueId: identity.sourceKey || sourceFile,
      sourceFile: sourceFileName,
      fieldTitle: resolvedFieldName,
      order: atlasDisplayPreferences().length,
    },
  };
}
function atlasAddDisplayField(sourceFile, fieldName, entry = null) {
  if (atlasIsReviewerMode?.()) return;
  const staged = atlasStageDisplayField(sourceFile, fieldName, entry);
  if (!staged.ok) {
    if (staged.stale)
      console.error(
        "ATLAS Display Fields: rejected a stale or invalid picker entry.",
        {
          sourceAvailable: Boolean(staged.identity),
          fieldAvailable: Boolean(staged.field),
        },
      );
    status?.(staged.message, "error");
    return false;
  }
  atlasSaveDisplayField(staged.row, true);
  scheduleAutosave?.();
  atlasInvalidatePages?.(["display-fields", "preview", "export"]);
  renderDisplayFieldsPage();
  renderRequirementsFieldsPreview?.();
  globalThis.ATLASAuditIssues?.render?.();
  window.ATLASVisualPicker.close("select");
  status?.(`Added ${staged.fieldName} to displayed fields.`, "ok");
  return true;
}
function atlasAddDisplayFields(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
  if (list.length <= 1) {
    const entry = list[0];
    if (!entry) return false;
    return atlasAddDisplayField(entry.pickerSource, entry.pickerField, entry);
  }
  if (atlasIsReviewerMode?.()) return;
  const added = [];
  let firstError = "";
  for (const entry of list) {
    const staged = atlasStageDisplayField(
      entry.pickerSource,
      entry.pickerField,
      entry,
    );
    if (!staged.ok) {
      if (!firstError) firstError = staged.message;
      if (staged.stale)
        console.error(
          "ATLAS Display Fields: rejected a stale or invalid picker entry.",
          {
            sourceAvailable: Boolean(staged.identity),
            fieldAvailable: Boolean(staged.field),
          },
        );
      continue;
    }
    atlasSaveDisplayField(staged.row, true);
    added.push(staged.fieldName);
  }
  if (!added.length) {
    status?.(
      firstError ||
        "Those fields are no longer available. Reopen the picker and try again.",
      "error",
    );
    return false;
  }
  scheduleAutosave?.();
  atlasInvalidatePages?.(["display-fields", "preview", "export"]);
  renderDisplayFieldsPage();
  renderRequirementsFieldsPreview?.();
  globalThis.ATLASAuditIssues?.render?.();
  if (added.length === list.length) {
    window.ATLASVisualPicker.close("select");
    status?.(`Added ${added.length} fields to displayed fields.`, "ok");
    return true;
  }
  window.ATLASVisualPicker.setEntries?.(atlasDisplayPickerEntries());
  status?.(
    `Added ${added.length} of ${list.length} fields. ${firstError}`,
    "warn",
  );
  return false;
}
function atlasPersistDisplayFieldOrder(rows) {
  if (atlasIsReviewerMode?.()) return;
  rows.forEach((row, order) =>
    atlasSaveDisplayField({ ...row, order }, row.displayed),
  );
  scheduleAutosave?.();
  atlasInvalidatePages?.(["display-fields", "preview", "export"]);
}
function atlasMoveDisplayField(sourceKey, targetKey) {
  if (atlasIsReviewerMode?.()) return;
  const rows = requirementsFieldRows({
      includeHidden: true,
      includeNotes: false,
    }),
    from = rows.findIndex((row) => row.key === sourceKey),
    to = rows.findIndex((row) => row.key === targetKey);
  if (from < 0 || to < 0 || from === to) return false;
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  atlasPersistDisplayFieldOrder(rows);
  renderDisplayFieldsPage();
  renderRequirementsFieldsPreview?.();
  globalThis.ATLASAuditIssues?.render?.();
  return true;
}
let atlasDraggedDisplayFieldKey = "";
document.addEventListener("dragstart", (event) => {
  const handle = event.target.closest?.(".display-field-drag-handle"),
    row = handle?.closest("[data-display-field-row]");
  if (!row) return;
  atlasDraggedDisplayFieldKey = row.dataset.displayFieldRow || "";
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", atlasDraggedDisplayFieldKey);
  row.classList.add("display-field-dragging");
});
document.addEventListener("dragover", (event) => {
  const row = event.target.closest?.("[data-display-field-row]");
  if (!row || !atlasDraggedDisplayFieldKey) return;
  event.preventDefault();
  document
    .querySelectorAll(".display-field-drop-target")
    .forEach((item) => item.classList.remove("display-field-drop-target"));
  row.classList.add("display-field-drop-target");
});
document.addEventListener("drop", (event) => {
  const row = event.target.closest?.("[data-display-field-row]");
  if (!row || !atlasDraggedDisplayFieldKey) return;
  event.preventDefault();
  atlasMoveDisplayField(
    atlasDraggedDisplayFieldKey,
    row.dataset.displayFieldRow,
  );
  atlasDraggedDisplayFieldKey = "";
});
document.addEventListener("dragend", () => {
  atlasDraggedDisplayFieldKey = "";
  document
    .querySelectorAll(".display-field-dragging, .display-field-drop-target")
    .forEach((item) =>
      item.classList.remove(
        "display-field-dragging",
        "display-field-drop-target",
      ),
    );
});
document.addEventListener("keydown", (event) => {
  const handle = event.target.closest?.(".display-field-drag-handle");
  if (!handle || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key))
    return;
  const row = handle.closest("#displayFieldsTable [data-display-field-row]");
  if (!row) return;
  const rows = [
      ...document.querySelectorAll(
        "#displayFieldsTable [data-display-field-row]",
      ),
    ],
    index = rows.indexOf(row),
    target = rows[index + (event.key === "ArrowUp" ? -1 : 1)];
  if (!target) return;
  event.preventDefault();
  const key = row.dataset.displayFieldRow;
  if (atlasMoveDisplayField(key, target.dataset.displayFieldRow))
    [
      ...document.querySelectorAll(
        "#displayFieldsTable [data-display-field-row]",
      ),
    ]
      .find((item) => item.dataset.displayFieldRow === key)
      ?.querySelector(".display-field-drag-handle")
      ?.focus();
});
function atlasCapturePageScroll() {
  return {
    top: window.scrollY,
    left: window.scrollX,
    nodes: [".main", "#page-display-fields", ".display-fields-table-wrap"]
      .map((selector) => {
        const element = document.querySelector(selector);
        return element
          ? { selector, top: element.scrollTop, left: element.scrollLeft }
          : null;
      })
      .filter(Boolean),
  };
}
function atlasRestorePageScroll(point) {
  if (!point) return;
  const apply = () => {
    window.scrollTo({ left: point.left, top: point.top, behavior: "auto" });
    point.nodes.forEach((node) => {
      const element = document.querySelector(node.selector);
      if (!element) return;
      element.scrollTop = node.top;
      element.scrollLeft = node.left;
    });
  };
  apply();
  requestAnimationFrame(apply);
}
function atlasDisplayPreferenceIndexes(row) {
  return atlasDisplayPreferences()
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        atlasDisplayCanonicalKey(item, row.calculated) === row.key ||
        atlasDisplayKey(item) === row.key,
    );
}
function atlasRemoveDisplayField(row) {
  if (atlasIsReviewerMode?.()) return;
  if (row?.usedInLogic) {
    status?.(ATLAS_DISPLAY_LOGIC_DELETE_REASON, "warn");
    return false;
  }
  const prefs = atlasDisplayPreferences();
  const matches = atlasDisplayPreferenceIndexes(row);
  const rows = [
    ...document.querySelectorAll("#displayFieldsTable [data-display-field-row]"),
  ];
  const index = rows.findIndex(
    (item) => item.dataset.displayFieldRow === row.key,
  );
  const focusKey =
    rows[index + 1]?.dataset.displayFieldRow ||
    rows[index - 1]?.dataset.displayFieldRow ||
    "";
  if (matches.length > 1) {
    status?.(
      "This Display Field has ambiguous saved preferences and was not removed.",
      "warn",
    );
    return false;
  }
  if (row.manuallyAttached) {
    if (matches.length !== 1) {
      status?.(
        "The saved Display Field preference could not be found.",
        "warn",
      );
      return false;
    }
    prefs.splice(matches[0].index, 1);
  } else if (matches.length === 1) {
    matches[0].item.removed = true;
    matches[0].item.displayed = false;
  } else {
    prefs.push({
      canonicalKey: row.canonicalKey || "",
      sourceKey: row.uniqueId || row.sourceFile || "",
      sourceFile: row.sourceFile || row.uniqueId || "",
      fieldName: row.fieldTitle,
      displayed: false,
      removed: true,
      order: row.order ?? prefs.length,
    });
  }
  const point = atlasCapturePageScroll();
  scheduleAutosave?.();
  atlasInvalidatePages?.(["display-fields", "preview", "export"]);
  renderDisplayFieldsPage();
  renderRequirementsFieldsPreview?.();
  globalThis.ATLASAuditIssues?.render?.();
  atlasRestorePageScroll(point);
  const next = [
    ...document.querySelectorAll("#displayFieldsTable [data-display-field-row]"),
  ].find(
    (item) => item.dataset.displayFieldRow === focusKey,
  );
  (
    next?.querySelector("[data-display-field-delete]") ||
    $("addDisplayFieldBtn")
  )?.focus({ preventScroll: true });
  status?.(
    `Removed ${row.vanityLabel || row.fieldTitle} from Display Fields.`,
    "ok",
  );
  return true;
}
document.addEventListener("click", (event) => {
  if (event.target.closest("#addDisplayFieldBtn")) atlasOpenDisplayPicker();
  const deleteButton = event.target.closest("[data-display-field-delete]");
  if (!deleteButton || deleteButton.disabled) return;
  const row = requirementsFieldRows({
    includeHidden: true,
    includeNotes: false,
  }).find((item) => item.key === deleteButton.dataset.displayFieldDelete);
  if (!row) {
    status?.(
      "That Display Field is no longer available. Refresh and try again.",
      "warn",
    );
    return;
  }
  atlasRemoveDisplayField(row);
});
function atlasDisplayPreviewVisible() {
  return !!$("requirementsFieldsPreview")?.closest(".page.active");
}
function atlasCommitDisplayFieldChange({ rerender = false } = {}) {
  scheduleAutosave?.();
  atlasInvalidatePages?.(
    rerender ? ["display-fields", "preview", "export"] : ["preview", "export"],
  );
  if (rerender) renderDisplayFieldsPage();
  // The preview page re-renders on its next visit; only refresh it now when it
  // is on screen, and then in the next frame so the click is never blocked.
  if (atlasDisplayPreviewVisible()) atlasRequestRender?.({ preview: true });
}
function atlasSetDisplayFieldsStatus(message, kind = "", undo = null) {
  const host = $("displayFieldsStatus");
  if (!host) return status?.(message, kind);
  host.className = `status ${kind}`.trim();
  host.innerHTML = `<span>${esc(message)}</span>${
    undo
      ? ' <button type="button" class="btn secondary small" data-display-fields-undo>Undo</button>'
      : ""
  }`;
  atlasDisplayFieldsUndo = undo;
}
let atlasDisplayFieldsUndo = null;
function atlasDisplayAllFields() {
  if (atlasIsReviewerMode?.()) return 0;
  const hidden = [...atlasDisplayRowCache.values()].filter(
    (row) => !row.displayed,
  );
  if (!hidden.length) return 0;
  const previous = hidden.map((row) => row.key);
  hidden.forEach((row) => atlasSaveDisplayField(row, true));
  const point = atlasCapturePageScroll();
  atlasCommitDisplayFieldChange({ rerender: true });
  atlasRestorePageScroll(point);
  atlasSetDisplayFieldsStatus(
    `${hidden.length} ${hidden.length === 1 ? "field" : "fields"} set to Displayed.`,
    "ok",
    () => {
      previous.forEach((key) => {
        const row = atlasDisplayRowCache.get(key);
        if (row) atlasSaveDisplayField(row, false);
      });
      return `${previous.length} ${previous.length === 1 ? "field" : "fields"} hidden again.`;
    },
  );
  return hidden.length;
}
function atlasDisplaySortLabel(value) {
  return String(value || "").trim();
}
const atlasDisplayCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});
function atlasSortedDisplayRows(rows, mode) {
  // Standalone calculated fields carry a placeholder source label; group them
  // with blank sources after every real source.
  const source = (row) => {
      const label = atlasDisplaySortLabel(row.sourceAlias || row.uniqueId);
      return label && label.toLowerCase() !== "calculated field"
        ? label
        : "\uffff";
    },
    title = (row) => atlasDisplaySortLabel(row.fieldTitle),
    bySource = (a, b) => atlasDisplayCollator.compare(source(a), source(b)),
    byTitle = (a, b) => atlasDisplayCollator.compare(title(a), title(b));
  return [...rows].sort((a, b) =>
    mode === "alpha"
      ? byTitle(a, b) || bySource(a, b)
      : bySource(a, b) ||
        Number(!!a.calculated) - Number(!!b.calculated) ||
        byTitle(a, b),
  );
}
function atlasSortDisplayFields(mode) {
  if (atlasIsReviewerMode?.()) return false;
  const rows = [...atlasDisplayRowCache.values()];
  if (rows.length < 2) return false;
  const previous = rows.map((row) => row.key);
  const point = atlasCapturePageScroll();
  atlasPersistDisplayFieldOrder(atlasSortedDisplayRows(rows, mode));
  atlasCommitDisplayFieldChange({ rerender: true });
  atlasRestorePageScroll(point);
  atlasSetDisplayFieldsStatus(
    mode === "alpha" ? "Sorted A–Z by field title." : "Sorted by source.",
    "ok",
    () => {
      const restored = previous
        .map((key) => atlasDisplayRowCache.get(key))
        .filter(Boolean);
      atlasPersistDisplayFieldOrder(restored);
      return "Previous order restored.";
    },
  );
  return true;
}
document.addEventListener("click", (event) => {
  if (event.target.closest("#displayAllFieldsBtn")) {
    atlasDisplayAllFields();
    return;
  }
  const sort = event.target.closest("[data-display-fields-sort]");
  if (sort) {
    atlasSortDisplayFields(sort.dataset.displayFieldsSort);
    return;
  }
  if (!event.target.closest("[data-display-fields-undo]")) return;
  const undo = atlasDisplayFieldsUndo;
  if (!undo || atlasIsReviewerMode?.()) return;
  const point = atlasCapturePageScroll();
  const message = undo();
  atlasCommitDisplayFieldChange({ rerender: true });
  atlasRestorePageScroll(point);
  atlasSetDisplayFieldsStatus(message, "ok");
  $("displayAllFieldsBtn")?.focus({ preventScroll: true });
});
document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-display-field-toggle]")) return;
  const toggle = event.target,
    displayed = toggle.checked,
    row = atlasDisplayCachedRow(toggle.dataset.displayFieldToggle);
  if (!row) {
    toggle.checked = !displayed;
    status?.(
      "That Display Field is no longer available. Refresh and try again.",
      "warn",
    );
    return;
  }
  const label = toggle
    .closest(".display-fields-switch")
    ?.querySelector("[data-display-field-switch-label]");
  if (label) label.textContent = displayed ? "Displayed" : "Hidden";
  atlasSaveDisplayField(row, displayed);
  row.displayed = displayed;
  row.display = displayed ? "Yes" : "No";
  atlasSyncDisplayFieldsToolbar([...atlasDisplayRowCache.values()]);
  atlasCommitDisplayFieldChange();
});
const atlasOriginalRenderPage = atlasRenderPage;
atlasRenderPage = function atlasRenderPageWithDisplayFields(
  page,
  options = {},
) {
  const target = pageForSection?.(page) || page;
  if (target === "display-fields") {
    renderDisplayFieldsPage();
    atlasPageRenderState.dirty.delete(target);
    atlasPageRenderState.initialized.add(target);
    return;
  }
  return atlasOriginalRenderPage(page, options);
};
const atlasStepsFlowIndex = AUDIT_FLOW_PAGES.findIndex(
  (item) => item.page === "steps",
);
if (
  atlasStepsFlowIndex >= 0 &&
  !AUDIT_FLOW_PAGES.some((item) => item.page === "display-fields")
) {
  AUDIT_FLOW_PAGES[atlasStepsFlowIndex].nextLabel = "Display Fields";
  AUDIT_FLOW_PAGES.splice(atlasStepsFlowIndex + 1, 0, {
    page: "display-fields",
    label: "Display Fields",
    nextLabel: "Requirements Preview",
  });
}
