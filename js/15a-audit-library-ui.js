/**
 * 15a-audit-library-ui.js
 * Split from 15-visual-ui-upgrades.js.
 * Base visual UI state, picker behavior, condition rendering, and rule rendering layer.
 * IMPORTANT: classic browser script; preserve the 15a-15g load order.
 */
let visualPickerState = null;
const collapsedStepIds = new Set();
let draggedLogicStepId = "";
let dropTargetLogicStepId = "";


function pickerFieldOptions(sourceFile = "") {
  const sources = sourceFile
    ? sourceCatalogEntries().filter(
        (source) => source.sourceFile === sourceFile,
      )
    : sourceCatalogEntries();
  return sources.flatMap((source) =>
    (source.fields || []).map((field) => {
      const parts = fieldDisplayParts(field, source.sourceFile);
      return {
        sourceFile: source.sourceFile,
        sourceAlias: source.alias || source.sourceFile,
        fieldName: parts.raw,
        rawFieldName: parts.raw,
        vanityLabel: parts.vanity,
        label: parts.display,
        detail: parts.alternate,
        sourceColor:
          (state.audit.sources || []).find(
            (item) => item.name === source.sourceFile,
          )?.color || "",
      };
    }),
  );
}

function renderMiniPickerTrigger(kind, name, value, label, sourceFile = "") {
  const detail =
    kind === "source"
      ? sourceAliasFor?.(value) || ""
      : sourceFile
        ? `${sourceFile}.${value || "[field]"}`
        : value || "";
  const color =
    kind === "field"
      ? (state.audit.sources || []).find((source) => source.name === sourceFile)
          ?.color || ""
      : (state.audit.sources || []).find((source) => source.name === value)
          ?.color || "";
  const visibleValue =
    kind === "field" ? fieldDisplayName(value, sourceFile) : value;
  return `<div class="visual-picker-trigger-row mini-picker-trigger-row"><input type="hidden" data-param="${esc(name)}" value="${esc(value || "")}"><button type="button" class="visual-picker-trigger-button mini-picker-trigger" data-open-mini-picker="${kind}" data-param-name="${esc(name)}" data-picker-source="${esc(sourceFile || "")}"><span class="visual-picker-trigger-main">${color ? `<span class="source-color-dot" style="background:${esc(color)}"></span>` : ""}<strong>${esc(visibleValue || label || "Choose...")}</strong>${detail ? `<span class="visual-picker-pill-detail">${esc(detail)}</span>` : ""}</span><span class="visual-picker-trigger-caret">⌄</span></button></div>`;
}

if (typeof renderConditionRow === "function") {
  renderConditionRow = function visualConditionRow(condition, index) {
    const sourceFile = condition.sourceFile || "";
    const valueMode = condition.valueMode || "values";
    return `<div class="guided-condition-row visual-condition-card" data-condition-index="${index}" data-condition-id="${esc(condition.id || uid("cond"))}">
      <div class="condition-connector-row"><button type="button" class="condition-connector ${index === 0 ? "active" : ""}" data-condition-set="connector" data-condition-value="IF">IF</button><button type="button" class="condition-connector ${condition.connector === "AND" ? "active" : ""}" data-condition-set="connector" data-condition-value="AND">AND</button><button type="button" class="condition-connector ${condition.connector === "OR" ? "active" : ""}" data-condition-set="connector" data-condition-value="OR">OR</button><input type="hidden" data-condition-field="connector" value="${esc(index === 0 ? "IF" : condition.connector || "AND")}"></div>
      <label>Source File${renderConditionPickerTrigger("source", "sourceFile", sourceFile, sourceFile || "Choose source")}</label>
      <label>Field${renderConditionPickerTrigger("field", "fieldName", condition.fieldName || "", condition.fieldName || "Choose field", sourceFile)}</label>
      <label>Operator<select data-condition-field="operator">${optionsHtml(
        catalogArrayFromOptions({
          path: "app_config.logic_options.operators",
          fallback: ["is equal to"],
        }),
        condition.operator,
      )}</select></label>
      <label>Value Mode<div class="value-mode-pills"><button type="button" class="value-mode-pill ${valueMode === "values" ? "active" : ""}" data-condition-set="valueMode" data-condition-value="values">Values</button><button type="button" class="value-mode-pill ${valueMode === "field" ? "active" : ""}" data-condition-set="valueMode" data-condition-value="field">Field</button><button type="button" class="value-mode-pill ${valueMode === "blank" ? "active" : ""}" data-condition-set="valueMode" data-condition-value="blank">Blank</button><button type="button" class="value-mode-pill ${valueMode === "expression" ? "active" : ""}" data-condition-set="valueMode" data-condition-value="expression">Expression</button><input type="hidden" data-condition-field="valueMode" value="${esc(valueMode)}"></div></label>
      ${
        valueMode === "field"
          ? `<label>Compare Source${renderConditionPickerTrigger("source", "compareSourceFile", condition.compareSourceFile || sourceFile, condition.compareSourceFile || sourceFile || "Choose source")}</label><label>Compare Field${renderConditionPickerTrigger("field", "compareFieldName", condition.compareFieldName || "", condition.compareFieldName || "Choose field", condition.compareSourceFile || sourceFile)}</label>`
          : valueMode === "blank"
            ? `<div class="logic-editor-callout">No comparison value required.</div>`
            : valueMode === "expression"
              ? `<label>Expression<textarea data-condition-field="expression" placeholder="Enter expression">${esc(condition.expression || "")}</textarea></label>`
              : `<label>Values <span class="hint inline-hint">one value per line</span><textarea data-condition-field="compareValue" class="value-list-textarea" placeholder="One value per line">${esc(valuesToLines(condition.compareValue || ""))}</textarea></label>`
      }
      <button type="button" class="danger small" data-guided-delete-condition>Delete</button>
    </div>`;
  };
}

function valuesToLines(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function renderConditionPickerTrigger(
  kind,
  fieldName,
  value,
  label,
  sourceFile = "",
) {
  const visibleValue =
    kind === "field" ? fieldDisplayName(value, sourceFile) : value;
  return `<div class="visual-picker-trigger-row mini-picker-trigger-row"><input type="hidden" data-condition-field="${esc(fieldName)}" value="${esc(value || "")}"><button type="button" class="visual-picker-trigger-button mini-picker-trigger" data-open-mini-picker="${kind}" data-condition-name="${esc(fieldName)}" data-picker-source="${esc(sourceFile || "")}"><span class="visual-picker-trigger-main"><strong>${esc(visibleValue || label || "Choose...")}</strong></span><span class="visual-picker-trigger-caret">⌄</span></button></div>`;
}

function renderMiniPicker() {
  document
    .querySelector(".visual-picker-modal-backdrop.dynamic-mini-picker")
    ?.remove();
  if (!visualPickerState) return;
  const options =
    visualPickerState.kind === "source"
      ? pickerSourceOptions()
      : pickerFieldOptions(visualPickerState.sourceFile);
  const query = visualPickerState.query || "";
  const filtered = options.filter((option) =>
    `${option.sourceFile} ${option.sourceAlias} ${option.fieldName} ${option.label}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = new Map();
  filtered.forEach((option) => {
    const group =
      visualPickerState.kind === "source"
        ? sourceSystem({
            sourceFile: option.sourceFile,
            alias: option.sourceAlias,
          })
        : option.sourceFile;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
  });
  const root = document.createElement("div");
  root.className = "visual-picker-modal-backdrop dynamic-mini-picker";
  root.innerHTML = `<div class="visual-picker-modal"><div class="visual-picker-modal-header"><div><h2 class="visual-picker-modal-title">${visualPickerState.kind === "source" ? "Choose Source File" : "Choose Field"}</h2><p class="visual-picker-modal-subtitle">Search grouped source-table options.</p></div><button type="button" class="visual-picker-close-button" data-close-mini-picker>×</button></div><div class="visual-picker-search-wrap"><input class="visual-picker-search-input" data-mini-picker-search value="${esc(query)}" placeholder="Search..."></div><div class="visual-picker-content">${[...groups.entries()].map(([group, items]) => `<section class="visual-picker-group"><div class="visual-picker-group-heading"><button type="button" class="visual-picker-group-toggle"><span class="visual-picker-group-title">${esc(String(group).toUpperCase())}</span><span class="visual-picker-group-count">${items.length}</span></button></div><div class="visual-picker-pill-grid">${items.map((item) => `<button type="button" class="visual-picker-pill" data-mini-picker-value="${esc(visualPickerState.kind === "source" ? item.sourceFile : item.fieldName)}" data-mini-picker-source="${esc(item.sourceFile)}"><span class="visual-picker-pill-main">${esc(visualPickerState.kind === "source" ? item.sourceFile : item.label)}</span><span class="visual-picker-pill-detail">${esc(visualPickerState.kind === "source" ? item.sourceAlias : `${item.sourceFile}.${item.fieldName}`)}</span></button>`).join("")}</div></section>`).join("") || '<p class="hint">No options found.</p>'}</div></div>`;
  document.body.append(root);
  root.querySelector("[data-mini-picker-search]")?.focus();
}

// Picker selection is committed by commitPickerSelection() in 15g.

function moveManualStep(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const steps = state.audit.steps || [];
  const dragged = steps.find((step) => step.id === draggedId);
  const target = steps.find((step) => step.id === targetId);
  if (
    !dragged ||
    !target ||
    dragged.autoGeneratedReference ||
    target.autoGeneratedReference
  )
    return;
  const without = steps.filter((step) => step.id !== draggedId);
  const targetIndex = without.findIndex((step) => step.id === targetId);
  without.splice(targetIndex, 0, dragged);
  state.audit.steps = without;
  state.audit.steps.forEach((step, index) => {
    if (!step.autoGeneratedReference) step.sortOrder = index + 1;
  });
  renderAll();
  scheduleAutosave();
}


document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-source-tab]");
  if (tab) {
    activeSourceLibraryTab = tab.dataset.sourceTab;
    renderSourceFieldBrowser();
    return;
  }
  const audit = event.target.closest("[data-audit-library-value]");
  if (audit) {
    const select = $("auditLibrarySelect");
    if (select) select.value = audit.dataset.auditLibraryValue || "";
    loadSelectedLibraryAudit?.();
    return;
  }
  const palette = event.target.closest("[data-source-palette-color]");
  if (palette) {
    const card = palette.closest(".selected-source-card");
    const source = state.audit.sources.find(
      (item) => item.id === card?.dataset.id,
    );
    if (source) {
      source.color = palette.dataset.sourcePaletteColor;
      renderAll();
      scheduleAutosave();
    }
    return;
  }
  const stepType = event.target.closest("[data-set-step-type]");
  if (stepType) {
    const card = stepType.closest(".step-card");
    const step = state.audit.steps.find((item) => item.id === card?.dataset.id);
    if (step) {
      step.step_type = stepType.dataset.setStepType;
      step.type = legacyTypeFromStepType?.(step.step_type) || step.type;
      step.params = {};
      normalizeCatalogStep?.(step);
      renderAll();
      scheduleAutosave();
    }
    return;
  }
  const picker = event.target.closest("[data-open-mini-picker]");
  if (picker) {
    const targetStepId =
      picker.closest("[data-live-editor-step-id]")?.dataset.liveEditorStepId ||
      picker.closest(".step-card")?.dataset.stepId ||
      state.selectedStepId ||
      "";
    const targetStep = stepById?.(targetStepId);
    const fallbackSourceFile =
      picker.dataset.pickerSource ||
      picker.closest(".step-card")?.querySelector('[data-param="source_file"]')
        ?.value ||
      "";
    const eligibilitySourceFile =
      typeof atlasPickerScope === "function"
        ? atlasPickerScope(picker, targetStep)
        : fallbackSourceFile;
    visualPickerState = {
      kind: picker.dataset.openMiniPicker,
      name: picker.dataset.paramName || picker.dataset.conditionName,
      targetType: picker.dataset.conditionName ? "condition" : "param",
      selectedSourceFile: picker.dataset.pickerSource || "",
      sourceFile: eligibilitySourceFile,
      target: picker,
      targetStepId,
      conditionId:
        picker.closest(".guided-condition-row")?.dataset.conditionId || "",
      query: "",
    };
    renderMiniPicker();
    return;
  }
  const close = event.target.closest("[data-close-mini-picker]");
  if (close) {
    visualPickerState = null;
    document
      .querySelector(".visual-picker-modal-backdrop.dynamic-mini-picker")
      ?.remove();
    return;
  }
  const pick = event.target.closest("[data-mini-picker-value]");
  if (pick) {
    commitPickerSelection(
      pick.dataset.miniPickerValue || "",
      pick.dataset.miniPickerSource || "",
    );
    return;
  }
  const conditionSet = event.target.closest("[data-condition-set]");
  if (conditionSet) {
    const row = conditionSet.closest(".guided-condition-row");
    const hidden = row?.querySelector(
      `[data-condition-field="${CSS.escape(conditionSet.dataset.conditionSet)}"]`,
    );
    if (hidden) hidden.value = conditionSet.dataset.conditionValue || "";
    capture();
    renderAll();
    scheduleAutosave();
    return;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-mini-picker-search]") && visualPickerState) {
    visualPickerState.query = event.target.value;
    renderMiniPicker();
  }
  if (event.target.matches("[data-source-custom-color]")) {
    const card = event.target.closest(".selected-source-card");
    const source = state.audit.sources.find(
      (item) => item.id === card?.dataset.id,
    );
    if (source) {
      source.color = event.target.value;
      renderAll();
      scheduleAutosave();
    }
  }
});

document.addEventListener(
  "toggle",
  (event) => {
    const card = event.target.closest?.(".step-card");
    if (card && event.target.matches(".step-card")) {
      if (event.target.open) collapsedStepIds.delete(card.dataset.id);
      else collapsedStepIds.add(card.dataset.id);
    }
  },
  true,
);

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".visual-step-card");
  if (!card) return;
  draggedLogicStepId = card.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedLogicStepId);
});
document.addEventListener("dragover", (event) => {
  const card = event.target.closest(".visual-step-card");
  if (!card || !draggedLogicStepId) return;
  event.preventDefault();
  dropTargetLogicStepId = card.dataset.id;
  card.classList.add("logic-drop-target-row");
});
document.addEventListener("dragleave", (event) => {
  const card = event.target.closest(".visual-step-card");
  if (card) card.classList.remove("logic-drop-target-row");
});
document.addEventListener("drop", (event) => {
  const card = event.target.closest(".visual-step-card");
  if (!card) return;
  event.preventDefault();
  moveManualStep(
    draggedLogicStepId || event.dataTransfer.getData("text/plain"),
    card.dataset.id,
  );
  draggedLogicStepId = "";
  dropTargetLogicStepId = "";
});
document.addEventListener("dragend", () => {
  draggedLogicStepId = "";
  dropTargetLogicStepId = "";
});
