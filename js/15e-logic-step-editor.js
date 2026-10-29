/**
 * 15e-logic-step-editor.js
 * Split from 15-visual-ui-upgrades.js.
 * Compact rule cards, selected-source picker restrictions, hierarchy actions, and rule menus.
 * IMPORTANT: classic browser script; preserve the 15a-15g load order.
 */
/* Compact Rules + selected-source editor/picker refinement */
let atlasFieldPickerSortMode = "source";
// Resolved selected sources, reused while their inputs are unchanged. See
// atlasSelectedSourceLookup near the calculated-field source wrapper.
const atlasSelectedSourceLookupState = {
  uncached: null,
  snapshot: null,
  lookup: null,
};

function atlasSelectedAuditSources() {
  const audit = atlasDisplayDocument?.() || state.audit;
  const catalogSources = sourceCatalogEntries();
  return (audit.sources || []).map((selectedSource) => {
    const identity = atlasResolveSourceIdentity(selectedSource, catalogSources);
    const catalogSource = identity.ambiguous
      ? {}
      : identity.catalogSource || {};
    return {
      ...catalogSource,
      ...selectedSource,
      sourceKey: selectedSource.sourceKey || identity.sourceKey,
      sourceFile:
        selectedSource.sourceFile ||
        identity.sourceFile ||
        selectedSource.name ||
        selectedSource.sourceKey ||
        "",
      alias: selectedSource.alias || identity.alias,
      fields: catalogSource.fields?.length
        ? catalogSource.fields
        : selectedSource.fields || [],
    };
  });
}

function atlasNormalizedSourceIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function atlasSourceIdentityCandidates(source) {
  if (!source) return [];
  if (typeof source === "string") {
    const normalized = atlasNormalizedSourceIdentity(source);
    return normalized ? [normalized] : [];
  }
  return [
    source.sourceReferenceId,
    source.sourceKey,
    source.baseSourceKey,
    source.id,
    source.name,
    source.sourceFile,
    source.alias,
  ]
    .map(atlasNormalizedSourceIdentity)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

/**
 * Memo key for a source reference: every input property that source
 * resolution and stable keys read.
 */
function atlasSourceLookupKey(sourceLike) {
  if (typeof sourceLike === "string") return `s:${sourceLike}`;
  const input = sourceLike && typeof sourceLike === "object" ? sourceLike : {};
  return JSON.stringify(
    [
      input.sourceReferenceId,
      input.sourceKey,
      input.baseSourceKey,
      input.id,
      input.name,
      input.sourceFile,
      input.alias,
    ].map((value) =>
      value === undefined || value === null ? null : String(value),
    ),
  );
}

/** Returns the lookup's own source object for a reference; never hand it out. */
function atlasLookupResolvedSource(lookup, sourceLike) {
  const key = atlasSourceLookupKey(sourceLike);
  if (!lookup.resolved.has(key))
    lookup.resolved.set(
      key,
      atlasResolveSelectedSourceIn(lookup.sources, sourceLike),
    );
  return lookup.resolved.get(key);
}

function atlasResolveSelectedSource(sourceLike) {
  const source = atlasLookupResolvedSource(
    atlasSelectedSourceLookup(),
    sourceLike,
  );
  return source ? { ...source } : null;
}

function atlasResolveSelectedSourceIn(selectedSources, sourceLike) {
  const input =
    typeof sourceLike === "string" ? { name: sourceLike } : sourceLike || {};
  const stableKeys = [
    input.sourceReferenceId,
    input.sourceKey,
    input.baseSourceKey,
    input.id,
  ]
    .map(atlasNormalizedSourceIdentity)
    .filter(Boolean);
  const stableMatches = selectedSources.filter((source) => {
    const sourceStableKeys = [
      source.sourceReferenceId,
      source.sourceKey,
      source.baseSourceKey,
      source.id,
    ]
      .map(atlasNormalizedSourceIdentity)
      .filter(Boolean);
    return stableKeys.some((key) => sourceStableKeys.includes(key));
  });
  if (stableMatches.length === 1) return stableMatches[0];
  if (stableMatches.length > 1) return null;
  const fallbackKeys = [input.name, input.sourceFile, input.alias]
    .map(atlasNormalizedSourceIdentity)
    .filter(Boolean);
  const fallbackMatches = selectedSources.filter((source) => {
    const sourceFallbackKeys = [source.name, source.sourceFile, source.alias]
      .map(atlasNormalizedSourceIdentity)
      .filter(Boolean);
    return fallbackKeys.some((key) => sourceFallbackKeys.includes(key));
  });
  return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

function atlasLookupStableKey(lookup, sourceLike) {
  const key = atlasSourceLookupKey(sourceLike);
  if (!lookup.stableKeys.has(key))
    lookup.stableKeys.set(key, atlasSourceStableKeyIn(lookup, sourceLike));
  return lookup.stableKeys.get(key);
}

function atlasSourceStableKey(sourceLike) {
  return atlasLookupStableKey(atlasSelectedSourceLookup(), sourceLike);
}

function atlasSourceStableKeyIn(lookup, sourceLike) {
  const source =
    atlasLookupResolvedSource(lookup, sourceLike) || sourceLike || {};
  if (typeof source === "string") return atlasNormalizedSourceIdentity(source);
  return String(
    source.sourceReferenceId ||
      source.sourceKey ||
      source.baseSourceKey ||
      source.id ||
      source.sourceFile ||
      source.name ||
      "",
  ).trim();
}

function atlasEnsureAuditSourceColors() {
  const sources = state.audit.sources || [];
  const palette =
    Array.isArray(SOURCE_COLOR_PALETTE) && SOURCE_COLOR_PALETTE.length
      ? SOURCE_COLOR_PALETTE
      : ["#4d6fa9", "#b54b4b", "#2e7d5b", "#a66b11", "#7c5aa6"];
  const used = new Set(sources.map((source) => source.color).filter(Boolean));
  sources.forEach((source) => {
    if (source.color) return;
    source.color =
      palette.find((color) => !used.has(color)) ||
      palette[sources.indexOf(source) % palette.length];
    used.add(source.color);
  });
  return sources;
}

function atlasSelectedSourceColor(sourceLike) {
  atlasEnsureAuditSourceColors();
  return atlasResolveSelectedSource(sourceLike)?.color || "";
}

function atlasSelectedSourceAlias(sourceLike) {
  const source = atlasResolveSelectedSource(sourceLike);
  const sourceFile =
    source?.sourceFile ||
    source?.name ||
    (typeof sourceLike === "string"
      ? sourceLike
      : sourceLike?.sourceFile || "");
  return source?.alias || sourceAliasFor?.(sourceFile) || sourceFile;
}

function atlasSourceOptionsHtml(selected = "") {
  const sources = atlasSelectedAuditSources();
  if (!sources.length)
    return '<option value="">Select sources on the Fields page first...</option>';
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

function atlasFieldOptionsHtml(sourceFile = "", selected = "") {
  const auditSources = atlasSelectedAuditSources();
  const sources = sourceFile
    ? atlasSourcesMatchingLookup(auditSources, sourceFile)
    : auditSources;
  const fields = sources.flatMap((source) =>
    (source.fields || []).map((field) => ({ source, field })),
  );
  if (!fields.length)
    return '<option value="">Select a selected source first...</option>';
  return [
    '<option value="">Select field...</option>',
    ...fields.map(({ source, field }) => {
      const parts = fieldDisplayParts(field, source.sourceFile);
      const displayWithAlternate = parts.alternate
        ? `${parts.display} (${parts.alternate})`
        : parts.display;
      const optionLabel = sourceFile
        ? displayWithAlternate
        : `${atlasSourceDisambiguatedLabel(source)}.${displayWithAlternate}`;
      return `<option value="${esc(parts.raw)}" data-source-file="${esc(source.sourceFile)}" data-source-key="${esc(atlasStableSourceKey(source) || source.sourceKey || "")}" ${selected === parts.raw || selected === parts.vanity ? "selected" : ""}>${esc(optionLabel)}</option>`;
    }),
  ].join("");
}

function atlasIsCustomField(field) {
  if (!field) return false;
  const category = String(
    field.dataCategory || field.category || field.type || field.fieldType || "",
  ).toLowerCase();
  return !!(
    field.calculated ||
    field.created ||
    field.custom ||
    category.includes("calculated") ||
    category.includes("custom column") ||
    category.includes("created column")
  );
}

renderMiniPickerTrigger = function atlasSourceAwareMiniPickerTrigger(
  kind,
  name,
  value,
  label,
  sourceFile = "",
) {
  const sourceLike = kind === "field" ? sourceFile : value;
  const source = atlasResolveSelectedSource(sourceLike);
  const color = source ? atlasSelectedSourceColor(source) : "";
  const sourceKey = source ? atlasSourceStableKey(source) : "";
  const visibleValue =
    kind === "field"
      ? fieldDisplayName(value, sourceFile)
      : source
        ? atlasSourceDisambiguatedLabel(source)
        : value;
  const detail =
    kind === "source"
      ? source?.alias || sourceAliasFor?.(value) || ""
      : sourceFile
        ? `${atlasSelectedSourceAlias(sourceFile)}.${value || "[field]"}`
        : value || "";
  const empty = !value;
  return `<button type="button" class="visual-picker-trigger-button ${kind}-token ${empty ? "empty" : ""}" data-open-mini-picker="${esc(kind)}" data-param-name="${esc(name)}" data-picker-source="${esc(sourceFile)}" data-source-key="${esc(sourceKey)}" style="${color ? `--source-color:${esc(color)}` : ""}">${color ? '<span class="source-color-dot" aria-hidden="true"></span>' : ""}<span class="visual-picker-trigger-copy"><strong>${esc(visibleValue || label || "Choose...")}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</span><span aria-hidden="true">⌄</span></button>`;
};

renderConditionPickerTrigger = function atlasSourceAwareConditionPickerTrigger(
  kind,
  fieldName,
  value,
  label,
  sourceFile = "",
) {
  const selectedSourceFile = kind === "field" && !value ? "" : sourceFile;
  const sourceLike = kind === "field" ? selectedSourceFile : value;
  const source = atlasResolveSelectedSource(sourceLike);
  const color = source ? atlasSelectedSourceColor(source) : "";
  const visibleValue =
    kind === "field"
      ? fieldDisplayName(value, selectedSourceFile)
      : source
        ? atlasSourceDisambiguatedLabel(source)
        : value;
  return `<input type="hidden" data-condition-field="${esc(fieldName)}" value="${esc(value || "")}"><button type="button" class="visual-picker-trigger-button ${kind}-token ${value ? "" : "empty"}" data-open-mini-picker="${esc(kind)}" data-condition-name="${esc(fieldName)}" data-picker-source="${esc(selectedSourceFile)}" data-source-key="${esc(source ? atlasSourceStableKey(source) : "")}" style="${color ? `--source-color:${esc(color)}` : ""}">${color ? '<span class="source-color-dot" aria-hidden="true"></span>' : ""}<span class="visual-picker-trigger-copy"><strong>${esc(visibleValue || label || "Choose...")}</strong>${selectedSourceFile ? `<small>${esc(atlasSelectedSourceAlias(selectedSourceFile))}</small>` : ""}</span><span aria-hidden="true">⌄</span></button>`;
};

// Keep the later visual override on the same object-parameter contract as the base renderer.
sourceInputFromOptions = function atlasSelectedSourceVisualInput({
  name = "",
  value = "",
  placeholder = "Select source file",
} = {}) {
  return renderMiniPickerTrigger(
    "source",
    name,
    value || "",
    value || placeholder,
  );
};
// Keep the later visual override on the same object-parameter contract as the base renderer.
fieldInputFromOptions = function atlasSelectedFieldVisualInput({
  name = "",
  value = "",
  placeholder = "Select field",
  sourceFile = "",
} = {}) {
  const selectedSourceFile = value ? sourceFile || "" : "";
  return renderMiniPickerTrigger(
    "field",
    name,
    value || "",
    value || placeholder,
    selectedSourceFile,
  );
};

function pickerSourceOptions() {
  return atlasSelectedAuditSources().map((source) => ({
    sourceFile: source.sourceFile,
    sourceAlias: source.alias || source.sourceFile,
    fieldName: "",
    label: atlasSourceDisambiguatedLabel(source),
    detail: source.alias || source.sourceFile,
    sourceColor: atlasSelectedSourceColor(source),
    sourceKey: atlasStableSourceKey(source) || atlasSourceStableKey(source),
  }));
}

function atlasSortedPickerItems(items) {
  const list = [...items];
  if (atlasFieldPickerSortMode === "alpha") {
    return list.sort((a, b) =>
      `${a.label} ${a.fieldName}`.localeCompare(
        `${b.label} ${b.fieldName}`,
        undefined,
        { sensitivity: "base", numeric: true },
      ),
    );
  }
  return list.sort((a, b) =>
    `${a.sourceAlias} ${a.label} ${a.fieldName}`.localeCompare(
      `${b.sourceAlias} ${b.label} ${b.fieldName}`,
      undefined,
      { sensitivity: "base", numeric: true },
    ),
  );
}

// Phase 2: picker commit behavior is centralized in 15g.

function atlasFieldMatchForSource(value, sourceLike) {
  const normalized = String(value || "").trim();
  // One lookup for the whole search; each source's key is memoized in it.
  const lookup = atlasSelectedSourceLookup();
  const wanted = atlasLookupStableKey(lookup, sourceLike);
  const source = lookup.sources.find(
    (candidate) => atlasLookupStableKey(lookup, candidate) === wanted,
  );
  if (!source) return null;
  const field = (source.fields || []).find((item) => {
    const parts = fieldDisplayParts(item, source.sourceFile);
    return [
      parts.raw,
      parts.vanity,
      parts.display,
      `${source.sourceFile}.${parts.raw}`,
      `${source.alias || source.sourceFile}.${parts.raw}`,
    ].includes(normalized);
  });
  return field
    ? {
        sourceFile: source.sourceFile,
        sourceKey: atlasLookupStableKey(lookup, source),
        color: atlasSelectedSourceColor(source),
        kind: atlasIsCustomField(field) ? "custom" : "field",
        field,
      }
    : null;
}

function atlasCreatedColumnMatchForValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const audit = atlasDisplayDocument?.() || state.audit;
  const step = (audit?.steps || []).find(
    (candidate) =>
      candidate?.step_type === "create_column" &&
      String(candidate.params?.column_name || "").trim() === normalized,
  );
  return step
    ? {
        kind: "created",
        creatorStepId: step.id || "",
        color: "#2563eb",
      }
    : null;
}

function atlasSourceMatchForValue(value, preferredSource = null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const createdColumn = atlasCreatedColumnMatchForValue(normalized);
  if (createdColumn) return createdColumn;
  const direct = atlasResolveSelectedSource(normalized);
  if (direct) {
    return {
      sourceFile: direct.sourceFile || direct.name,
      sourceKey: atlasSourceStableKey(direct),
      color: atlasSelectedSourceColor(direct),
      kind: "source",
    };
  }
  if (preferredSource) {
    const preferredField = atlasFieldMatchForSource(
      normalized,
      preferredSource,
    );
    if (preferredField) return preferredField;
  }
  for (const source of atlasSelectedAuditSources()) {
    const fieldMatch = atlasFieldMatchForSource(normalized, source);
    if (fieldMatch) return fieldMatch;
  }
  return null;
}

renderLogicWithPills = function atlasRenderLogicWithSourceAndFieldPills(text) {
  const parts = String(text || "").split(/("[^"]+")/g);
  let activeSource = null;
  return parts
    .map((part) => {
      if (!part.startsWith('"') || !part.endsWith('"')) return esc(part);
      const value = part.slice(1, -1);
      const match = atlasSourceMatchForValue(value, activeSource);
      if (match?.kind === "source") activeSource = match;
      const klass =
        match?.kind === "created"
          ? "logic-pill created-column-token"
          : match?.kind === "custom"
            ? "logic-pill custom-field-token"
            : match?.kind === "field"
              ? "logic-pill field-pill-token field-token"
              : "logic-pill source-pill source-token";
      const style = match
        ? ` style="--pill-bg:${esc(match.color)};--pill-color:${esc(match.color)};--source-color:${esc(match.color)}"`
        : "";
      const dot = match
        ? `<span class="source-color-dot" aria-hidden="true"></span>`
        : "";
      const displayValue =
        match?.kind === "field" || match?.kind === "custom"
          ? fieldDisplayParts(match.field || value, match.sourceFile).display
          : value;
      return `<span class="${klass}" data-source-key="${esc(match?.sourceKey || "")}"${style}>${dot}${esc(displayValue)}</span>`;
    })
    .join("");
};

function atlasActionAvailability(step) {
  const reference =
    !!step?.autoGeneratedReference || step?.step_type === "reference_source";
  return {
    indent: !reference,
    outdent: !reference && !!step?.parentId,
    addChild: true,
    addAfter: !reference,
    duplicate: !reference,
    delete: !reference,
  };
}

function atlasAddStepAfter(stepId) {
  capture();
  const index = state.audit.steps.findIndex((step) => step.id === stepId);
  const current = state.audit.steps[index];
  const nextStep = {
    id: uid("step"),
    enabled: true,
    parentId: current?.parentId || null,
    branchType: current?.parentId ? current.branchType || "then" : "root",
    sortOrder: (Number(current?.sortOrder) || index + 1) + 0.1,
    title: "IF / THEN",
    type: "if",
    step_type: "if_then",
    source: current?.source || state.audit.sources?.[0]?.name || "",
    field: "",
    action: "",
    notes: "",
    conditions: [
      { id: uid("cond"), field: "", operator: "is equal to", value: "" },
    ],
    params: {},
  };
  normalizeCatalogStep?.(nextStep);
  if (typeof atlasInitializeNewIfThenAction === "function") {
    delete nextStep.params.then_action_type;
    atlasInitializeNewIfThenAction(nextStep);
    nextStep.params.then_action_type =
      nextStep.params.then_action_type || "freeform";
  }
  if (index >= 0) state.audit.steps.splice(index + 1, 0, nextStep);
  else state.audit.steps.push(nextStep);
  state.audit.steps.forEach((step, order) => {
    if (!step.autoGeneratedReference) step.sortOrder = order + 1;
  });
  state.selectedStepId = nextStep.id;
  renderAll();
  scheduleAutosave();
}

function atlasDuplicateStepById(stepId) {
  capture();
  const step = state.audit.steps.find((item) => item.id === stepId);
  if (!step || step.autoGeneratedReference) return;
  const copy = structuredClone(step);
  copy.id = uid("step");
  copy.autoGeneratedReference = false;
  copy.conditions = (copy.conditions || []).map((condition) => ({
    ...condition,
    id: uid("cond"),
  }));
  const index = state.audit.steps.indexOf(step);
  state.audit.steps.splice(index + 1, 0, copy);
  state.audit.steps.forEach((item, order) => {
    if (!item.autoGeneratedReference) item.sortOrder = order + 1;
  });
  state.selectedStepId = copy.id;
  renderAll();
  scheduleAutosave();
}

function renderLogicRuleCard(entry) {
  const step = entry.step;
  const selected = state.selectedStepId === step.id;
  const generated = !!step.autoGeneratedReference;
  const linkedInverse =
    step.params?.inverse_else === "Yes" && !!step.params?.inverse_of_step_id;
  const availability = atlasActionAvailability(step);
  const hasChildren =
    typeof atlasLogicStepHasChildren === "function"
      ? atlasLogicStepHasChildren(step.id)
      : (childrenOf?.(step.id) || []).length > 0;
  const collapsed =
    hasChildren &&
    typeof atlasLogicParentCollapsed === "function" &&
    atlasLogicParentCollapsed(step.id);
  const hierarchyTone = (Math.max(0, entry.level - 1) % 4) + 1;
  const cardClass = `logic-rule-card compact-logic-rule-card step-card ${generated ? "generated-reference-step" : "visual-step-card"} ${linkedInverse ? "linked-inverse-step inverse-else-step" : ""} ${hasChildren ? "hierarchy-parent-step" : ""} ${entry.level > 0 ? "hierarchy-child-step" : "hierarchy-root-step"} ${collapsed ? "hierarchy-collapsed-step" : ""} ${selected ? "selected" : ""}`;
  const draggable = generated ? "" : ' draggable="true"';
  const originalStepNumber = linkedInverse
    ? stepNumberFor?.(step.params.inverse_of_step_id) || "?"
    : "";
  const statusLabel = generated
    ? "Generated"
    : linkedInverse
      ? `Linked Inverse of ${originalStepNumber}`
      : "Editable";
  const statusClass = generated ? "blue" : linkedInverse ? "amber" : "green";
  return `<div class="${cardClass}" data-id="${esc(step.id)}" data-parent-id="${esc(step.parentId || "")}" data-hierarchy-level="${entry.level}" data-hierarchy-tone="${hierarchyTone}" data-has-children="${hasChildren ? "true" : "false"}" style="--depth:${entry.level}"${draggable}>
    <div class="compact-rule-grid">
      <span class="drag-handle compact-dragger" title="Drag to reorder">⋮⋮</span>
      ${hasChildren ? `<button type="button" class="step-collapse-button" data-toggle-step-children="${esc(step.id)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${collapsed ? "Expand" : "Collapse"} children of step ${esc(entry.number)}" title="${collapsed ? "Expand child steps" : "Collapse child steps"}"><span aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>` : '<span class="step-collapse-spacer" aria-hidden="true"></span>'}
      <span class="step-number compact-step-number">${esc(entry.number)}</span>
      <div class="compact-rule-logic" data-select-step>${linkedInverse ? `<div class="linked-inverse-subtitle inverse-else-subtitle">Complete inverse of Step ${esc(originalStepNumber)}</div>` : ""}${renderStepCardLogic(analystLogic(step))}</div>
      <span class="badge ${statusClass} compact-status-badge">${statusLabel}</span>
      <details class="compact-action-menu"><summary title="Step actions" aria-label="Step actions" aria-haspopup="menu" aria-expanded="false" data-rule-menu-toggle="${esc(step.id)}">⋯</summary><div class="compact-action-menu-panel" role="menu" data-rule-menu-panel="${esc(step.id)}" hidden>
        ${availability.indent ? '<button type="button" role="menuitem" data-indent>Indent</button>' : ""}
        ${availability.outdent ? '<button type="button" role="menuitem" data-outdent>Outdent</button>' : ""}
        ${
          availability.addChild
            ? generated
              ? '<button type="button" role="menuitem" data-add-reference-child-type="if_then">Add condition</button><button type="button" role="menuitem" data-add-reference-child-type="create_column">Create Column</button>'
              : '<button type="button" role="menuitem" data-add-child-step>Add Child</button>'
            : ""
        }
        ${step.step_type === "if_then" && !linkedInverse ? `<button type="button" role="menuitem" data-create-inverse-else-step="${esc(step.id)}">Create or Open Linked Inverse</button>` : ""}
        ${availability.addAfter ? '<button type="button" role="menuitem" data-add-step-after>Add Step After</button>' : ""}
        ${availability.duplicate ? '<button type="button" role="menuitem" data-duplicate-logic-step>Duplicate</button>' : ""}
        ${availability.delete ? '<button type="button" role="menuitem" class="danger-menu-action" data-delete-step>Delete</button>' : ""}
      </div></details>
    </div>
    ${atlasRenderHiddenPreserveFields(step)}
  </div>`;
}

const atlasPreviousRenderGuidedBuilder = renderGuidedBuilder;
renderGuidedBuilder = function renderGuidedBuilderSelectedSourcesOnly(step) {
  normalizeCatalogStep(step);
  const html = atlasPreviousRenderGuidedBuilder(step);
  return `<div class="selected-source-only-builder">${html}</div>`;
};

function atlasResetRuleMenuPosition(panel) {
  if (!panel) return;
  delete panel.dataset.positioned;
  panel.style.removeProperty("position");
  panel.style.removeProperty("top");
  panel.style.removeProperty("right");
  panel.style.removeProperty("left");
  panel.style.removeProperty("max-height");
  panel.style.removeProperty("visibility");
}
function atlasRuleMenuTriggerIsVisible(menuToggle, rulesViewport) {
  if (!menuToggle?.isConnected || !rulesViewport?.isConnected) return false;
  const triggerRect = menuToggle.getBoundingClientRect();
  const viewportRect = rulesViewport.getBoundingClientRect();
  return (
    triggerRect.bottom > viewportRect.top &&
    triggerRect.top < viewportRect.bottom &&
    triggerRect.right > viewportRect.left &&
    triggerRect.left < viewportRect.right
  );
}
function atlasPositionRuleMenu(menuToggle, panel) {
  const rulesViewport = menuToggle?.closest("#stepsList");
  if (
    !panel?.isConnected ||
    !atlasRuleMenuTriggerIsVisible(menuToggle, rulesViewport)
  ) {
    atlasCloseRuleMenus();
    return false;
  }
  const gap = 6;
  const edge = 8;
  const viewportTop = edge;
  const viewportBottom = window.innerHeight - edge;
  const viewportLeft = edge;
  const viewportRight = window.innerWidth - edge;
  const triggerRect = menuToggle.getBoundingClientRect();

  panel.hidden = false;
  panel.style.position = "fixed";
  panel.style.left = "0px";
  panel.style.top = "0px";
  panel.style.right = "auto";
  panel.style.visibility = "hidden";
  panel.style.maxHeight = `${Math.max(0, viewportBottom - viewportTop)}px`;
  panel.dataset.positioned = "true";
  if (panel.parentElement !== document.body) document.body.append(panel);

  const panelRect = panel.getBoundingClientRect();
  const menuWidth = panelRect.width;
  const menuHeight = panelRect.height;
  const spaceBelow = viewportBottom - triggerRect.bottom - gap;
  const spaceAbove = triggerRect.top - viewportTop - gap;
  const opensBelow = menuHeight <= spaceBelow;
  const opensAbove = menuHeight <= spaceAbove;
  const placement = opensBelow
    ? "below"
    : opensAbove
      ? "above"
      : spaceBelow >= spaceAbove
        ? "below"
        : "above";
  const availableHeight = Math.max(
    0,
    placement === "below" ? spaceBelow : spaceAbove,
  );
  const maxHeight = Math.min(menuHeight, availableHeight);
  const measuredHeight = Math.min(menuHeight, maxHeight);
  const top =
    placement === "below"
      ? triggerRect.bottom + gap
      : triggerRect.top - gap - measuredHeight;
  const left = Math.max(
    viewportLeft,
    Math.min(triggerRect.right - menuWidth, viewportRight - menuWidth),
  );

  if (
    !Number.isFinite(top) ||
    !Number.isFinite(left) ||
    maxHeight <= 0 ||
    viewportRight <= viewportLeft
  ) {
    atlasCloseRuleMenus();
    return false;
  }
  panel.style.maxHeight = `${Math.round(maxHeight)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.removeProperty("visibility");
  return true;
}
function atlasCloseRuleMenus(exceptId = "") {
  document.querySelectorAll("[data-rule-menu-panel]").forEach((panel) => {
    const keepOpen = !!exceptId && panel.dataset.ruleMenuPanel === exceptId;
    if (!keepOpen && panel.parentElement === document.body) {
      const toggle = document.querySelector(
        `[data-rule-menu-toggle="${CSS.escape(panel.dataset.ruleMenuPanel || "")}"]`,
      );
      toggle?.closest("details.compact-action-menu")?.append(panel);
    }
    panel.hidden = !keepOpen;
    if (!keepOpen) atlasResetRuleMenuPosition(panel);
    const toggle = document.querySelector(
      `[data-rule-menu-toggle="${CSS.escape(panel.dataset.ruleMenuPanel || "")}"]`,
    );
    const details = toggle?.closest("details.compact-action-menu");
    if (details) details.open = keepOpen;
    toggle?.setAttribute("aria-expanded", keepOpen ? "true" : "false");
  });
}
document.addEventListener(
  "click",
  (event) => {
    const menuToggle = event.target.closest("[data-rule-menu-toggle]");
    if (menuToggle) {
      if (
        typeof atlasAuditIsWorkflowLocked === "function" &&
        atlasAuditIsWorkflowLocked()
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        atlasCloseRuleMenus();
        status?.("This audit is read-only while approval is pending.", "bad");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const ruleId = menuToggle.dataset.ruleMenuToggle || "";
      if (!ruleId || !stepById?.(ruleId)) return;
      const panel = document.querySelector(
        `[data-rule-menu-panel="${CSS.escape(ruleId)}"]`,
      );
      if (!panel) return;
      const opening = panel.hidden;
      atlasCloseRuleMenus();
      if (!opening) return;
      if (!atlasPositionRuleMenu(menuToggle, panel)) return;
      menuToggle
        .closest("details.compact-action-menu")
        ?.setAttribute("open", "");
      menuToggle.setAttribute("aria-expanded", "true");
      return;
    }
    const menuAction = event.target.closest(
      "[data-rule-menu-panel] [role='menuitem']",
    );
    if (menuAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (menuAction.disabled) return;
      const panel = menuAction.closest("[data-rule-menu-panel]");
      const ruleId = panel?.dataset.ruleMenuPanel || "";
      const step = stepById?.(ruleId);
      if (!step) {
        atlasCloseRuleMenus();
        status?.("The selected rule is no longer available.", "warn");
        return;
      }
      atlasCloseRuleMenus();
      if (menuAction.matches("[data-add-reference-child-type]")) {
        atlasAddReferenceChildStep(
          step,
          menuAction.dataset.addReferenceChildType || "if_then",
        );
        return;
      }
      if (menuAction.matches("[data-add-child-step]")) {
        capture?.();
        addChildStep(step);
        return;
      }
      if (menuAction.matches("[data-create-inverse-else-step]")) {
        createInverseElseStepForIf?.(ruleId);
        return;
      }
      if (menuAction.matches("[data-add-step-after]")) {
        atlasAddStepAfter(ruleId);
        return;
      }
      if (menuAction.matches("[data-duplicate-logic-step]")) {
        atlasDuplicateStepById(ruleId);
        return;
      }
      if (menuAction.matches("[data-delete-step]")) {
        capture?.();
        if (step.autoGeneratedReference) {
          status?.(
            "Generated reference steps are removed by removing the source file.",
            "warn",
          );
          return;
        }
        state.audit.steps = state.audit.steps.filter(
          (item) => item.id !== ruleId,
        );
        atlasRequestStructuralStepRender?.();
        scheduleAutosave?.();
        return;
      }
      if (menuAction.matches("[data-indent]")) {
        capture?.();
        if (step.autoGeneratedReference) {
          status?.("Generated reference steps cannot be nested.", "warn");
          return;
        }
        if (!makeChildOfPrevious(step))
          status?.(
            "This step cannot be nested under the previous step.",
            "warn",
          );
        atlasRequestStructuralStepRender?.();
        scheduleAutosave?.();
        return;
      }
      if (menuAction.matches("[data-outdent]")) {
        capture?.();
        if (!outdentStep(step))
          status?.("This step is already top-level.", "warn");
        atlasRequestStructuralStepRender?.();
        scheduleAutosave?.();
      }
      return;
    }
    if (!event.target.closest("[data-rule-menu-panel]")) {
      atlasCloseRuleMenus();
    }
    const sort = event.target.closest("[data-picker-sort]");
    if (sort) {
      atlasFieldPickerSortMode = sort.dataset.pickerSort || "source";
      if (visualPickerState) renderMiniPicker();
      else renderSelectedStep();
    }
  },
  true,
);
(function atlasBindRuleMenuGeometryEvents() {
  let frame = 0;
  const schedulePosition = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const panel = [
        ...document.querySelectorAll("[data-rule-menu-panel]"),
      ].find((candidate) => !candidate.hidden);
      if (!panel) return;
      const ruleId = panel.dataset.ruleMenuPanel || "";
      const toggle = document.querySelector(
        `[data-rule-menu-toggle="${CSS.escape(ruleId)}"]`,
      );
      if (!toggle || !atlasPositionRuleMenu(toggle, panel))
        atlasCloseRuleMenus();
    });
  };
  window.addEventListener("resize", schedulePosition);
  document
    .querySelector("#stepsList")
    ?.addEventListener("scroll", schedulePosition, {
      passive: true,
    });
})();
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;

    const openPanel = [
      ...document.querySelectorAll("[data-rule-menu-panel]"),
    ].find((panel) => !panel.hidden);
    if (!openPanel) return;

    const ruleId = openPanel.dataset.ruleMenuPanel || "";
    atlasCloseRuleMenus();
    document
      .querySelector(`[data-rule-menu-toggle="${CSS.escape(ruleId)}"]`)
      ?.focus();
  },
  true,
);

if (typeof sourceOptionsHtml === "function") {
  sourceOptionsHtml = function atlasSelectedSourceOptionsHtmlForGuidedBuilders(
    selected = "",
  ) {
    return atlasSourceOptionsHtml(selected || "");
  };
}

if (typeof fieldOptionsHtml === "function") {
  fieldOptionsHtml = function atlasSelectedFieldOptionsHtmlForGuidedBuilders(
    sourceFile = "",
    selected = "",
  ) {
    return atlasFieldOptionsHtml(sourceFile || "", selected || "");
  };
}

/* Restored Reference sub-step behavior. */
function atlasInheritedReferenceSourceForStep(step) {
  let parent = stepById?.(step?.parentId);
  while (parent) {
    if (
      parent.autoGeneratedReference ||
      parent.step_type === "reference_source"
    )
      return parent.source || parent.params?.source_file || "";
    parent = stepById?.(parent.parentId);
  }
  return "";
}
function atlasNormalizeReferenceSubstep(step) {
  const inherited = atlasInheritedReferenceSourceForStep(step);
  if (!inherited || !step || step.autoGeneratedReference) return inherited;
  const alias =
    atlasSelectedSourceAlias?.(inherited) ||
    sourceAliasFor?.(inherited) ||
    inherited;
  step.source = inherited;
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  step.params.source_file = inherited;
  step.params.source_alias = alias;
  const conditions = (parseStepConditions?.(step) || []).map((condition) => ({
    ...condition,
    sourceFile: inherited,
    sourceAlias: alias,
    compareSourceFile: condition.compareSourceFile || inherited,
    compareSourceAlias:
      condition.compareSourceAlias ||
      sourceAliasFor?.(condition.compareSourceFile || inherited) ||
      alias,
  }));
  if (conditions.length) atlasWriteLiveEditorConditions?.(step, conditions);
  return inherited;
}
function atlasAddReferenceChildStep(referenceStep, requestedType = "if_then") {
  const childType = ["if_then", "create_column"].includes(requestedType)
    ? requestedType
    : "if_then";
  const inherited =
    referenceStep?.source || referenceStep?.params?.source_file || "";
  if (!inherited) {
    status?.("Reference source could not be determined.", "warn");
    return null;
  }
  capture?.();
  const alias =
    atlasSelectedSourceAlias?.(inherited) ||
    sourceAliasFor?.(inherited) ||
    inherited;
  const child = {
    id: uid("step"),
    enabled: true,
    parentId: referenceStep.id,
    branchType: "then",
    sortOrder: childrenOf(referenceStep.id).length + 1,
    title: childType === "create_column" ? "Create Column" : "IF / THEN",
    type:
      legacyTypeFromStepType?.(childType) ||
      (childType === "create_column" ? "create" : "if"),
    step_type: childType,
    source: inherited,
    field: "",
    action: "",
    notes: "",
    autoGeneratedReference: false,
    conditions: [],
    params: {
      source_file: inherited,
      source_alias: alias,
    },
  };
  normalizeCatalogStep?.(child);
  if (childType === "if_then") {
    const condition = defaultGuidedCondition?.(child) || {
      id: uid("cond"),
      connector: "IF",
      conditionType: "row_compare",
      sourceFile: inherited,
      sourceAlias: alias,
      fieldName: "",
      operator: "is equal to",
      valueMode: "values",
      compareValue: "",
    };
    condition.sourceFile = inherited;
    condition.sourceAlias = alias;
    atlasWriteLiveEditorConditions?.(child, [condition]);
    if (typeof atlasInitializeNewIfThenAction === "function") {
      delete child.params.then_action_type;
      atlasInitializeNewIfThenAction(child);
    }
    child.params.then_action_type = child.params.then_action_type || "freeform";
  }
  state.audit.steps.push(child);
  atlasNormalizeStepOrderGroups?.();
  state.selectedStepId = child.id;
  atlasRequestStructuralStepRender?.();
  scheduleAutosave?.();
  status?.(
    childType === "create_column"
      ? "Added a Create Column step under the Reference step."
      : "Added an IF / THEN condition under the Reference step.",
    "ok",
  );
  return child;
}
const atlasReferenceParentOptionsBase = parentOptionsForStep;
parentOptionsForStep = function parentOptionsForStepReferenceJoinGuard(step) {
  const options = atlasReferenceParentOptionsBase(step);
  if (step?.step_type !== "join") return options;
  return options.filter(
    (option) =>
      !option.id ||
      !(
        stepById?.(option.id)?.autoGeneratedReference ||
        stepById?.(option.id)?.step_type === "reference_source"
      ),
  );
};
const atlasReferenceSetParentBase = setStepParent;
setStepParent = function setStepParentReferenceJoinGuard(step, parentId) {
  const parent = parentId ? stepById?.(parentId) : null;
  if (
    step?.step_type === "join" &&
    parent &&
    (parent.autoGeneratedReference || parent.step_type === "reference_source")
  ) {
    status?.(
      "Join / Union steps must be top-level and cannot be Reference sub-steps.",
      "warn",
    );
    return false;
  }
  const changed = atlasReferenceSetParentBase(step, parentId);
  if (changed) atlasNormalizeReferenceSubstep(step);
  return changed;
};
document.addEventListener(
  "click",
  (event) => {
    const referenceControl = event.target.closest(
      "[data-add-reference-child-type]",
    );
    const control =
      referenceControl || event.target.closest("[data-add-child-step]");
    if (!control) return;
    const step = stepById?.(control.closest(".step-card")?.dataset.id || "");
    if (!step) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (referenceControl) {
      if (step.autoGeneratedReference || step.step_type === "reference_source")
        atlasAddReferenceChildStep(
          step,
          referenceControl.dataset.addReferenceChildType || "if_then",
        );
    } else {
      addChildStep(step);
    }
    atlasCloseRuleMenus?.();
  },
  true,
);
const atlasReferenceCommitBase = atlasCommitLiveEditor;
atlasCommitLiveEditor = function atlasCommitLiveEditorReferenceContext(
  options = {},
) {
  const stepId =
    document.querySelector("[data-live-editor-step-id]")?.dataset
      .liveEditorStepId || state.selectedStepId;
  const result = atlasReferenceCommitBase(options);
  const step = stepById?.(stepId);
  if (step) atlasNormalizeReferenceSubstep(step);
  return result;
};
const atlasReferenceSyncBase = syncAutoReferenceSteps;
syncAutoReferenceSteps = function syncAutoReferenceStepsWithDescendantCleanup(
  ...args
) {
  const before = (state.audit.steps || []).map((step) => ({
    id: step.id,
    parentId: step.parentId || null,
    reference:
      !!step.autoGeneratedReference || step.step_type === "reference_source",
  }));
  const result = atlasReferenceSyncBase(...args);
  const remaining = new Set((state.audit.steps || []).map((step) => step.id));
  const removeIds = new Set(
    before
      .filter((step) => step.reference && !remaining.has(step.id))
      .map((step) => step.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    before.forEach((step) => {
      if (
        step.parentId &&
        removeIds.has(step.parentId) &&
        !removeIds.has(step.id)
      ) {
        removeIds.add(step.id);
        changed = true;
      }
    });
  }
  if (removeIds.size)
    state.audit.steps = (state.audit.steps || []).filter(
      (step) => !removeIds.has(step.id),
    );
  if (state.selectedStepId && removeIds.has(state.selectedStepId))
    state.selectedStepId = state.audit.steps[0]?.id || null;
  return result;
};

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
const atlasSelectedAuditSourcesBeforeStringTransform =
  atlasSelectedAuditSources;
atlasSelectedAuditSources =
  function atlasSelectedAuditSourcesWithCalculatedFields() {
    const sources = atlasSelectedAuditSourcesBeforeStringTransform();
    const createdFields = (state.audit.fields || []).filter(
      (field) => field.calculated || field.created || field.custom,
    );
    if (
      createdFields.length &&
      !sources.some((source) => source.sourceFile === "Calculated Field")
    ) {
      sources.push({
        sourceFile: "Calculated Field",
        alias: "Calculated Field",
        fields: createdFields,
        sourceKey: "calculated-field",
      });
    }
    return sources;
  };

// ATLAS-SELECTED-SOURCE-LOOKUP:BEGIN
/**
 * Everything the selected-source list is built from: the display document, its
 * sources (each source's own properties and field count), the source catalog,
 * and the audit's calculated fields. Field objects are shared, not copied, so
 * edits inside a field are seen without a rebuild.
 */
function atlasSelectedSourceSnapshot() {
  const audit = atlasDisplayDocument?.() || state.audit;
  const sources = audit.sources || [];
  const auditFields = state.audit.fields || [];
  const snapshot = [
    audit,
    audit.sources,
    sources.length,
    atlasSourceDerivedVersion,
    sourceCatalogEntries(),
    auditFields,
    auditFields.length,
  ];
  sources.forEach((source) => {
    snapshot.push(source);
    if (!source || typeof source !== "object") return;
    const keys = Object.keys(source);
    snapshot.push(keys.length);
    keys.forEach((key) => snapshot.push(key, source[key]));
    snapshot.push(source.fields?.length);
  });
  auditFields.forEach((field) => {
    if (field?.calculated || field?.created || field?.custom)
      snapshot.push(field);
  });
  return snapshot;
}

function atlasSelectedSourceSnapshotMatches(previous, next) {
  if (!previous || previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1)
    if (!Object.is(previous[index], next[index])) return false;
  return true;
}

/**
 * Returns the resolved selected sources with per-lookup memos for source
 * resolution and stable keys. Pill rendering resolves sources many times per
 * quoted token; resolving each against the catalog every time made large audits
 * slow. Callers must not modify lookup.sources; public helpers return copies.
 */
function atlasSelectedSourceLookup() {
  const cache = atlasSelectedSourceLookupState;
  if (!cache.uncached)
    return {
      sources: atlasSelectedAuditSources(),
      resolved: new Map(),
      stableKeys: new Map(),
    };
  const snapshot = atlasSelectedSourceSnapshot();
  if (
    cache.lookup &&
    atlasSelectedSourceSnapshotMatches(cache.snapshot, snapshot)
  )
    return cache.lookup;
  cache.snapshot = snapshot;
  cache.lookup = {
    sources: cache.uncached(),
    resolved: new Map(),
    stableKeys: new Map(),
  };
  return cache.lookup;
}

atlasSelectedSourceLookupState.uncached = atlasSelectedAuditSources;
atlasSelectedAuditSources = function atlasSelectedAuditSourcesCached() {
  return atlasSelectedSourceLookup().sources.map((source) => ({ ...source }));
};
// ATLAS-SELECTED-SOURCE-LOOKUP:END

// Phase 2: string field/source behavior is handled by explicit commit adapters in 15g.
// ATLAS-STRING-TRANSFORM-UPDATE:END

// Content-only editor commits must not recreate the selected-step DOM.
// Structural commits are rendered by the base implementation when rerender is true.
const atlasDeterministicCommitBase = atlasCommitLiveEditor;
atlasCommitLiveEditor = function atlasCommitLiveEditorDeterministic(
  options = {},
) {
  return atlasDeterministicCommitBase(options);
};
