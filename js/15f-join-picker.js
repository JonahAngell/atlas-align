/**
 * 15f-join-picker.js
 * Split from 15-visual-ui-upgrades.js.
 * JOIN type picker, JOIN developer logic, and Venn visualization refinements.
 * IMPORTANT: classic browser script; preserve the 15a-15g load order.
 */
/* JOIN Venn Diagram Picker */
let atlasJoinPickerState = null;

function atlasJoinTypeDisplayName(joinType) {
  const normalized = String(joinType || "INNER JOIN").toUpperCase();
  if (normalized === "LEFT JOIN") return "LEFT JOIN";
  if (normalized === "RIGHT JOIN") return "RIGHT JOIN";
  if (normalized === "FULL OUTER JOIN") return "FULL OUTER JOIN";
  if (normalized === "UNION") return "UNION";
  return "INNER JOIN";
}

function atlasPhrasePlaceholder(key, fallback) {
  if (typeof phrasePlaceholder === "function")
    return phrasePlaceholder(key, fallback);
  return fallback;
}

function atlasJoinKeptRowsDescription(joinType) {
  const normalized = atlasJoinTypeDisplayName(joinType);
  if (normalized === "LEFT JOIN")
    return "All rows from the left source, plus matching rows from the right source.";
  if (normalized === "RIGHT JOIN")
    return "All rows from the right source, plus matching rows from the left source.";
  if (normalized === "FULL OUTER JOIN")
    return "All rows from both sources, whether matched or unmatched.";
  if (normalized === "UNION")
    return "Append rows from both sources into one combined output. Matching keys are not required.";
  return "Only rows where the left and right sources match.";
}

function atlasJoinSourceLabel(sourceFile) {
  if (!sourceFile) return "[source not selected]";
  const alias = sourceAliasFor?.(sourceFile) || sourceFile;
  return alias && alias !== sourceFile
    ? `${alias} (${sourceFile})`
    : sourceFile;
}

function atlasJoinDeveloperLogic(step) {
  normalizeCatalogStep?.(step);
  const p = step.params || {};
  const joinType = atlasJoinTypeDisplayName(p.join_type);
  const leftSource =
    p.left_source || atlasPhrasePlaceholder("left_source", "[left source]");
  const rightSource =
    p.right_source || atlasPhrasePlaceholder("right_source", "[right source]");
  const leftAlias = sourceAliasFor?.(leftSource) || leftSource;
  const rightAlias = sourceAliasFor?.(rightSource) || rightSource;
  if (joinType === "UNION") {
    const outputSource = p.output_source || step.source || "[combined output]";
    return `UNION: append rows from ${leftAlias} and ${rightAlias} into ${outputSource}. Matching keys are not required.`;
  }
  const pairs = atlasJoinKeyPairsInUse(p);
  const keys = (pairs.length ? pairs : [{ left_field: "", right_field: "" }])
    .map(
      (pair) =>
        `${leftAlias}.${pair.left_field || atlasPhrasePlaceholder("left_key", "[left key]")} ${pairs.length > 1 ? "=" : "to"} ${rightAlias}.${pair.right_field || atlasPhrasePlaceholder("right_key", "[right key]")}`,
    )
    .join(" AND ");
  return `${joinType}: ${atlasJoinKeptRowsDescription(joinType)} Join ${pairs.length > 1 ? "where " : ""}${keys}.`;
}

/** Join key list shown in the Join Type picker summary table. */
function atlasJoinKeySummary(params, side) {
  const fields = atlasJoinKeyPairsInUse(params).map(
    (pair) => pair[`${side}_field`] || `[${side} key not selected]`,
  );
  return fields.length ? fields.join(", ") : `[${side} key not selected]`;
}

function atlasJoinKeyRowHtml(pair, index, params = {}) {
  const entry = atlasNormalizeJoinKeyPair(pair);
  const position = index + 1;
  return `<div class="condition-value-row join-key-row" data-join-key-row data-join-key-id="${esc(entry.id)}"><input type="hidden" data-join-key-left value="${esc(entry.left_field)}"><input type="hidden" data-join-key-right value="${esc(entry.right_field)}"><div class="join-key-fields"><div class="join-key-field" data-join-key-side="left"><span class="join-key-side-label${index ? " sr-only" : ""}">Left Field</span>${fieldInputFromOptions({ name: "join_left_field", value: entry.left_field, placeholder: "Select left field", sourceFile: params.left_source })}</div><span class="join-key-equals" aria-hidden="true">=</span><div class="join-key-field" data-join-key-side="right"><span class="join-key-side-label${index ? " sr-only" : ""}">Right Field</span>${fieldInputFromOptions({ name: "join_right_field", value: entry.right_field, placeholder: "Select right field", sourceFile: params.right_source })}</div></div><button type="button" class="secondary small" data-remove-join-key aria-label="Remove key pair ${position}">Remove</button></div>`;
}

/**
 * Renders the join key pair editor. Uses the same add/remove row list as the
 * IF/THEN Comparison Values editor; every pair must match for rows to join.
 */
function atlasJoinKeysEditorHtml(step) {
  const p = step.params || {};
  const pairs = atlasJoinKeyPairsFromParams(p);
  const rows = pairs.length ? pairs : [atlasNormalizeJoinKeyPair({})];
  const headingId = `join-keys-heading-${esc(step.id || "step")}`;
  return `<div class="condition-values-editor join-keys-editor full" data-join-keys-editor role="group" aria-labelledby="${headingId}"><input type="hidden" data-param="left_source" value="${esc(p.left_source || "")}"><input type="hidden" data-param="right_source" value="${esc(p.right_source || "")}"><input type="hidden" data-param="left_field" value="${esc(rows[0].left_field)}"><input type="hidden" data-param="right_field" value="${esc(rows[0].right_field)}"><input type="hidden" data-param="join_keys_json" data-join-keys-json value="${esc(atlasSerializeJoinKeyPairs(rows))}"><div class="title-row compact-row"><span class="join-keys-heading" id="${headingId}">Join Keys</span><button type="button" class="secondary small" data-add-join-key>Add Key Pair</button></div><p class="hint">Rows match only when every key pair matches.</p><div class="condition-values-list join-keys-list">${rows.map((pair, index) => atlasJoinKeyRowHtml(pair, index, p)).join("")}</div></div>`;
}

function atlasJoinKeyPairsFromEditor(editor) {
  if (!editor) return [];
  return [...editor.querySelectorAll("[data-join-key-row]")].map((row) =>
    atlasNormalizeJoinKeyPair({
      id: row.dataset.joinKeyId,
      left_field: row.querySelector("[data-join-key-left]")?.value || "",
      right_field: row.querySelector("[data-join-key-right]")?.value || "",
    }),
  );
}

/** Writes the editor rows into its JSON and first-pair mirror inputs. */
function atlasSyncJoinKeysEditor(editor, { commit = true } = {}) {
  if (!editor) return;
  const params = atlasApplyJoinKeyPairs(
    {},
    atlasJoinKeyPairsFromEditor(editor),
  );
  const set = (selector, value) => {
    const input = editor.querySelector(selector);
    if (input) input.value = value;
  };
  set("[data-join-keys-json]", params.join_keys_json);
  set('[data-param="left_field"]', params.left_field);
  set('[data-param="right_field"]', params.right_field);
  editor.querySelectorAll("[data-join-key-row]").forEach((row, index) => {
    row
      .querySelector("[data-remove-join-key]")
      ?.setAttribute("aria-label", `Remove key pair ${index + 1}`);
    // Only the first row shows the side labels; later rows keep them for screen readers.
    row
      .querySelectorAll(".join-key-side-label")
      .forEach((label) => label.classList.toggle("sr-only", index > 0));
  });
  if (!commit) return;
  atlasCommitLiveEditor?.({ rerender: false });
  const stepId = editor.closest("[data-live-editor-step-id]")?.dataset
    .liveEditorStepId;
  const step = stepId ? stepById?.(stepId) : null;
  if (step) {
    step.params = step.params || {};
    atlasApplyJoinKeyPairs(step.params, atlasJoinKeyPairsFromEditor(editor));
  }
  atlasRequestRender?.({ preview: true, logicTable: true, validation: true });
  scheduleAutosave?.();
}

/** The left/right sources a join key editor is scoped to. */
function atlasJoinEditorSources(editor) {
  return {
    left_source:
      editor?.querySelector('[data-param="left_source"]')?.value || "",
    right_source:
      editor?.querySelector('[data-param="right_source"]')?.value || "",
  };
}

/** Re-renders the key rows, e.g. after a pick changes a side's source. */
function atlasRefreshJoinKeyRows(editor) {
  const list = editor?.querySelector(".join-keys-list");
  if (!list) return;
  const params = atlasJoinEditorSources(editor);
  list.innerHTML = atlasJoinKeyPairsFromEditor(editor)
    .map((pair, index) => atlasJoinKeyRowHtml(pair, index, params))
    .join("");
}

/**
 * Commits a field picked from a join key row. Returns false when the picker
 * target is not a join key row so the standard commit path runs instead.
 */
function atlasCommitJoinKeyPick(target, value, sourceFile = "", ref = null) {
  const row = target?.closest?.("[data-join-key-row]");
  const editor = row?.closest("[data-join-keys-editor]");
  if (!row || !editor) return false;
  const side =
    target.closest("[data-join-key-side]")?.dataset.joinKeySide === "right"
      ? "right"
      : "left";
  const rowId = row.dataset.joinKeyId;
  const index = [...editor.querySelectorAll("[data-join-key-row]")].indexOf(
    row,
  );
  const fieldControl = row.querySelector(`[data-join-key-${side}]`);
  if (fieldControl) fieldControl.value = value;
  const sourceControl = editor.querySelector(`[data-param="${side}_source"]`);
  if (sourceControl && sourceFile) sourceControl.value = sourceFile;
  atlasSyncJoinKeysEditor(editor);
  const stepId = editor.closest("[data-live-editor-step-id]")?.dataset
    .liveEditorStepId;
  const step = stepId ? stepById?.(stepId) : null;
  if (step) {
    if (sourceFile) step.params[`${side}_source`] = sourceFile;
    // Created-field metadata is tracked for the first pair's mirror param.
    if (index === 0) {
      const key = `${side}_field_field_ref`;
      if (ref) step.params[key] = ref;
      else delete step.params[key];
    }
  }
  atlasRefreshJoinKeyRows(editor);
  editor
    .querySelector(
      `[data-join-key-id="${CSS.escape(rowId)}"] [data-join-key-side="${side}"] [data-open-mini-picker]`,
    )
    ?.focus();
  return true;
}

document.addEventListener(
  "click",
  (event) => {
    const add = event.target.closest?.("[data-add-join-key]");
    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const editor = add.closest("[data-join-keys-editor]");
      const list = editor?.querySelector(".join-keys-list");
      if (!list) return;
      const params = atlasJoinEditorSources(editor);
      list.insertAdjacentHTML(
        "beforeend",
        atlasJoinKeyRowHtml(
          {},
          list.querySelectorAll("[data-join-key-row]").length,
          params,
        ),
      );
      atlasSyncJoinKeysEditor(editor, { commit: false });
      list.lastElementChild?.querySelector("[data-open-mini-picker]")?.focus();
      return;
    }
    const remove = event.target.closest?.("[data-remove-join-key]");
    if (remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const editor = remove.closest("[data-join-keys-editor]");
      const row = remove.closest("[data-join-key-row]");
      const list = editor?.querySelector(".join-keys-list");
      const focusTarget =
        row?.nextElementSibling?.querySelector("[data-remove-join-key]") ||
        row?.previousElementSibling?.querySelector("[data-remove-join-key]") ||
        editor?.querySelector("[data-add-join-key]");
      row?.remove();
      if (list && !list.querySelector("[data-join-key-row]"))
        list.insertAdjacentHTML(
          "beforeend",
          atlasJoinKeyRowHtml({}, 0, atlasJoinEditorSources(editor)),
        );
      atlasSyncJoinKeysEditor(editor);
      focusTarget?.focus();
    }
  },
  true,
);

function atlasRenderJoinTypePickerButton(step) {
  const joinType = atlasJoinTypeDisplayName(step.params?.join_type);
  return `<div class="join-type-trigger"><span>Join Type</span><input type="hidden" data-param="join_type" value="${esc(joinType)}"><div class="join-type-trigger-row"><span class="join-type-value-pill">${esc(joinType)}</span><button type="button" class="btn secondary small" data-open-join-picker="${esc(step.id)}">Choose Join Type</button></div><p class="hint">${esc(atlasJoinKeptRowsDescription(joinType))}</p></div>`;
}

const atlasJoinPreviousRenderGuidedBuilder = renderGuidedBuilder;
renderGuidedBuilder = function renderGuidedBuilderWithJoinVenn(step) {
  normalizeCatalogStep?.(step);
  if (step.step_type !== "join")
    return atlasJoinPreviousRenderGuidedBuilder(step);
  const p = step.params || {};
  const union = atlasJoinTypeDisplayName(p.join_type) === "UNION";
  const inputPair = union
    ? `<div class="logic-picker-pair join-union-input-pair"><label>Left Source${sourceInputFromOptions({ name: "left_source", value: p.left_source, placeholder: "Select source file" })}</label><label>Right Source${sourceInputFromOptions({ name: "right_source", value: p.right_source, placeholder: "Select source file" })}</label></div>`
    : atlasJoinKeysEditorHtml(step);
  return `<div class="guided-builder join-guided-builder"><h4>${union ? "Union Sources" : "Join"}</h4>${atlasRenderJoinTypePickerButton(step)}${inputPair}${union ? `<label>Output Source${sourceInputFromOptions({ name: "output_source", value: p.output_source, placeholder: "Select source file" })}</label><p class="hint join-builder-union-hint">Union appends rows from both files into one combined output. No matching key is needed.</p>` : ""}</div>`;
};

function atlasOpenJoinPicker(stepId) {
  const root = document.querySelector("[data-live-editor-step-id]");
  if (root) atlasCommitLiveEditor?.({ rerender: false });
  const step = state.audit.steps.find(
    (item) => item.id === stepId || item.id === state.selectedStepId,
  );
  if (!step || step.step_type !== "join") return;
  normalizeCatalogStep?.(step);
  atlasJoinPickerState = {
    stepId: step.id,
    pendingJoinType: atlasJoinTypeDisplayName(step.params?.join_type),
  };
  atlasRenderJoinPickerModal();
}

function atlasCloseJoinPicker({ restoreFocus = true } = {}) {
  const stepId = atlasJoinPickerState?.stepId || "";
  atlasJoinPickerState = null;
  document.querySelector(".join-picker-backdrop")?.remove();
  if (restoreFocus && stepId) {
    document
      .querySelector(`[data-open-join-picker="${CSS.escape(stepId)}"]`)
      ?.focus();
  }
}
function atlasConfirmJoinPicker() {
  if (!atlasJoinPickerState) return;
  const step = state.audit.steps.find(
    (item) => item.id === atlasJoinPickerState.stepId,
  );
  if (!step) return;
  step.params = step.params || {};
  step.params.join_type = atlasJoinTypeDisplayName(
    atlasJoinPickerState.pendingJoinType,
  );
  const editor = document.querySelector(
    `[data-live-editor-step-id="${CSS.escape(step.id)}"]`,
  );
  const hidden = editor?.querySelector('[data-param="join_type"]');
  if (hidden) hidden.value = step.params.join_type;
  atlasCloseJoinPicker({ restoreFocus: false });
  renderAll();
  scheduleAutosave();
}

document.addEventListener(
  "click",
  (event) => {
    const openButton = event.target.closest("[data-open-join-picker]");
    if (openButton) {
      atlasOpenJoinPicker(
        openButton.dataset.openJoinPicker || state.selectedStepId,
      );
      return;
    }
    const joinOption = event.target.closest("[data-join-type-option]");
    if (joinOption && atlasJoinPickerState) {
      atlasJoinPickerState.pendingJoinType = joinOption.dataset.joinTypeOption;
      atlasRenderJoinPickerModal();
      return;
    }
    if (event.target.closest("[data-confirm-join-picker]")) {
      atlasConfirmJoinPicker();
      return;
    }
    if (event.target.closest("[data-close-join-picker]")) {
      atlasCloseJoinPicker();
    }
  },
  true,
);

const atlasJoinPreviousRenderLogicTablePreviewRows =
  typeof renderLogicTablePreviewRows === "function"
    ? renderLogicTablePreviewRows
    : null;
renderLogicTablePreviewRows =
  function renderLogicTablePreviewRowsWithDeveloperLogic() {
    const target = $("logicBuilderTableBody");
    if (!target) return;
    const entries = atlasVisibleStepEntries
      ? atlasVisibleStepEntries()
      : hierarchicalStepEntries({ includeDisabled: true });
    target.innerHTML = entries.length
      ? entries
          .map((entry) => {
            const dev =
              typeof developerLogic === "function"
                ? developerLogic(entry.step)
                : "";
            return `<tr class="${state.selectedStepId === entry.step.id ? "selected-row" : ""}" data-table-step-id="${esc(entry.step.id)}"><td>${esc(entry.number)}</td><td>${esc(atlasStepTypeLabel ? atlasStepTypeLabel(entry.step) : entry.step.step_type || "Logic Step")}</td><td>${renderLogicWithPills(analystLogic(entry.step))}</td><td class="developer-logic-cell">${esc(dev)}</td><td>${entry.step.enabled === false ? '<span class="badge red">Disabled</span>' : '<span class="badge blue">Active</span>'}</td></tr>`;
          })
          .join("")
      : '<tr><td colspan="5" class="hint">No logic steps yet.</td></tr>';
  };

/* JOIN Venn overlap refinement - accurate two-circle overlap shading */
function atlasJoinIncludedRegionMarkup(joinType, clipId) {
  const normalized = atlasJoinTypeDisplayName(joinType);
  if (normalized === "INNER JOIN") {
    return `<circle class="join-venn-included join-venn-included-intersection" cx="155" cy="142" r="112" clip-path="url(#${clipId}-right)"></circle>`;
  }
  if (normalized === "LEFT JOIN") {
    return `<circle class="join-venn-included join-venn-included-left" cx="155" cy="142" r="112"></circle>`;
  }
  if (normalized === "RIGHT JOIN") {
    return `<circle class="join-venn-included join-venn-included-right" cx="245" cy="142" r="112"></circle>`;
  }
  return `<circle class="join-venn-included join-venn-included-left" cx="155" cy="142" r="112"></circle><circle class="join-venn-included join-venn-included-right" cx="245" cy="142" r="112"></circle>`;
}

function atlasJoinVennSvg(
  joinType,
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
) {
  const normalized = atlasJoinTypeDisplayName(joinType);
  const clipId = `joinClip${String(normalized).replace(/[^A-Z]/g, "")}`;
  return `<svg class="join-venn-svg" viewBox="0 0 400 300" role="img" aria-label="${esc(normalized)} Venn diagram showing included join output rows">
    <defs>
      <clipPath id="${clipId}-left"><circle cx="155" cy="142" r="112"></circle></clipPath>
      <clipPath id="${clipId}-right"><circle cx="245" cy="142" r="112"></circle></clipPath>
    </defs>
    <rect class="join-venn-canvas" x="0" y="0" width="400" height="300" rx="18"></rect>
    <circle class="join-venn-base join-venn-base-left" cx="155" cy="142" r="112" style="--join-source-color:${esc(leftColor)}"></circle>
    <circle class="join-venn-base join-venn-base-right" cx="245" cy="142" r="112" style="--join-source-color:${esc(rightColor)}"></circle>
    <circle class="join-venn-overlap-outline" cx="155" cy="142" r="112" clip-path="url(#${clipId}-right)"></circle>
    ${atlasJoinIncludedRegionMarkup(normalized, clipId)}
    <circle class="join-venn-stroke" cx="155" cy="142" r="112" style="--join-source-color:${esc(leftColor)}"></circle>
    <circle class="join-venn-stroke" cx="245" cy="142" r="112" style="--join-source-color:${esc(rightColor)}"></circle>
    <text class="join-venn-area-label join-venn-left-only-label" x="106" y="145">Left only</text>
    <text class="join-venn-area-label join-venn-match-label" x="200" y="145">Matched</text>
    <text class="join-venn-area-label join-venn-right-only-label" x="294" y="145">Right only</text>
    <foreignObject x="20" y="246" width="166" height="42"><div class="join-venn-source-label join-venn-source-left">${esc(leftLabel)}</div></foreignObject>
    <foreignObject x="214" y="246" width="166" height="42"><div class="join-venn-source-label join-venn-source-right">${esc(rightLabel)}</div></foreignObject>
  </svg>`;
}

function atlasJoinUnionSvg(
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
  outputLabel,
) {
  return `<svg class="join-union-visual" viewBox="0 0 520 300" role="img" aria-label="UNION appends rows from ${esc(leftLabel)} and ${esc(rightLabel)} into ${esc(outputLabel)}. Matching keys are not required.">
    <rect class="join-venn-canvas" x="0" y="0" width="520" height="300" rx="18"></rect>
    <rect class="join-union-source-box" x="70" y="38" width="380" height="64" rx="14" style="--join-source-color:${esc(leftColor)}"></rect>
    <text class="join-union-label" x="260" y="76" text-anchor="middle">${esc(leftLabel)}</text>
    <text class="join-union-plus" x="260" y="140" text-anchor="middle">+</text>
    <rect class="join-union-source-box" x="70" y="158" width="380" height="64" rx="14" style="--join-source-color:${esc(rightColor)}"></rect>
    <text class="join-union-label" x="260" y="196" text-anchor="middle">${esc(rightLabel)}</text>
    <path class="join-union-arrow" d="M260 228 V252 M248 242 L260 254 L272 242"></path>
    <rect class="join-union-output" x="120" y="258" width="280" height="34" rx="12"></rect>
    <text class="join-union-output-title" x="260" y="280" text-anchor="middle">${esc(outputLabel)}</text>
  </svg>`;
}
atlasRenderJoinPickerModal =
  function atlasRenderJoinPickerModalOverlapRefinement() {
    document.querySelector(".join-picker-backdrop")?.remove();
    if (!atlasJoinPickerState) return;
    const step = state.audit.steps.find(
      (item) => item.id === atlasJoinPickerState.stepId,
    );
    if (!step || step.step_type !== "join") {
      atlasCloseJoinPicker({ restoreFocus: false });
      return;
    }
    const p = step.params || {};
    const joinType = atlasJoinTypeDisplayName(
      atlasJoinPickerState.pendingJoinType,
    );
    const union = joinType === "UNION";
    const leftColor =
      atlasSelectedSourceColor?.(p.left_source) ||
      SOURCE_COLOR_PALETTE?.[0] ||
      "#4d6fa9";
    const rightColor =
      atlasSelectedSourceColor?.(p.right_source) ||
      SOURCE_COLOR_PALETTE?.[1] ||
      "#b54b4b";
    const leftLabel = atlasJoinSourceLabel(p.left_source);
    const rightLabel = atlasJoinSourceLabel(p.right_source);
    const outputLabel =
      p.output_source || step.source || "[combined output not selected]";
    const description = atlasJoinKeptRowsDescription(joinType);
    const visual = union
      ? atlasJoinUnionSvg(
          leftLabel,
          rightLabel,
          leftColor,
          rightColor,
          outputLabel,
        )
      : atlasJoinVennSvg(
          joinType,
          leftLabel,
          rightLabel,
          leftColor,
          rightColor,
        );
    const options = [
      ["INNER JOIN", "Matched rows only"],
      ["LEFT JOIN", "All left rows plus matches"],
      ["RIGHT JOIN", "All right rows plus matches"],
      ["FULL OUTER JOIN", "All rows from both sources"],
      ["UNION", "Append rows from both sources"],
    ];
    const optionButtons = options
      .map(([type, subtitle]) => {
        const selected = type === joinType;
        const label = type === "UNION" ? "UNION / APPEND ROWS" : type;
        return `<button type="button" class="join-type-rectangle${selected ? " active" : ""}${type === "UNION" ? " union" : ""}" data-join-type-option="${esc(type)}" aria-pressed="${selected ? "true" : "false"}" aria-selected="${selected ? "true" : "false"}"><span class="join-type-rectangle-copy"><span class="join-type-rectangle-label">${esc(label)}</span><span class="join-type-rectangle-subtitle">${esc(subtitle)}</span></span>${selected ? `<span class="join-type-rectangle-state" aria-hidden="true">Selected</span>` : ""}</button>`;
      })
      .join("");
    const root = document.createElement("div");
    root.className = "join-picker-backdrop";
    root.innerHTML = `<div class="join-picker-modal join-picker-modal-refined" role="dialog" aria-modal="true" aria-labelledby="join-picker-title" aria-describedby="join-picker-description"><div class="join-picker-header"><div><h2 class="join-picker-title" id="join-picker-title">Choose Join Type</h2><p class="hint" id="join-picker-description">Choose how the two sources are combined. Preview changes are temporary until Confirm is selected.</p></div><button type="button" class="btn ghost small" data-close-join-picker aria-label="Close Join Type picker">Cancel</button></div><div class="join-picker-refined-body"><section class="join-picker-type-list" role="group" aria-label="Join types">${optionButtons}</section><section class="join-picker-visual-column"><div class="join-picker-visual-card" data-join-type="${esc(joinType)}" style="--join-left-color:${esc(leftColor)};--join-right-color:${esc(rightColor)}">${visual}</div></section><section class="join-picker-details-card" aria-live="polite"><div class="join-picker-summary-card"><strong>${esc(union ? "UNION / APPEND ROWS" : joinType)}</strong><p>${esc(description)}</p></div><div class="join-picker-table-wrap"><table><thead><tr><th>Input</th><th>Source</th><th>Join Keys</th></tr></thead><tbody><tr><td>Left Source</td><td>${esc(leftLabel)}</td><td>${esc(union ? "Not applicable" : atlasJoinKeySummary(p, "left"))}</td></tr><tr><td>Right Source</td><td>${esc(rightLabel)}</td><td>${esc(union ? "Not applicable" : atlasJoinKeySummary(p, "right"))}</td></tr>${union ? `<tr><td>Output Source</td><td colspan="2">${esc(outputLabel)}</td></tr>` : ""}<tr><td>Developer Logic</td><td colspan="2">${esc(atlasJoinDeveloperLogic({ ...step, params: { ...p, join_type: joinType } }))}</td></tr></tbody></table></div></section></div><div class="join-picker-footer"><p class="hint">Confirm is required to preserve the selected relationship type.</p><div class="toolbar compact-toolbar"><button type="button" class="btn ghost" data-close-join-picker>Cancel</button><button type="button" class="btn primary" data-confirm-join-picker>Confirm</button></div></div></div>`;
    document.body.append(root);
    root.querySelector(`[data-join-type-option][aria-pressed="true"]`)?.focus();
  };
document.addEventListener(
  "keydown",
  (event) => {
    if (!atlasJoinPickerState) return;
    if (event.key === "Tab" && typeof atlasTrapTabKey === "function")
      return atlasTrapTabKey(
        event,
        document.querySelector(".join-picker-modal"),
      );
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    atlasCloseJoinPicker();
  },
  true,
);

window.ATLASJoinPicker = Object.freeze({
  open: atlasOpenJoinPicker,
  close: atlasCloseJoinPicker,
});
