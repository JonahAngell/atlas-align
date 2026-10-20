/**
 * Canonical source identity resolver.
 * Resolves legacy names and aliases against the catalog while preserving the
 * stable key, physical file name, and display alias as separate values.
 */
function atlasResolveSourceIdentity(sourceLike = {}, catalog = null) {
  const input =
    typeof sourceLike === "string" ? { name: sourceLike } : sourceLike || {};
  const clean = (value) => String(value || "").trim();
  const normalize = (value) => clean(value).toLowerCase();
  const catalogSources = Array.isArray(catalog)
    ? catalog
    : typeof repoLibraryState !== "undefined" &&
        Array.isArray(repoLibraryState?.sourceFiles)
      ? repoLibraryState.sourceFiles
      : [];
  const uniqueMatches = (inputValues, sourceValues) => {
    const wanted = new Set(inputValues.map(normalize).filter(Boolean));
    if (!wanted.size) return [];
    return catalogSources.filter((source) =>
      sourceValues(source)
        .map(normalize)
        .filter(Boolean)
        .some((value) => wanted.has(value)),
    );
  };
  const stableValues = (source) => [
    source.sourceKey,
    source.catalogKey,
    source.sourceReferenceId,
    source.id,
  ];
  const fallbackValues = (source) => [
    source.alias,
    source.sourceFile,
    source.file,
    source.name,
  ];
  const inputStableValues = stableValues(input);
  let matches = uniqueMatches(inputStableValues, stableValues);
  if (matches.length !== 1)
    matches = uniqueMatches(inputStableValues, fallbackValues);
  if (matches.length !== 1) {
    matches = uniqueMatches(fallbackValues(input), (source) => [
      ...stableValues(source),
      ...fallbackValues(source),
    ]);
  }
  const match = matches.length === 1 ? matches[0] : {};
  const ambiguous = matches.length > 1;
  const sourceKey = clean(
    match.sourceKey ||
      match.catalogKey ||
      input.sourceKey ||
      input.catalogKey ||
      match.sourceReferenceId ||
      input.sourceReferenceId ||
      match.id ||
      input.id ||
      match.alias ||
      input.alias ||
      match.sourceFile ||
      input.sourceFile ||
      match.file ||
      input.file ||
      input.name,
  );
  const sourceFile = clean(
    match.sourceFile ||
      input.sourceFile ||
      match.file ||
      input.file ||
      match.name ||
      input.name ||
      sourceKey,
  );
  const alias = clean(
    input.alias || match.alias || input.name || match.name || sourceFile,
  );
  return { sourceKey, sourceFile, alias, catalogSource: match, ambiguous };
}

let atlasSourceDerivedVersion = 0;
let atlasSourceCatalogCache = {
  version: -1,
  audit: null,
  entries: [],
  byStable: new Map(),
  byFallback: new Map(),
};
function atlasInvalidateSourceDerivedState() {
  atlasSourceDerivedVersion += 1;
  atlasSourceCatalogCache.version = -1;
  atlasMarkFieldPickerDirty?.();
}
function atlasInvalidateSourceBrowserCaches() {
  atlasInvalidateSourceDerivedState();
}
function atlasSourceLookupAdd(map, value, source) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return;
  const matches = map.get(key) || [];
  matches.push(source);
  map.set(key, matches);
}

const SOURCE_COLOR_PALETTE = [
  "#fdd0ec",
  "#b3f5ff",
  "#abf5d1",
  "#fffae6",
  "#c0b6f2",
  "#e6fcff",
  "#ffd9c2",
  "#d8f3dc",
  "#dbeafe",
  "#fde68a",
];

function sourceCatalogEntries() {
  const audit = atlasDisplayDocument?.() || state.audit;
  if (
    atlasSourceCatalogCache.version === atlasSourceDerivedVersion &&
    atlasSourceCatalogCache.audit === audit
  )
    return atlasSourceCatalogCache.entries;
  const entries = new Map();
  (repoLibraryState?.sourceFiles || []).forEach((source) => {
    const identity = atlasResolveSourceIdentity(source);
    const key = identity.sourceKey;
    if (!key) return;
    entries.set(key, {
      ...source,
      sourceKey: key,
      sourceFile: identity.sourceFile,
      alias: identity.alias,
      fields: Array.isArray(source.fields) ? source.fields : [],
      fieldCount: source.fieldCount || source.fields?.length || 0,
    });
  });
  (audit.sources || []).forEach((source) => {
    const identity = atlasResolveSourceIdentity(source);
    const key = identity.sourceKey;
    if (!key || entries.has(key)) return;
    entries.set(key, {
      ...source,
      sourceKey: key,
      sourceFile: identity.sourceFile,
      alias: identity.alias,
      fields: [],
      fieldCount: 0,
    });
  });
  const sorted = [...entries.values()].sort((a, b) =>
    sourceCatalogDisplayName(a).localeCompare(
      sourceCatalogDisplayName(b),
      undefined,
      { sensitivity: "base", numeric: true },
    ),
  );
  const byStable = new Map(),
    byFallback = new Map();
  sorted.forEach((entry) => {
    [
      entry.sourceKey,
      entry.catalogKey,
      entry.sourceReferenceId,
      entry.id,
    ].forEach((value) => atlasSourceLookupAdd(byStable, value, entry));
    [entry.alias, entry.sourceFile, entry.file, entry.name].forEach((value) =>
      atlasSourceLookupAdd(byFallback, value, entry),
    );
  });
  atlasSourceCatalogCache = {
    version: atlasSourceDerivedVersion,
    audit,
    entries: sorted,
    byStable,
    byFallback,
  };
  return sorted;
}

function atlasNormalizeSourceToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function atlasDisplayNameCollision(displayName) {
  const token = atlasNormalizeSourceToken(displayName);
  if (!token) return false;
  const sources = Array.isArray(repoLibraryState?.sourceFiles)
    ? repoLibraryState.sourceFiles
    : [];
  let count = 0;
  for (const source of sources) {
    if (atlasNormalizeSourceToken(source.sourceFile || source.name) === token)
      count += 1;
    if (count > 1) return true;
  }
  return false;
}

function atlasSourceIdentityTokens(
  source,
  { includeSharedDisplayName = false } = {},
) {
  if (!source || typeof source !== "object") return [];
  const values = [
    source.sourceKey,
    source.catalogKey,
    source.sourceReferenceId,
    source.alias,
    source.sourceAlias,
  ];
  [source.sourceFile, source.name, source.file].forEach((value) => {
    if (!value) return;
    if (includeSharedDisplayName || !atlasDisplayNameCollision(value))
      values.push(value);
  });
  return [
    ...new Set(values.map(atlasNormalizeSourceToken).filter(Boolean)),
  ];
}

function atlasStableSourceKey(source = {}) {
  if (source == null) return "";
  if (typeof source !== "object") return String(source).trim();
  const stable = String(
    source.sourceKey || source.catalogKey || source.sourceReferenceId || "",
  ).trim();
  if (stable) return stable;
  const alias = String(source.alias || source.sourceAlias || "").trim();
  if (alias) return alias;
  const display = String(source.sourceFile || source.file || source.name || "").trim();
  return display && !atlasDisplayNameCollision(display) ? display : "";
}

function atlasSourceDisambiguatedLabel(source = {}) {
  const title = String(
    source.sourceMetadata?.sourceTitle || source.sourceFile || source.name || "",
  ).trim();
  const alias = String(source.alias || source.sourceKey || "").trim();
  if (title && alias && alias !== title && atlasDisplayNameCollision(title))
    return `${title} — ${alias}`;
  return title || alias;
}

function atlasSourceMatchesLookup(source, lookup) {
  const wanted = atlasNormalizeSourceToken(lookup);
  if (!wanted || !source) return false;
  return atlasSourceIdentityTokens(source).includes(wanted);
}

function atlasSourcesMatchingLookup(sources, lookup) {
  const wanted = atlasNormalizeSourceToken(lookup);
  if (!wanted) return [];
  const list = Array.isArray(sources) ? sources : [];
  const direct = list.filter((source) =>
    atlasSourceIdentityTokens(source).includes(wanted),
  );
  if (direct.length) return direct;
  if (!atlasDisplayNameCollision(lookup)) return [];
  const byTitle = list.filter((source) =>
    [source.sourceFile, source.sourceMetadata?.sourceTitle].some(
      (value) => atlasNormalizeSourceToken(value) === wanted,
    ),
  );
  return byTitle.length === 1 ? byTitle : [];
}

function atlasCatalogSourcesForSelection(
  catalogSources,
  auditSources,
  lookup = "",
) {
  const selected = new Set();
  (auditSources || []).forEach((source) => {
    atlasSourceIdentityTokens(source).forEach((token) => selected.add(token));
  });
  const selectedSources = (catalogSources || []).filter((source) => {
    const tokens = atlasSourceIdentityTokens(source);
    return tokens.some((token) => selected.has(token));
  });
  if (!atlasNormalizeSourceToken(lookup)) return selectedSources;
  return atlasSourcesMatchingLookup(selectedSources, lookup);
}

function selectedSourceDetail(sourceKeyOrFile) {
  const value = String(sourceKeyOrFile || "").trim();
  if (!value) return null;
  const normalized = value.toLowerCase();
  sourceCatalogEntries();
  const stableMatches = atlasSourceCatalogCache.byStable.get(normalized) || [];
  if (stableMatches.length === 1) return stableMatches[0];
  if (stableMatches.length > 1) return null;
  if (atlasDisplayNameCollision(value)) return null;
  const fallbackMatches =
    atlasSourceCatalogCache.byFallback.get(normalized) || [];
  return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

function fieldsForSource(sourceKeyOrFile) {
  const match = selectedSourceDetail(sourceKeyOrFile);
  if (match?.fields?.length) return match.fields;
  if (!match && atlasDisplayNameCollision(sourceKeyOrFile)) return [];
  const sourceKey = match?.sourceKey || String(sourceKeyOrFile || "").trim();
  const sourceFile = match?.sourceFile || String(sourceKeyOrFile || "").trim();
  const audit = atlasDisplayDocument?.() || state.audit;
  return (audit.fields || [])
    .filter((field) => {
      if (!sourceKeyOrFile) return true;
      if (field.sourceKey && field.sourceKey === sourceKey) return true;
      return (
        !field.sourceKey &&
        field.sourceFile === sourceFile &&
        !atlasDisplayNameCollision(sourceFile)
      );
    })
    .map((field, index) => ({
      order: index + 1,
      fieldName: field.rawFieldName || field.name,
      vanityLabel: field.name,
      label: field.name,
      ...field,
    }));
}

function sourceOptionsHtml(selected = "") {
  const sources = sourceCatalogEntries();
  const selectedSources = new Set(
    atlasSourcesMatchingLookup(sources, selected),
  );
  return [
    '<option value="">Select source file...</option>',
    ...sources.map((source) => {
      const key = atlasStableSourceKey(source) || source.sourceKey;
      return `<option value="${esc(key)}" ${selectedSources.has(source) ? "selected" : ""}>${esc(atlasSourceDisambiguatedLabel(source))}</option>`;
    }),
  ].join("");
}

function atlasSelectedSourceByKey(sourceKeyOrFile) {
  const sources = state.audit?.sources || [];
  const wanted = String(sourceKeyOrFile || "").trim();
  if (!wanted) return null;
  const stable = sources.find((source) =>
    [source.sourceKey, source.alias, source.catalogKey, source.sourceReferenceId]
      .filter(Boolean)
      .includes(wanted),
  );
  if (stable) return stable;
  if (atlasDisplayNameCollision(wanted)) return null;
  return (
    sources.find((source) =>
      [source.name, source.sourceFile].filter(Boolean).includes(wanted),
    ) || null
  );
}

function fieldOptionsHtml(sourceFile = "", selected = "") {
  const fields = fieldsForSource(sourceFile);
  return [
    '<option value="">Select field...</option>',
    ...fields.map((field) => {
      const parts = fieldDisplayParts(field, sourceFile);
      const label = parts.alternate
        ? `${parts.display} (${parts.alternate})`
        : parts.display;
      return `<option value="${esc(parts.raw)}" ${selected === parts.raw || selected === parts.vanity ? "selected" : ""}>${esc(label)}</option>`;
    }),
  ].join("");
}

function nextSourceColor() {
  const used = new Set(
    (state.audit.sources || []).map((source) => source.color).filter(Boolean),
  );
  return (
    SOURCE_COLOR_PALETTE.find((color) => !used.has(color)) ||
    SOURCE_COLOR_PALETTE[
      (state.audit.sources || []).length % SOURCE_COLOR_PALETTE.length
    ]
  );
}

function atlasSourceMutationKey(source = {}) {
  if (typeof atlasSourceCanonicalKey === "function")
    return atlasSourceCanonicalKey(source);
  if (typeof sourceCatalogKey === "function") return sourceCatalogKey(source);
  return String(
    source.sourceKey || source.name || source.sourceFile || "",
  ).trim();
}

function atlasAddSourceState(sourceKeyOrFile) {
  const source = selectedSourceDetail(sourceKeyOrFile);
  if (!source) {
    status(
      `Source file ${sourceKeyOrFile} was not found in the source library.`,
      "warn",
    );
    return {
      changed: false,
      reason: "not-found",
      sourceKey: String(sourceKeyOrFile || ""),
    };
  }

  const key = atlasSourceMutationKey(source);
  const sourceFile = source.sourceFile || key;
  state.audit.sources = state.audit.sources || [];

  if (
    state.audit.sources.some((item) => atlasSourceMutationKey(item) === key)
  ) {
    return {
      changed: false,
      reason: "already-selected",
      sourceKey: key,
      sourceFile,
    };
  }

  state.audit.sources.push({
    id: uid("source"),
    sourceKey: key,
    name: key,
    sourceFile,
    alias: source.alias || sourceFile,
    color: nextSourceColor(),
    description:
      source.alias && source.alias !== sourceFile
        ? `Alias: ${source.alias}`
        : "",
    sourceMetadata: source.sourceMetadata || {},
  });

  state.audit.fields = (state.audit.fields || []).filter((field) => {
    const fieldKey = String(field.sourceKey || "").trim();
    return fieldKey ? fieldKey !== key : field.sourceFile !== sourceFile;
  });

  (source.fields || []).forEach((field) => {
    const raw = field.fieldName || field.name || field.label;
    const label = field.vanityLabel || field.label || raw;
    if (!raw) return;
    state.audit.fields.push({
      id: uid("field"),
      name: label,
      type: "Source",
      sourceKey: key,
      sourceFile,
      sourceAlias: source.alias || sourceFile,
      rawFieldName: raw,
      description: `${sourceFile} / ${raw}`,
    });
  });

  atlasInvalidateSourceDerivedState();
  return { changed: true, action: "add", sourceKey: key, sourceFile };
}

function atlasRemoveSourceState(sourceKeyOrFile) {
  const selected =
    typeof atlasSelectedSourceByKey === "function"
      ? atlasSelectedSourceByKey(sourceKeyOrFile)
      : (state.audit.sources || []).find((source) =>
          [
            source.sourceKey,
            source.name,
            source.sourceFile,
            source.alias,
          ].includes(sourceKeyOrFile),
        );

  if (!selected) {
    status(`Source ${sourceKeyOrFile} is not selected for this audit.`, "warn");
    return {
      changed: false,
      reason: "not-selected",
      sourceKey: String(sourceKeyOrFile || ""),
    };
  }

  const key = atlasSourceMutationKey(selected);
  const sourceFile = selected.sourceFile || selected.name || key;
  const generatedStepIds = new Set(
    (state.audit.steps || [])
      .filter(
        (step) =>
          step.autoGeneratedReference &&
          atlasSourceMutationKey({
            sourceKey: step.source,
            sourceFile: step.source,
          }) === key,
      )
      .map((step) => step.id),
  );

  state.audit.sources = (state.audit.sources || []).filter(
    (source) => atlasSourceMutationKey(source) !== key,
  );
  state.audit.fields = (state.audit.fields || []).filter((field) => {
    const fieldKey = String(field.sourceKey || "").trim();
    return fieldKey ? fieldKey !== key : field.sourceFile !== sourceFile;
  });
  state.audit.steps = (state.audit.steps || []).filter(
    (step) => !generatedStepIds.has(step.id),
  );

  if (state.selectedStepId && generatedStepIds.has(state.selectedStepId)) {
    state.selectedStepId = null;
  }

  atlasInvalidateSourceDerivedState();
  return {
    changed: true,
    action: "remove",
    sourceKey: key,
    sourceFile,
    selectedStepRemoved: generatedStepIds.size > 0 && !state.selectedStepId,
  };
}

function referenceStepForSource(source, index) {
  const identity = atlasResolveSourceIdentity(source);
  const sourceFile =
    identity.sourceFile || source.sourceFile || source.name || "";
  const sourceAlias = identity.alias || source.alias || sourceFile;
  return {
    id: `reference_${source.id || source.name}`,
    enabled: true,
    autoGeneratedReference: true,
    locked: true,
    parentId: null,
    branchType: "root",
    sortOrder: index + 1,
    title: `Reference ${source.name}`,
    type: "source",
    step_type: "reference_source",
    source: source.name,
    field: "",
    action: "",
    notes:
      "Generated automatically from the source files selected in Sources & Fields.",
    conditions: [],
    params: {
      source_file: sourceFile,
      source_alias: sourceAlias,
    },
  };
}

function syncAutoReferenceSteps() {
  const selected = state.audit.sources || [];
  const manualSteps = (state.audit.steps || []).filter(
    (step) => !step.autoGeneratedReference,
  );
  const referenceSteps = selected.map((source, index) => {
    const existing = (state.audit.steps || []).find(
      (step) => step.autoGeneratedReference && step.source === source.name,
    );
    return {
      ...(existing || referenceStepForSource(source, index)),
      ...referenceStepForSource(source, index),
      id: existing?.id || referenceStepForSource(source, index).id,
    };
  });
  referenceSteps.forEach((step, index) => {
    step.sortOrder = index + 1;
  });
  manualSteps.forEach((step, index) => {
    step.sortOrder = selected.length + index + 1;
  });
  state.audit.steps = [...referenceSteps, ...manualSteps];
}

function applyLibraryFieldToSelectedStep(sourceFile, fieldName) {
  const step = state.audit.steps.find(
    (item) => item.id === state.selectedStepId,
  );
  if (!step)
    return status("Select a step before applying a source field.", "warn");
  if (step.autoGeneratedReference)
    return status(
      "Generated reference steps are controlled by selected sources. Select or add a logic step to apply a field.",
      "warn",
    );
  const sourceResult = atlasAddSourceState(sourceFile);
  if (sourceResult.changed) syncAutoReferenceSteps();
  normalizeCatalogStep?.(step);
  step.source = sourceFile;
  step.field = fieldName;
  step.params.source_file = sourceFile;
  step.params.source_alias = sourceAliasFor?.(sourceFile) || sourceFile;
  step.params.field_name = fieldName;
  const conditions = parseStepConditions?.(step) || [];
  if (step.step_type === "if_then" && conditions.length) {
    conditions[0].sourceFile = sourceFile;
    conditions[0].sourceAlias = step.params.source_alias;
    conditions[0].fieldName = fieldName;
    step.params.conditions_json = JSON.stringify(conditions);
  }
  atlasMarkFieldPickerDirty?.();
  atlasInvalidatePages?.(["fields", "steps", "preview", "review"]);
  showSection("steps");
  atlasRenderActivePage?.({ force: true });
  scheduleAutosave();
  status(`Applied ${sourceFile}.${fieldName} to the selected step.`, "ok");
}

function allFieldOptions() {
  const options = [];
  (state.audit.fields || []).forEach((field) => {
    if (!field.name) return;
    options.push({
      value: field.name,
      label: `${field.name} (${field.type || "Field"})`,
      kind: field.type || "Field",
      source: field.sourceFile || "Selected Audit Fields",
      raw: field.rawFieldName || field.name,
    });
    if (field.rawFieldName)
      options.push({
        value: field.rawFieldName,
        label: `${field.rawFieldName} (${field.sourceFile || "Raw Field"})`,
        kind: "Raw Field",
        source: field.sourceFile || "Selected Audit Fields",
        raw: field.rawFieldName,
      });
  });
  sourceCatalogEntries().forEach((source) => {
    options.push({
      value: source.sourceKey,
      label: `${sourceCatalogDisplayName(source)} (Source)`,
      kind: "Source",
      source: source.sourceKey,
    });
    (source.fields || []).forEach((field) => {
      const parts = fieldDisplayParts(field, source.sourceFile);
      if (parts.raw)
        options.push({
          value: parts.raw,
          label: `${parts.display} (${source.sourceFile}.${parts.raw})`,
          kind: "Source Field",
          source: source.sourceFile,
          raw: parts.raw,
        });
    });
  });
  workbookFieldOptions?.().forEach((field) => options.push(field));
  const seen = new Set();
  return options
    .filter((option) => {
      const key = `${option.value}::${option.label}`;
      if (!option.value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function refreshFieldPickerOptions() {
  return atlasMeasure?.("atlas.field-picker.build", () => {
    let fieldList = $("fieldPickerOptions");
    let sourceList = $("sourcePickerOptions");
    if (!fieldList) {
      fieldList = document.createElement("datalist");
      fieldList.id = "fieldPickerOptions";
      document.body.append(fieldList);
    }
    if (!sourceList) {
      sourceList = document.createElement("datalist");
      sourceList.id = "sourcePickerOptions";
      document.body.append(sourceList);
    }
    fieldList.innerHTML = allFieldOptions()
      .map(
        (option) =>
          `<option value="${esc(option.value)}" label="${esc(option.label)}"></option>`,
      )
      .join("");
    sourceList.innerHTML = sourceCatalogEntries()
      .map(
        (source) =>
          `<option value="${esc(source.sourceKey)}" label="${esc(sourceCatalogDisplayName(source))}"></option>`,
      )
      .join("");
    atlasFieldPickerState.initialized = true;
    atlasFieldPickerState.dirty = false;
  });
}

function applyFieldPickerAttributes() {
  document
    .querySelectorAll("[data-step-field], [data-cond-field]")
    .forEach((input) => input.setAttribute("list", "fieldPickerOptions"));
  document
    .querySelectorAll("[data-step-source]")
    .forEach((input) => input.setAttribute("list", "sourcePickerOptions"));
}

function renderFieldPickerPanel() {
  const panel = $("fieldPickerSummary");
  if (!panel) return;
  const sources = sourceCatalogEntries();
  panel.innerHTML = sources.length
    ? ""
    : '<p class="hint">No source fields found yet. The field library is unavailable.</p>';
}

const atlasFieldPickerState = { initialized: false, dirty: true };

function atlasMarkFieldPickerDirty() {
  atlasFieldPickerState.dirty = true;
}

function atlasEnsureFieldPickerOptions() {
  if (!atlasFieldPickerState.initialized || atlasFieldPickerState.dirty) {
    refreshFieldPickerOptions();
  }
}

// Build backing datalists only when a field/source input is first used.
document.addEventListener(
  "focusin",
  (event) => {
    if (
      !event.target.matches?.(
        "[data-step-field], [data-cond-field], [data-step-source]",
      )
    )
      return;
    atlasEnsureFieldPickerOptions();
    applyFieldPickerAttributes();
  },
  true,
);
