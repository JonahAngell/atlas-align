/**
 * 15g-visual-ui-events.js
 * Split from 15-visual-ui-upgrades.js.
 * IF/THEN condition/action usability refinements, stable picker search, ELSE handling, and final resize/event refinements.
 * IMPORTANT: classic browser script; preserve the 15a-15g load order.
 */
/* Logic Step Editor usability refinement */
let atlasIfThenEditorTab = "conditions";

function atlasConditionValues(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function atlasConditionValueRows(value) {
  const values = atlasConditionValues(value);
  const list = values.length ? values : [""];
  return list
    .map(
      (item) =>
        `<div class="condition-value-row"><input data-condition-value-item value="${esc(item)}" placeholder="Comparison value"><button type="button" class="secondary small" data-remove-condition-value>Remove</button></div>`,
    )
    .join("");
}

function atlasConditionValueInputs(container) {
  return container
    ? [...container.querySelectorAll("[data-condition-value-item]")]
    : [];
}

function atlasUniqueConditionValues(container) {
  const seen = new Set();
  return atlasConditionValueInputs(container)
    .map((input) => String(input.value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function atlasUpdateConditionValueHidden(container) {
  if (!container) return;
  const hidden = container.querySelector(
    '[data-condition-field="compareValue"]',
  );
  if (!hidden) return;
  hidden.value = atlasUniqueConditionValues(container).join("\n");
}

function atlasConditionValueIsDuplicate(input, editor) {
  const value = String(input?.value || "").trim();
  if (!value || !editor) return false;
  return atlasConditionValueInputs(editor).some(
    (candidate) =>
      candidate !== input && String(candidate.value || "").trim() === value,
  );
}

function atlasCommitConditionValueInput(
  input,
  { clearDuplicate = false } = {},
) {
  const editor = input?.closest(".condition-values-editor");
  if (!input || !editor) return { committed: false, editor: null };

  input.value = String(input.value || "").trim();
  if (!input.value) {
    input.removeAttribute("aria-invalid");
    atlasUpdateConditionValueHidden(editor);
    return { committed: false, editor };
  }

  if (atlasConditionValueIsDuplicate(input, editor)) {
    if (clearDuplicate) {
      input.value = "";
      input.removeAttribute("aria-invalid");
    } else {
      input.setAttribute("aria-invalid", "true");
    }
    atlasUpdateConditionValueHidden(editor);
    return { committed: false, duplicate: true, editor };
  }

  input.removeAttribute("aria-invalid");
  atlasUpdateConditionValueHidden(editor);
  atlasCommitLiveEditor?.({ rerender: false });
  return { committed: true, editor };
}

function atlasFocusNextConditionValue(input, editor) {
  const inputs = atlasConditionValueInputs(editor);
  const index = inputs.indexOf(input);
  if (index >= 0 && inputs[index + 1]) {
    inputs[index + 1].focus();
    return;
  }

  const list = editor?.querySelector(".condition-values-list");
  if (!list) return;
  list.insertAdjacentHTML("beforeend", atlasConditionValueRows(""));
  const nextInput = atlasConditionValueInputs(editor).at(-1);
  nextInput?.focus();
}

renderConditionRow = function renderConditionRowUsability(condition, index) {
  const sourceFile = condition.sourceFile || "";
  const valueMode = condition.valueMode || "values";
  return `<div class="guided-condition-row refined-condition-row" data-condition-index="${index}" data-condition-id="${esc(condition.id || uid("cond"))}">
    <div class="condition-row-header"><span class="badge blue">${index === 0 ? "IF" : esc(condition.connector || "AND")}</span><select data-condition-field="connector"><option ${index === 0 ? "selected" : ""}>IF</option><option ${condition.connector === "AND" ? "selected" : ""}>AND</option><option ${condition.connector === "OR" ? "selected" : ""}>OR</option></select></div>
    <label>Source File${renderConditionPickerTrigger("source", "sourceFile", sourceFile, sourceFile || "Choose source")}</label>
    <label>Field${renderConditionPickerTrigger("field", "fieldName", condition.fieldName || "", condition.fieldName || "Choose field", sourceFile)}</label>
    <label>Operator<select data-condition-field="operator">${optionsHtml(
      catalogArrayFromOptions({
        path: "app_config.logic_options.operators",
        fallback: ["is equal to"],
      }),
      condition.operator,
    )}</select></label>
    <label>Value Mode<select data-condition-field="valueMode"><option value="values" ${valueMode === "values" ? "selected" : ""}>Values</option><option value="field" ${valueMode === "field" ? "selected" : ""}>Compare to Field</option><option value="blank" ${valueMode === "blank" ? "selected" : ""}>Blank / Null</option><option value="expression" ${valueMode === "expression" ? "selected" : ""}>Expression</option></select></label>
    ${
      valueMode === "field"
        ? `<label>Compare Source${renderConditionPickerTrigger("source", "compareSourceFile", condition.compareSourceFile || sourceFile, condition.compareSourceFile || sourceFile || "Choose source")}</label><label>Compare Field${renderConditionPickerTrigger("field", "compareFieldName", condition.compareFieldName || "", condition.compareFieldName || "Choose field", condition.compareSourceFile || sourceFile)}</label>`
        : valueMode === "blank"
          ? `<div class="logic-editor-callout full">No comparison value required.</div>`
          : valueMode === "expression"
            ? `<label class="full">Expression<textarea data-condition-field="expression">${esc(condition.expression || "")}</textarea></label>`
            : `
              <div class="condition-values-editor full">
                <div class="title-row compact-row">
                  <label>Comparison Values</label>
                  <button type="button" class="secondary small" data-add-condition-value>Add Value</button>
                </div>
                <input 
                  type="hidden" 
                  data-condition-field="compareValue" 
                  value="${esc(valuesToLines(condition.compareValue || ""))}">
                <div class="condition-values-list">${atlasConditionValueRows(condition.compareValue || "")}</div>
              </div>`
    }
    <button type="button" class="danger small" data-guided-delete-condition>Delete Condition</button>
  </div>`;
};

let atlasRenderThenActionBuilder = function atlasRenderThenActionBuilderInitial(
  p,
  prefix = "THEN",
) {
  return `<div class="then-action-builder refined-action-builder"><h4>${prefix} Action Builder</h4><label>${prefix} Action Type<select data-param="then_action_type"><option value="freeform" ${p.then_action_type === "freeform" ? "selected" : ""}>Freeform Text</option><option value="set_column_value" ${p.then_action_type === "set_column_value" ? "selected" : ""}>Set Column Value from Field</option><option value="display_text" ${p.then_action_type === "display_text" ? "selected" : ""}>Display Text Response in Column</option><option value="do_not_display" ${p.then_action_type === "do_not_display" ? "selected" : ""}>Do Not Display</option></select></label><label class="full">${prefix} Action<textarea data-param="then_action" placeholder="e.g., display records in the audit">${esc(p.then_action || "")}</textarea></label><label>Display Text<input data-param="then_text" value="${esc(p.then_text || "")}" placeholder="e.g., Research IT0027"></label><label>Output Column${fieldInputFromOptions(
    {
      name: "then_output_column",
      value:
        p.then_output_column ||
        phrasePlaceholder("error_message_column", "Error Message"),
      placeholder: "Select field",
      sourceFile: "",
    },
  )}</label><label>Target Column${fieldInputFromOptions({
    name: "then_target_column",
    value: p.then_target_column,
    placeholder: "Select field",
    sourceFile: "",
  })}</label><input type="hidden" data-param="then_value_source_file" value="${esc(p.then_value_field ? p.then_value_source_file || p.source_file || "" : "")}"><label>Value Field${fieldInputFromOptions(
    {
      name: "then_value_field",
      value: p.then_value_field,
      placeholder: "Select value field",
      sourceFile: p.then_value_field
        ? p.then_value_source_file || p.source_file
        : "",
    },
  )}</label></div>`;
};

const atlasUsabilityPreviousRenderGuidedBuilder = renderGuidedBuilder;
renderGuidedBuilder = function renderGuidedBuilderUsability(step) {
  normalizeCatalogStep(step);
  if (step.step_type === "if_then") return atlasRenderIfThenTabbedBuilder(step);
  if (step.step_type === "else")
    return `<div class="guided-builder"><h4>ELSE Action</h4><p class="hint">ELSE can apply an action or end with a colon so nested sub-steps can continue beneath it.</p>${atlasRenderThenActionBuilder(step.params || {}, "ELSE")}</div>`;
  return atlasUsabilityPreviousRenderGuidedBuilder(step);
};

atlasRenderStepEditor = function atlasRenderStepEditorUsability(step) {
  if (!step || step.autoGeneratedReference) {
    return '<div class="logic-editor-section"><p class="hint">Generated reference steps are controlled by selected source files. Select a manual rule to edit its logic criteria.</p></div>';
  }
  normalizeCatalogStep(step);
  return `<div class="logic-editor-form" data-live-editor-step-id="${esc(step.id)}">
    <section class="logic-editor-section step-settings-section">
      <h3>Step Settings</h3>
      <div class="logic-editor-grid single-column-settings">
        <div class="atlas-choice-field">${atlasChoiceControl({
          options: [
            ...atlasNewRuleTypeOptions(),
            ...(atlasNewRuleTypeOptions().some(
              ([value]) => value === step.step_type,
            )
              ? []
              : (STEP_TYPE_OPTIONS || []).filter(
                  ([value]) => value === step.step_type,
                )),
          ].map(([value, label]) => [
            value,
            label,
            atlasRuleTypeDescription(value),
          ]),
          selected: step.step_type,
          variant: "cards",
          label: "Step type",
          heading: "Step Type",
          popover: "pills",
          attributes: 'data-live-step-type-select=""',
        })}</div>
      </div>
    </section>
    <section class="logic-editor-section criteria-section">
      ${renderGuidedBuilder(step)}
    </section>
    <section class="logic-editor-section notes-section">
      <h3>Notes</h3>
      <label class="full"><span>Manual Notes</span><textarea data-step-notes-live placeholder="Notes for this step">${esc(step.notes || "")}</textarea></label>
    </section>
  </div>`;
};

renderSelectedStep = function renderSelectedStepUsabilityPane() {
  const step = state.audit.steps.find(
    (item) => item.id === state.selectedStepId,
  );
  const target = e.selectedStepDetails || $("selectedStepDetails");
  if (!target) return;
  if (!step) {
    target.innerHTML =
      '<p class="hint">Select or create a rule to edit step criteria.</p>';
    setText?.("selectedRuleBadge", "No rule selected");
    return;
  }
  const number = stepNumberFor(step.id) || "?";
  setText?.("selectedRuleBadge", `Step ${number}`);
  target.innerHTML = `${atlasRenderFieldSortControl?.() || ""}${atlasRenderStepEditor(step)}`;
};

document.addEventListener(
  "click",
  (event) => {
    const editorTab = event.target.closest("[data-editor-tab]");
    if (editorTab) {
      atlasIfThenEditorTab = editorTab.dataset.editorTab || "conditions";
      renderSelectedStep();
      return;
    }
    const addValue = event.target.closest("[data-add-condition-value]");
    if (addValue) {
      const editor = addValue.closest(".condition-values-editor");
      const list = editor?.querySelector(".condition-values-list");
      if (list)
        list.insertAdjacentHTML("beforeend", atlasConditionValueRows(""));
      atlasUpdateConditionValueHidden(editor);
      return;
    }
    const removeValue = event.target.closest("[data-remove-condition-value]");
    if (removeValue) {
      const editor = removeValue.closest(".condition-values-editor");
      const row = removeValue.closest(".condition-value-row");
      row?.remove();
      if (editor && !editor.querySelector("[data-condition-value-item]")) {
        editor
          .querySelector(".condition-values-list")
          ?.insertAdjacentHTML("beforeend", atlasConditionValueRows(""));
      }
      atlasUpdateConditionValueHidden(editor);
      atlasCommitLiveEditor?.({ rerender: false });
    }
  },
  true,
);

document.addEventListener(
  "input",
  (event) => {
    if (!event.target.matches("[data-condition-value-item]")) return;
    const editor = event.target.closest(".condition-values-editor");
    atlasUpdateConditionValueHidden(editor);
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    const input = event.target.closest?.("[data-condition-value-item]");
    if (!input || (event.key !== "Enter" && event.key !== "Tab")) return;

    if (event.key === "Tab") {
      // Commit before the browser advances focus. Exact matching is intentional:
      // comparison values are case-sensitive, so "ABC" and "abc" are distinct.
      atlasCommitConditionValueInput(input, { clearDuplicate: true });
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const result = atlasCommitConditionValueInput(input);
    if (result.duplicate) {
      input.select();
      status?.("That exact comparison value is already listed.", "warn");
      return;
    }
    if (!result.committed) return;
    atlasFocusNextConditionValue(input, result.editor);
  },
  true,
);

/* Follow-up Logic Step Editor refinements */
function catalogOperatorLabel(path, fallback) {
  if (typeof getCatalogValue !== "function") return fallback;
  const value = getCatalogValue(path, undefined);
  return typeof value === "string" && value ? value : fallback;
}

function atlasThenActionTypeChoices() {
  return [
    ["freeform", "Freeform Text", "Write the action in your own words."],
    [
      "set_column_value",
      "Set Column Value from Field",
      "Copy a field into the target column.",
    ],
    [
      "set_column_string_transform",
      "Set Column to String Transformation",
      "Take characters or a character count from a field.",
    ],
    [
      "set_column_calculation",
      "Set Column to Calculated Value",
      "Calculate a numeric result into the target column.",
    ],
    [
      "display_text",
      "Display Text Response in Column",
      "Show a text response in a column.",
    ],
    ["do_not_display", "Do Not Display", "Hide the matching record."],
  ];
}

function atlasThenActionTypeControl(prefix, actionType) {
  return `<div class="full action-type-row atlas-choice-field">${atlasChoiceControl(
    {
      options: atlasThenActionTypeChoices(),
      selected: actionType || "freeform",
      variant: "cards",
      label: `${prefix} action type`,
      heading: `${prefix} Action Type`,
      popover: "list",
      attributes: 'data-param="then_action_type"',
    },
  )}</div>`;
}

function atlasOperatorListForValueMode(valueMode) {
  const mode = valueMode || "values";
  if (mode === "blank") {
    return [
      catalogOperatorLabel(
        "analyst_logic.blank_comparison.is_blank",
        "is blank/null",
      ),
      catalogOperatorLabel(
        "analyst_logic.blank_comparison.is_not_blank",
        "is not blank/null",
      ),
    ];
  }
  return catalogArrayFromOptions({
    path: `app_config.logic_options.operator_sets.${
      mode === "field" || mode === "expression" ? mode : "values"
    }`,
    fallback:
      mode === "field"
        ? [
            "is equal to",
            "is not equal to",
            "contains",
            "does not contain",
            "starts with",
            "ends with",
            "is greater than",
            "is greater than or equal to",
            "is less than",
            "is less than or equal to",
          ]
        : mode === "expression"
          ? ["matches expression", "does not match expression"]
          : [
              "is equal to",
              "is not equal to",
              "contains",
              "does not contain",
              "starts with",
              "ends with",
            ],
  });
}

function atlasOperatorOptionsForValueMode(valueMode, selectedOperator = "") {
  const operators = atlasOperatorListForValueMode(valueMode);
  return optionsHtml(
    operators,
    operators.includes(selectedOperator) ? selectedOperator : operators[0],
  );
}

renderConditionRow = function renderConditionRowFollowUp(condition, index) {
  const sourceFile = condition.sourceFile || "";
  const valueMode = condition.valueMode || "values";
  return `<div class="guided-condition-row refined-condition-row" data-condition-index="${index}" data-condition-id="${esc(condition.id || uid("cond"))}">
    <div class="condition-row-header">${atlasChoiceControl({
      options: ["IF", "AND", "OR"],
      selected: index === 0 ? "IF" : condition.connector || "AND",
      variant: "segment",
      label: "Connector",
      attributes: 'data-condition-field="connector"',
    })}</div>
    <label>Source File${renderConditionPickerTrigger("source", "sourceFile", sourceFile, sourceFile || "Choose source")}</label>
    <label>Field${renderConditionPickerTrigger("field", "fieldName", condition.fieldName || "", condition.fieldName || "Choose field", sourceFile)}</label>
    <div class="atlas-choice-field">${atlasChoiceControl({
      options: [
        ["values", "Values", "Match one or more listed values."],
        ["field", "Compare to Field", "Compare this field to another field."],
        ["blank", "Blank / Null", "Match blank or null values."],
        ["expression", "Expression", "Match a written expression."],
      ],
      selected: valueMode,
      variant: "cards",
      label: "Value mode",
      heading: "Value Mode",
      popover: "list",
      attributes: 'data-condition-field="valueMode"',
    })}</div>
    <div class="atlas-choice-field">${atlasChoiceControl({
      options: atlasOperatorListForValueMode(valueMode),
      selected: condition.operator,
      variant: "chips",
      label: "Operator",
      heading: "Operator",
      popover: "list",
      attributes: 'data-condition-field="operator"',
    })}</div>
    ${
      valueMode === "field"
        ? `<label>Compare Source${renderConditionPickerTrigger("source", "compareSourceFile", condition.compareSourceFile || sourceFile, condition.compareSourceFile || sourceFile || "Choose source")}</label><label>Compare Field${renderConditionPickerTrigger("field", "compareFieldName", condition.compareFieldName || "", condition.compareFieldName || "Choose field", condition.compareSourceFile || sourceFile)}</label>`
        : valueMode === "blank"
          ? `<div class="logic-editor-callout full">No comparison value required.</div>`
          : valueMode === "expression"
            ? `<label class="full">Expression<textarea data-condition-field="expression">${esc(condition.expression || "")}</textarea></label>`
            : `<div class="condition-values-editor full">
                  <div class="title-row compact-row">
                    <label>Comparison Values</label>
                    <button 
                      type="button" 
                      class="secondary small" 
                      data-add-condition-value>
                        Add Value
                    </button>
                  </div>
                  <input 
                    type="hidden" 
                    data-condition-field="compareValue" 
                    value="${esc(valuesToLines(condition.compareValue || ""))}">
                  <div class="condition-values-list">${atlasConditionValueRows(condition.compareValue || "")}</div>
                </div>`
    }
    <button type="button" class="danger small" data-guided-delete-condition>Delete Condition</button>
  </div>`;
};

atlasRenderThenActionBuilder = function atlasRenderThenActionBuilderDynamic(
  p,
  prefix = "THEN",
) {
  const actionType = p.then_action_type || "freeform";
  const typeSelect = atlasThenActionTypeControl(prefix, actionType);
  if (actionType === "set_column_value") {
    return `<div class="then-action-builder refined-action-builder dynamic-action-builder">${typeSelect}<label>Target Column${fieldInputFromOptions(
      {
        name: "then_target_column",
        value: p.then_target_column,
        placeholder: "Select target field",
        sourceFile: "",
      },
    )}</label><input type="hidden" data-param="then_value_source_file" value="${esc(p.then_value_field ? p.then_value_source_file || p.source_file || "" : "")}"><label>Value Field${fieldInputFromOptions(
      {
        name: "then_value_field",
        value: p.then_value_field,
        placeholder: "Select value field",
        sourceFile: p.then_value_field
          ? p.then_value_source_file || p.source_file
          : "",
      },
    )}</label><label class="full">Action Notes<textarea data-param="then_action" placeholder="Optional notes for this action">${esc(p.then_action || "")}</textarea></label></div>`;
  }
  if (actionType === "display_text") {
    return `<div class="then-action-builder refined-action-builder dynamic-action-builder">${typeSelect}<label class="full">Display Text<input data-param="then_text" value="${esc(p.then_text || "")}" placeholder="Text to display for matching records"></label><label>Output Column${fieldInputFromOptions(
      {
        name: "then_output_column",
        value:
          p.then_output_column ||
          phrasePlaceholder("error_message_column", "Error Message"),
        placeholder: "Select field",
        sourceFile: "",
      },
    )}</label><label>Reference Field${fieldInputFromOptions({
      name: "then_target_column",
      value: p.then_target_column,
      placeholder: "Optional reference field",
      sourceFile: "",
    })}</label><label class="full">Action Notes<textarea data-param="then_action" placeholder="Optional notes for this action">${esc(p.then_action || "")}</textarea></label></div>`;
  }
  if (actionType === "do_not_display") {
    return `<div class="then-action-builder refined-action-builder dynamic-action-builder">${typeSelect}<div class="logic-editor-callout full">Matching records will not be displayed in the audit output for this branch.</div><input type="hidden" data-param="then_action" value="${esc(p.then_action || "Do not display matching records")}"></div>`;
  }
  return `<div class="then-action-builder refined-action-builder dynamic-action-builder">${typeSelect}<label class="full">Action<textarea data-param="then_action" placeholder="e.g., display records in the audit">${esc(p.then_action || "")}</textarea></label></div>`;
};

function atlasRenderIfThenTabbedBuilder(step) {
  normalizeCatalogStep(step);
  const p = step.params || {};
  const conditions = parseStepConditions?.(step) || [];
  if (!conditions.length) {
    conditions.push(
      defaultGuidedCondition?.(step) || {
        id: uid("cond"),
        connector: "IF",
        conditionType: "row_compare",
        sourceFile: step.source || p.source_file || "",
        sourceAlias: sourceAliasFor?.(step.source || p.source_file || "") || "",
        fieldName: step.field || p.field_name || "",
        operator: "is equal to",
        valueMode: "values",
        compareValue: "",
      },
    );
    writeLiveConditions?.(step, conditions);
  }
  const conditionsHtml = `<div class="condition-guided-stack">${conditions
    .map((condition, index) => renderConditionRow(condition, index))
    .join(
      "",
    )}</div><div class="row"><button type="button" class="secondary small" data-guided-add-condition="AND">+ AND</button><button type="button" class="secondary small" data-guided-add-condition="OR">+ OR</button></div>`;
  const actionHtml = atlasRenderThenActionBuilder(p);
  return `
    <div class="guided-builder if-then-tabbed-builder">
      <div class="logic-editor-tabs">
        <button 
          type="button" 
          class="logic-editor-tab ${atlasIfThenEditorTab === "conditions" ? "active" : ""}" 
          data-editor-tab="conditions">
            Condition Builder
        </button>
        
        <button 
          type="button" 
          class="logic-editor-tab ${atlasIfThenEditorTab === "actions" ? "active" : ""}" 
          data-editor-tab="actions">
            Action Builder
        </button>
      </div>
      
      <div 
        class="logic-editor-tab-panel ${atlasIfThenEditorTab === "conditions" ? "active" : ""}" 
        data-editor-panel="conditions">
          ${conditionsHtml}
      </div>
      
      <div 
        class="logic-editor-tab-panel ${atlasIfThenEditorTab === "actions" ? "active" : ""}" 
        data-editor-panel="actions">
          ${actionHtml}
      </div>
    </div>`;
}

renderGuidedBuilder = function renderGuidedBuilderFollowUp(step) {
  normalizeCatalogStep(step);
  if (step.step_type === "if_then") return atlasRenderIfThenTabbedBuilder(step);
  if (step.step_type === "else")
    return `<div class="guided-builder else-action-builder"><p class="hint">Configure what happens when the IF conditions are not met.</p>${atlasRenderThenActionBuilder(step.params || {}, "ELSE")}</div>`;
  return atlasUsabilityPreviousRenderGuidedBuilder(step);
};

renderSelectedStep = function renderSelectedStepFollowUpPane() {
  const step = state.audit.steps.find(
    (item) => item.id === state.selectedStepId,
  );
  const target = e.selectedStepDetails || $("selectedStepDetails");
  if (!target) return;
  if (!step) {
    target.innerHTML =
      '<p class="hint">Select or create a rule to edit step criteria.</p>';
    setText?.("selectedRuleBadge", "No rule selected");
    return;
  }
  const number = stepNumberFor(step.id) || "?";
  setText?.("selectedRuleBadge", `Step ${number}`);
  target.innerHTML = `${atlasRenderStepEditor(step)}`;
  requestAnimationFrame(atlasSyncRulesHeightToEditor);
};

function atlasSyncRulesHeightToEditor() {
  const rules = document.querySelector(".logic-rules-card");
  const list = document.querySelector(".logic-rules-card .logic-list");
  if (!rules || !list) return;
  rules.style.removeProperty("height");
  rules.style.removeProperty("min-height");
  list.style.removeProperty("max-height");
  list.style.removeProperty("overflow-y");
}

if (typeof ResizeObserver !== "undefined") {
  const atlasLogicResizeObserver = new ResizeObserver(() =>
    atlasSyncRulesHeightToEditor(),
  );
  requestAnimationFrame(() => {
    const editor = document.querySelector(".live-output-card");
    if (editor) atlasLogicResizeObserver.observe(editor);
    atlasSyncRulesHeightToEditor();
  });
} else {
  window.addEventListener("resize", atlasSyncRulesHeightToEditor);
}

function atlasMiniPickerResultsHtml() {
  if (!visualPickerState) return "";
  const options =
    visualPickerState.kind === "source"
      ? pickerSourceOptions()
      : pickerFieldOptions(visualPickerState.sourceFile);
  const query = visualPickerState.query || "";
  const filtered = atlasSortedPickerItems(
    options.filter((option) =>
      `${option.sourceFile} ${option.sourceAlias} ${option.fieldName} ${option.label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  const groups = new Map();
  filtered.forEach((option) => {
    const group =
      atlasFieldPickerSortMode === "alpha"
        ? firstLetter(option.label || option.fieldName || option.sourceFile)
        : visualPickerState.kind === "source"
          ? "Selected Sources"
          : option.sourceFile;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(option);
  });
  return (
    [...groups.entries()]
      .map(
        ([group, items]) =>
          `<section class="visual-picker-group"><div class="visual-picker-group-header"><strong>${esc(String(group))}</strong><span>${items.length}</span></div><div class="visual-picker-pill-grid">${items.map((item) => `<button type="button" class="visual-picker-pill" data-mini-picker-value="${esc(visualPickerState.kind === "source" ? item.sourceFile : item.fieldName)}" data-mini-picker-source="${esc(item.sourceFile)}" style="--pill-color:${esc(item.sourceColor || atlasSelectedSourceColor(item.sourceFile))};--source-color:${esc(item.sourceColor || atlasSelectedSourceColor(item.sourceFile))}"><span class="source-color-dot" style="background:${esc(item.sourceColor || atlasSelectedSourceColor(item.sourceFile))}"></span><span class="visual-picker-pill-main">${esc(visualPickerState.kind === "source" ? item.sourceFile : item.label)}</span><span class="visual-picker-pill-detail">${esc(visualPickerState.kind === "source" ? item.sourceAlias : `${item.sourceAlias}.${item.fieldName}`)}</span></button>`).join("")}</div></section>`,
      )
      .join("") ||
    '<p class="hint visual-picker-empty">No selected source fields match the current search.</p>'
  );
}

renderMiniPicker = function renderMiniPickerStableSearch() {
  document
    .querySelector(".visual-picker-modal-backdrop.dynamic-mini-picker")
    ?.remove();
  if (!visualPickerState) return;
  const root = document.createElement("div");
  root.className = "visual-picker-modal-backdrop dynamic-mini-picker";
  root.innerHTML = `<div class="visual-picker-modal"><div class="visual-picker-modal-header"><div><h2 class="visual-picker-modal-title">${visualPickerState.kind === "source" ? "Choose Selected Source File" : "Choose Field"}</h2><p class="visual-picker-modal-subtitle">Only sources selected for this audit are available here.</p></div><button type="button" class="visual-picker-close-button" data-close-mini-picker>×</button></div><div class="visual-picker-search-row"><input data-mini-picker-search value="${esc(visualPickerState.query || "")}" placeholder="Search selected sources and fields..."><div class="mini-picker-sort-toggle"><button type="button" class="secondary small ${atlasFieldPickerSortMode === "source" ? "active" : ""}" data-picker-sort="source">Sort by Source</button><button type="button" class="secondary small ${atlasFieldPickerSortMode === "alpha" ? "active" : ""}" data-picker-sort="alpha">A-Z</button></div></div><div class="visual-picker-content" data-mini-picker-results>${atlasMiniPickerResultsHtml()}</div></div>`;
  document.body.append(root);
  const input = root.querySelector("[data-mini-picker-search]");
  input?.focus();
  if (input) input.setSelectionRange(input.value.length, input.value.length);
};

function atlasRefreshMiniPickerResults() {
  const results = document.querySelector("[data-mini-picker-results]");
  if (results) results.innerHTML = atlasMiniPickerResultsHtml();
}

document.addEventListener(
  "input",
  (event) => {
    if (
      !event.target.matches("[data-mini-picker-search]") ||
      !visualPickerState
    )
      return;
    event.stopImmediatePropagation();
    visualPickerState.query = event.target.value;
    atlasRefreshMiniPickerResults();
  },
  true,
);

document.addEventListener(
  "change",
  (event) => {
    const valueMode = event.target.closest(
      '[data-condition-field="valueMode"]',
    );
    if (valueMode) {
      const row = valueMode.closest(".guided-condition-row");
      const operator = row?.querySelector('[data-condition-field="operator"]');
      if (operator) {
        const operators = atlasOperatorListForValueMode(valueMode.value);
        const selected = operators.includes(operator.value)
          ? operator.value
          : operators[0];
        if (operator.closest(".atlas-choice"))
          atlasSetChoiceOptions(operator, operators, selected);
        else
          operator.innerHTML = atlasOperatorOptionsForValueMode(
            valueMode.value,
            operator.value,
          );
      }
    }
    if (event.target.closest('[data-param="then_action_type"]'))
      atlasCommitLiveEditor?.({ rerender: true });
  },
  true,
);

/* Legacy inline ELSE creation removed. Linked inverse steps are created from the rule action menu. */

/* Restored logic issue invalidation and New Rule menu from the working visual UI. */
/* Canonical Audit Issue caching is owned by js/23-atlas-audit-issues.js. */
let atlasNewRuleMenuOpen = false;
function atlasInitializeNewIfThenAction(
  step,
  fields = state.audit.fields || [],
) {
  if (!step || step.step_type !== "if_then") return step;
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  if (step.params.then_action_type || step.params.then_output_column)
    return step;
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const matches = (fields || []).filter((field) => {
    if (!atlasIsCustomField?.(field)) return false;
    return [field.rawFieldName, field.fieldName, field.name, field.label].some(
      (value) => normalize(value) === "error message",
    );
  });
  if (matches.length !== 1) return step;
  const field = matches[0];
  const identity = String(
    field.rawFieldName || field.fieldName || field.name || field.label || "",
  ).trim();
  if (!identity) return step;
  step.params.then_action_type = "display_text";
  step.params.then_output_column = identity;
  return step;
}
function atlasNewRuleTypeOptions() {
  const selectableTypes = [
    ["create_column", "Create Column"],
    ["if_then", "If/Then"],
    ["join", "Join/Union Sources"],
    ["format_field", "Format Field"],
    ["sort_records", "Sort Records"],
  ];
  return selectableTypes.filter(([value]) =>
    (STEP_TYPE_OPTIONS || []).some(([catalogValue]) => catalogValue === value),
  );
}
function atlasDefaultSourceForNewRule() {
  return (
    state.audit.sources?.find((source) => !source.autoGeneratedReference)
      ?.name ||
    state.audit.sources?.[0]?.name ||
    ""
  );
}
function atlasNewRuleStepLabel(stepType) {
  return (
    (STEP_TYPE_OPTIONS || []).find(([value]) => value === stepType)?.[1] ||
    stepType ||
    "Rule"
  );
}
function atlasReindexManualRules() {
  (state.audit.steps || []).forEach((step, index) => {
    if (!step.autoGeneratedReference) step.sortOrder = index + 1;
  });
}
function atlasCreateRuleOfType(stepType, { afterStepId = "" } = {}) {
  const type = atlasNewRuleTypeOptions().some(([value]) => value === stepType)
    ? stepType
    : "if_then";
  const sourceFile = atlasDefaultSourceForNewRule();
  const step = {
    id: uid("step"),
    enabled: true,
    parentId: null,
    branchType: "root",
    sortOrder: (state.audit.steps || []).length + 1,
    title: atlasNewRuleStepLabel(type),
    type: legacyTypeFromStepType?.(type) || "if",
    step_type: type,
    source: sourceFile,
    field: "",
    action: "",
    notes: "",
    conditions:
      type === "if_then"
        ? [{ id: uid("cond"), field: "", operator: "is equal to", value: "" }]
        : [],
    params: sourceFile
      ? {
          source_file: sourceFile,
          source_alias: sourceAliasFor?.(sourceFile) || sourceFile,
        }
      : {},
  };
  normalizeCatalogStep?.(step);
  if (type === "if_then") {
    delete step.params.then_action_type;
    atlasInitializeNewIfThenAction(step);
    step.params.then_action_type = step.params.then_action_type || "freeform";
  }
  if (type === "if_then" && !step.params.conditions_json) {
    step.params.conditions_json = JSON.stringify([
      defaultGuidedCondition?.(step) || {
        id: uid("cond"),
        connector: "IF",
        conditionType: "row_compare",
        sourceFile,
        sourceAlias: sourceAliasFor?.(sourceFile) || sourceFile,
        fieldName: "",
        operator: "is equal to",
        valueMode: "values",
        compareValue: "",
      },
    ]);
  }
  const steps = state.audit.steps || [];
  const index = afterStepId
    ? steps.findIndex((item) => item.id === afterStepId)
    : -1;
  if (index >= 0) steps.splice(index + 1, 0, step);
  else steps.push(step);
  state.audit.steps = steps;
  atlasReindexManualRules();
  state.selectedStepId = step.id;
  atlasCloseNewRuleTypeMenu();
  atlasRequestStructuralStepRender?.();
  scheduleAutosave();
  status?.(`Added ${atlasNewRuleStepLabel(type)} rule.`, "ok");
  atlasRevealLogicStepPane?.();
  return step;
}
function atlasRuleTypeDescription(stepType) {
  const descriptions = {
    create_column: "Create or populate an output column.",
    if_then: "Add conditional IF / THEN logic.",
    join: "Combine sources with Join or Union logic.",
    format_field: "Format values in a selected field.",
    split_field: "Split a field into a derived output.",
    sort_records: "Sort records by a selected field.",
    remove_duplicates: "Handle duplicate records.",
    filter_rows: "Keep or exclude matching rows.",
    flag_records: "Flag matching records or hide them.",
  };
  return descriptions[stepType] || "Add this rule type.";
}
function atlasCloseNewRuleTypeMenu({ restoreFocus = false } = {}) {
  atlasNewRuleMenuOpen = false;
  document.querySelector(".new-rule-menu-panel")?.remove();
  const button = document.getElementById("addStepBtn");
  button?.setAttribute("aria-expanded", "false");
  if (restoreFocus) button?.focus();
}
function atlasPositionNewRuleTypeMenu(
  panel = document.querySelector(".new-rule-menu-panel"),
  button = document.getElementById("addStepBtn"),
) {
  if (!panel || !button) return;
  const rect = button.getBoundingClientRect();
  const panelWidth = Math.min(
    360,
    window.innerWidth - 24,
    Math.max(260, panel.offsetWidth || 320),
  );
  panel.style.width = `${panelWidth}px`;
  panel.style.left = `${Math.min(window.innerWidth - panelWidth - 12, Math.max(12, rect.left))}px`;
  const below = window.innerHeight - rect.bottom - 20;
  const above = rect.top - 20;
  const height = panel.offsetHeight;
  if (height > below && above > below) {
    panel.style.top = `${Math.max(12, rect.top - 8 - Math.min(height, above))}px`;
    panel.style.maxHeight = `${above}px`;
  } else {
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.maxHeight = `${Math.max(160, below)}px`;
  }
}
function atlasOpenNewRuleTypeMenu(
  button = document.getElementById("addStepBtn"),
) {
  if (!button) return;
  document.querySelector(".new-rule-menu-panel")?.remove();
  const panel = document.createElement("div");
  panel.className = "new-rule-menu-panel";
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", "Choose rule type");
  panel.innerHTML = atlasNewRuleTypeOptions()
    .map(
      ([value, label]) =>
        `<button type="button" class="new-rule-type-option" role="menuitem" tabindex="-1" data-new-rule-type="${esc(value)}"><span class="new-rule-type-label">${esc(label)}</span><span class="new-rule-type-description">${esc(atlasRuleTypeDescription(value))}</span></button>`,
    )
    .join("");
  document.body.append(panel);
  atlasPositionNewRuleTypeMenu(panel, button);
  button.setAttribute("aria-expanded", "true");
  atlasNewRuleMenuOpen = true;
  panel.querySelector("[data-new-rule-type]")?.focus();
}
function atlasToggleNewRuleTypeMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const button =
    event?.currentTarget ||
    event?.target ||
    document.getElementById("addStepBtn");
  if (atlasNewRuleMenuOpen) atlasCloseNewRuleTypeMenu();
  else atlasOpenNewRuleTypeMenu(button);
}
document.addEventListener(
  "click",
  (event) => {
    const typeButton = event.target.closest("[data-new-rule-type]");
    if (typeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      atlasCreateRuleOfType(typeButton.dataset.newRuleType || "if_then");
      return;
    }
    if (
      atlasNewRuleMenuOpen &&
      !event.target.closest(".new-rule-menu-panel") &&
      !event.target.closest("#addStepBtn")
    )
      atlasCloseNewRuleTypeMenu();
  },
  true,
);
document.addEventListener(
  "keydown",
  (event) => {
    if (!atlasNewRuleMenuOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      atlasCloseNewRuleTypeMenu({ restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      atlasCloseNewRuleTypeMenu();
      return;
    }
    const items = [
      ...document.querySelectorAll(".new-rule-menu-panel [role=menuitem]"),
    ];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const nextIndex = {
      ArrowDown: current < 0 ? 0 : (current + 1) % items.length,
      ArrowUp: current <= 0 ? items.length - 1 : current - 1,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    items[nextIndex].focus();
  },
  true,
);
window.addEventListener("resize", () => {
  if (atlasNewRuleMenuOpen) atlasPositionNewRuleTypeMenu();
});
document.addEventListener(
  "scroll",
  (event) => {
    if (
      atlasNewRuleMenuOpen &&
      !event.target?.closest?.(".new-rule-menu-panel")
    )
      atlasPositionNewRuleTypeMenu();
  },
  true,
);

/* Linked inverse-step behavior. */
function atlasLinkedInverseForSource(stepId) {
  return (
    (state.audit.steps || []).find(
      (step) =>
        step.params?.inverse_else === "Yes" &&
        step.params?.inverse_of_step_id === stepId,
    ) || null
  );
}

function atlasMigrateLegacyInverseStep(step, sourceStep) {
  if (!step || !sourceStep) return step;
  step.step_type = "if_then";
  step.type = "if";
  step.parentId = sourceStep.parentId || null;
  step.branchType =
    sourceStep.branchType || (sourceStep.parentId ? "then" : "root");
  step.title = "Linked Inverse";
  step.inverseOfStepId = sourceStep.id;
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  step.params.inverse_else = "Yes";
  step.params.inverse_of_step_id = sourceStep.id;
  delete step.params.include_else_branch;
  return step;
}

function syncInverseElseStepsForSource(stepId) {
  const sourceStep = stepById?.(stepId);
  if (
    !sourceStep ||
    sourceStep.step_type !== "if_then" ||
    sourceStep.params?.inverse_else === "Yes"
  )
    return false;

  const linked = (state.audit.steps || []).filter(
    (step) =>
      (step.params?.inverse_else === "Yes" &&
        step.params?.inverse_of_step_id === stepId) ||
      (step.step_type === "else" &&
        (step.inverseOfStepId === stepId ||
          step.params?.inverse_of_step_id === stepId)),
  );
  if (!linked.length) return false;

  linked.forEach((inverseStep) => {
    atlasMigrateLegacyInverseStep(inverseStep, sourceStep);
    const conditions = atlasCloneInverseConditionsForTarget(
      sourceStep,
      inverseStep,
    );
    const sourceFile = atlasSourceForInverseStep(sourceStep, conditions);
    const sourceAlias = sourceAliasFor?.(sourceFile) || sourceFile;
    atlasWriteLiveEditorConditions?.(inverseStep, conditions);
    inverseStep.source = sourceFile;
    inverseStep.params.source_file = sourceFile;
    inverseStep.params.source_alias = sourceAlias;
  });
  return true;
}

function createInverseElseStepForIf(stepId) {
  atlasCommitLiveEditor?.({ rerender: false });
  const sourceStep = stepById?.(stepId);
  if (
    !sourceStep ||
    sourceStep.autoGeneratedReference ||
    sourceStep.step_type !== "if_then" ||
    sourceStep.params?.inverse_else === "Yes"
  ) {
    status?.(
      "Create Linked Inverse is available only for editable source IF / THEN steps.",
      "warn",
    );
    return null;
  }

  let inverseStep = atlasLinkedInverseForSource(stepId);
  if (!inverseStep) {
    const legacy = (state.audit.steps || []).find(
      (step) =>
        step.step_type === "else" &&
        (step.inverseOfStepId === stepId ||
          step.params?.inverse_of_step_id === stepId),
    );
    if (legacy) inverseStep = atlasMigrateLegacyInverseStep(legacy, sourceStep);
  }

  if (!inverseStep) {
    capture?.();
    normalizeCatalogStep?.(sourceStep);
    const conditions = atlasCloneInverseConditionsForTarget(sourceStep);
    const sourceFile = atlasSourceForInverseStep(sourceStep, conditions);
    const sourceAlias = sourceAliasFor?.(sourceFile) || sourceFile;
    inverseStep = {
      id: uid("step"),
      enabled: true,
      parentId: sourceStep.parentId || null,
      branchType:
        sourceStep.branchType || (sourceStep.parentId ? "then" : "root"),
      sortOrder: atlasInverseElseSortOrder(sourceStep),
      title: "Linked Inverse",
      type: "if",
      step_type: "if_then",
      source: sourceFile,
      field: "",
      action: "",
      notes: "",
      conditions: atlasConditionSummaries(conditions),
      autoGeneratedReference: false,
      inverseOfStepId: sourceStep.id,
      params: {
        inverse_else: "Yes",
        inverse_of_step_id: sourceStep.id,
        source_file: sourceFile,
        source_alias: sourceAlias,
        conditions_json: JSON.stringify(conditions),
        then_action_type: "freeform",
        then_action: "",
      },
    };
    const sourceIndex = state.audit.steps.indexOf(sourceStep);
    state.audit.steps.splice(
      sourceIndex >= 0 ? sourceIndex + 1 : state.audit.steps.length,
      0,
      inverseStep,
    );
  }

  syncInverseElseStepsForSource(stepId);
  atlasNormalizeStepOrderGroups?.();
  state.selectedStepId = inverseStep.id;
  atlasRequestStructuralStepRender?.();
  scheduleAutosave?.();
  status?.("Created or selected the linked inverse step.", "ok");
  return inverseStep;
}

document.addEventListener(
  "click",
  (event) => {
    const control = event.target.closest("[data-create-inverse-else-step]");
    if (!control) return;
    const stepId =
      control.dataset.createInverseElseStep ||
      control.closest(".step-card")?.dataset.id ||
      state.selectedStepId;
    if (!stepId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    createInverseElseStepForIf(stepId);
    document.querySelectorAll("[data-rule-menu-panel]").forEach((panel) => {
      panel.hidden = true;
    });
  },
  true,
);

/* Condition connector persistence and ambiguity guard. */
function atlasConditionConnectorValue(value, fallback = "AND") {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return normalized === "OR" ? "OR" : normalized === "AND" ? "AND" : fallback;
}

function atlasConditionRowsForEditor(
  root = document.querySelector("[data-live-editor-step-id]"),
) {
  return root ? [...root.querySelectorAll(".guided-condition-row")] : [];
}

function atlasConditionConnectorConflict(root, selectedRow, nextConnector) {
  const connectors = atlasConditionRowsForEditor(root)
    .filter((row, index) => index > 0 && row !== selectedRow)
    .map((row) =>
      atlasConditionConnectorValue(
        row.querySelector('[data-condition-field="connector"]')?.value,
      ),
    );
  return connectors.some((connector) => connector !== nextConnector);
}

function atlasStepForConditionEditor(root) {
  const stepId = root?.dataset.liveEditorStepId || state.selectedStepId;
  return (state.audit.steps || []).find((step) => step.id === stepId) || null;
}

function atlasDefaultConditionForConnector(step, connector) {
  const sourceFile = step.source || step.params?.source_file || "";
  const condition = defaultGuidedCondition?.(step) || {
    id: uid("cond"),
    conditionType: "row_compare",
    sourceFile,
    sourceAlias: sourceAliasFor?.(sourceFile) || sourceFile,
    fieldName: "",
    operator: "is equal to",
    valueMode: "values",
    compareValue: "",
  };
  return {
    ...condition,
    id: uid("cond"),
    connector: atlasConditionConnectorValue(connector),
  };
}

function atlasWriteConditionList(step, conditions) {
  const normalized = (conditions || []).map((condition, index) => ({
    ...condition,
    id: condition.id || uid("cond"),
    connector:
      index === 0 ? "IF" : atlasConditionConnectorValue(condition.connector),
  }));
  if (typeof writeLiveConditions === "function") {
    writeLiveConditions(step, normalized);
  } else {
    step.params = step.params || {};
    step.params.conditions_json = JSON.stringify(normalized);
    step.conditions = normalized.map((condition) => ({
      id: condition.id,
      connector: condition.connector,
      field: condition.fieldName || condition.field || "",
      operator: condition.operator || "is equal to",
      value: condition.compareValue || condition.value || "",
    }));
  }
  return normalized;
}

function atlasRefreshConditionSurfaces() {
  if (typeof atlasRequestStructuralStepRender === "function") {
    atlasRequestStructuralStepRender();
    return;
  }
  renderSteps?.();
  renderSelectedStep?.();
  renderLogicTablePreviewRows?.();
  renderPreview?.();
  renderValidationPanel?.();
}

document.addEventListener(
  "change",
  (event) => {
    const connector = event.target.closest?.(
      '.guided-condition-row [data-condition-field="connector"]',
    );
    if (!connector) return;
    const row = connector.closest(".guided-condition-row");
    const root = connector.closest("[data-live-editor-step-id]");
    const rows = atlasConditionRowsForEditor(root);
    const index = rows.indexOf(row);
    if (index <= 0) {
      connector.value = "IF";
      atlasSyncChoiceSelection?.(connector);
      return;
    }
    const nextConnector = atlasConditionConnectorValue(connector.value);
    if (atlasConditionConnectorConflict(root, row, nextConnector)) {
      const step = atlasStepForConditionEditor(root);
      const stored = (parseStepConditions?.(step) || []).find(
        (condition) => condition.id === row.dataset.conditionId,
      );
      connector.value = atlasConditionConnectorValue(stored?.connector);
      atlasSyncChoiceSelection?.(connector);
      status?.(
        "Mixed AND/OR connectors are not supported in one condition group yet. Use one connector type or create a nested rule.",
        "warn",
      );
      return;
    }
    connector.value = nextConnector;
    atlasSyncChoiceSelection?.(connector);
    atlasCommitLiveEditor?.({ rerender: true });
  },
  true,
);

document.addEventListener(
  "click",
  (event) => {
    const add = event.target.closest?.("[data-guided-add-condition]");
    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const root = add.closest("[data-live-editor-step-id]");
      const step = atlasStepForConditionEditor(root);
      if (!step || step.autoGeneratedReference) return;
      atlasCommitLiveEditor?.({ rerender: false });
      const connector = atlasConditionConnectorValue(
        add.dataset.guidedAddCondition,
      );
      const conditions = parseStepConditions?.(step) || [];
      const existingConnectors = conditions
        .slice(1)
        .map((condition) => atlasConditionConnectorValue(condition.connector));
      if (
        existingConnectors.length &&
        existingConnectors.some((value) => value !== connector)
      ) {
        status?.(
          "Mixed AND/OR connectors are not supported in one condition group yet. Add the condition with the existing connector or create a nested rule.",
          "warn",
        );
        return;
      }
      conditions.push(atlasDefaultConditionForConnector(step, connector));
      atlasWriteConditionList(step, conditions);
      atlasRefreshConditionSurfaces();
      scheduleAutosave?.();
      status?.(`Added ${connector} condition.`, "ok");
      return;
    }

    const remove = event.target.closest?.("[data-guided-delete-condition]");
    if (!remove) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const row = remove.closest(".guided-condition-row");
    const root = remove.closest("[data-live-editor-step-id]");
    const step = atlasStepForConditionEditor(root);
    if (!step || step.autoGeneratedReference || !row) return;
    atlasCommitLiveEditor?.({ rerender: false });
    const conditions = parseStepConditions?.(step) || [];
    if (conditions.length <= 1) {
      status?.("An IF / THEN rule must keep at least one condition.", "warn");
      return;
    }
    const remaining = conditions.filter(
      (condition) => condition.id !== row.dataset.conditionId,
    );
    if (remaining.length === conditions.length) return;
    atlasWriteConditionList(step, remaining);
    atlasRefreshConditionSurfaces();
    scheduleAutosave?.();
    status?.("Deleted condition.", "ok");
  },
  true,
);

const atlasInverseCommitBase = atlasCommitLiveEditor;
atlasCommitLiveEditor = function atlasCommitLiveEditorWithLinkedInverse(
  options = {},
) {
  const stepId =
    document.querySelector("[data-live-editor-step-id]")?.dataset
      .liveEditorStepId || state.selectedStepId;
  const result = atlasInverseCommitBase(options);
  const step = stepById?.(stepId);
  if (step?.step_type === "if_then" && step.params?.inverse_else !== "Yes")
    syncInverseElseStepsForSource(step.id);
  return result;
};

// Final authoring boundary: invalid character counts never replace stored state.
const atlasStringCharacterCountCommitBase = atlasCommitLiveEditor;
atlasCommitLiveEditor =
  function atlasCommitLiveEditorWithStringCharacterCountGuard(options = {}) {
    const editor = document.querySelector("[data-live-editor-step-id]");
    const countInput = editor?.querySelector(
      ATLAS_STRING_CHARACTER_COUNT_SELECTOR,
    );
    if (
      countInput &&
      !atlasValidateStringCharacterCountInput(countInput, { report: true })
    )
      return false;
    if (countInput)
      countInput.value = atlasPositiveWholeNumber(countInput.value);
    return atlasStringCharacterCountCommitBase(options);
  };

// ATLAS-MATH-OPERATIONS-UPDATE:BEGIN
const atlasRenderConditionRowBeforeMathUpdate = renderConditionRow;
renderConditionRow = function renderConditionRowWithMath(condition, index) {
  const html = atlasRenderConditionRowBeforeMathUpdate(condition, index);
  if ((condition.valueMode || "values") !== "field") return html;
  const insertion = atlasMathEditorHtml(
    "compareMathJson",
    condition.compareMathJson || "[]",
    condition.compareFieldName
      ? condition.compareSourceFile || condition.sourceFile || ""
      : "",
  );
  return html.replace(
    /(<button[^>]+data-guided-delete-condition)/,
    `${insertion}$1`,
  );
};

const atlasRenderThenActionBuilderBeforeMathUpdate =
  atlasRenderThenActionBuilder;
atlasRenderThenActionBuilder = function atlasRenderThenActionBuilderWithMath(
  p,
  prefix = "THEN",
) {
  const actionType = p.then_action_type || "freeform";
  if (actionType !== "set_column_calculation") {
    let html = atlasRenderThenActionBuilderBeforeMathUpdate(p, prefix);
    return html.replace(
      /(<option value="set_column_value"[^>]*>[^<]*<\/option>)/,
      `$1<option value="set_column_calculation">Set Column to Calculated Value</option>`,
    );
  }
  return `<div class="then-action-builder refined-action-builder dynamic-action-builder">
    ${atlasThenActionTypeControl(prefix, "set_column_calculation")}
    <label>Target Column${fieldInputFromOptions({
      name: "then_target_column",
      value: p.then_target_column,
      placeholder: "Select target field",
      sourceFile: "",
    })}</label>
    <input type="hidden" data-param="then_value_source_file" value="${esc(p.then_value_field ? p.then_value_source_file || p.source_file || "" : "")}">
    <label>Numeric Value Field${fieldInputFromOptions({
      name: "then_value_field",
      value: p.then_value_field,
      placeholder: "Select numeric value field",
      sourceFile: p.then_value_field
        ? p.then_value_source_file || p.source_file
        : "",
    })}</label>
    ${atlasMathEditorHtml("then_math_json", p.then_math_json || "[]", p.then_value_field ? p.then_value_source_file || p.source_file : "")}
    <div class="math-rounding-grid"><div class="atlas-choice-field"><span class="atlas-choice-heading">Rounding</span>${atlasRoundingChoice("then_rounding_mode", p.then_rounding_mode)}</div><label>Decimal places<input data-param="then_rounding_decimal_places" inputmode="numeric" value="${esc(p.then_rounding_decimal_places || "0")}"></label></div>
  </div>`;
};

function atlasSyncMathEditor(editor, { commit = true } = {}) {
  if (!editor) return;
  const hidden = editor.querySelector("[data-math-json]");
  if (hidden)
    hidden.value = atlasSerializeMathOperations(
      atlasMathOperationsFromContainer(editor),
    );
  if (commit) {
    atlasCommitLiveEditor?.({ rerender: false });
    atlasRequestRender?.({ preview: true, logicTable: true, validation: true });
    scheduleAutosave?.();
  }
}

document.addEventListener(
  "click",
  (event) => {
    const add = event.target.closest("[data-add-math-operation]");
    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const editor = add.closest("[data-math-editor]");
      editor?.querySelector(".math-operation-list")?.insertAdjacentHTML(
        "beforeend",
        atlasMathOperationRowHtml(
          {
            id: uid("math"),
            operator: "*",
            operandType: "number",
            operand: "",
          },
          editor?.dataset.baseSource || "",
        ),
      );
      atlasSyncMathEditor(editor, { commit: false });
      return;
    }
    const remove = event.target.closest("[data-remove-math-operation]");
    if (remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const editor = remove.closest("[data-math-editor]");
      remove.closest("[data-math-row]")?.remove();
      atlasSyncMathEditor(editor);
    }
  },
  true,
);

document.addEventListener(
  "change",
  (event) => {
    const row = event.target.closest("[data-math-row]");
    if (!row) return;
    if (event.target.matches("[data-math-operand-mode]")) {
      const fieldMode = event.target.checked;
      const type = row.querySelector("[data-math-operand-type]");
      if (type) type.value = fieldMode ? "field" : "number";
      const modeLabel = row.querySelector("[data-math-mode-label]");
      if (modeLabel)
        modeLabel.textContent = fieldMode ? "Source Field" : "Static Value";
      row
        .querySelector(".math-number-operand")
        ?.toggleAttribute("hidden", fieldMode);
      row
        .querySelector(".math-field-operand")
        ?.toggleAttribute("hidden", !fieldMode);
    }
    atlasSyncMathEditor(row.closest("[data-math-editor]"));
  },
  true,
);

document.addEventListener(
  "input",
  (event) => {
    if (!event.target.matches("[data-math-operand]")) return;
    atlasSyncMathEditor(event.target.closest("[data-math-editor]"), {
      commit: false,
    });
  },
  true,
);

document.addEventListener(
  "focusout",
  (event) => {
    if (!event.target.matches("[data-math-operand]")) return;
    atlasSyncMathEditor(event.target.closest("[data-math-editor]"));
  },
  true,
);
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
const atlasRenderThenActionBuilderBeforeStringTransform =
  atlasRenderThenActionBuilder;
atlasRenderThenActionBuilder =
  function atlasRenderThenActionBuilderWithStringTransform(p, prefix = "THEN") {
    const actionType = p.then_action_type || "freeform";
    if (actionType !== "set_column_string_transform") {
      const html = atlasRenderThenActionBuilderBeforeStringTransform(p, prefix);
      return html.replace(
        /(<option[^>]+value="set_column_value"[^>]*>[^<]*<\/option>)/,
        `$1<option value="set_column_string_transform">Set Column to String Transformation</option>`,
      );
    }
    const c = atlasStringTransformConfig(p, "then_");
    return `
      <div 
        class="then-action-builder string-transform-builder">
          <h4>
            ${prefix} Action
          </h4>
      
          ${atlasThenActionTypeControl(prefix, "set_column_string_transform")}

          <label>
            Target Column
            ${fieldInputFromOptions({
              name: "then_target_column",
              value: c.destinationColumn,
              placeholder: "Select or create target column",
              sourceFile: "",
            })}
          </label>

          <div class="atlas-choice-field">
            <span class="atlas-choice-heading">Operation</span>
            ${atlasStringOperationChoice("then_string_operation", c.operation)}
          </div>

          <input 
            type="hidden" 
            data-param="then_string_position" 
            value="${esc(c.position)}">
              <input 
                type="hidden" 
                data-param="then_string_source_file" 
                value="${esc(c.sourceFile)}">
                  <label>
                    Value Field
                    ${fieldInputFromOptions({
                      name: "then_string_source_field",
                      value: c.sourceField,
                      placeholder: "Select source field",
                      sourceFile: c.sourceFile,
                    })}
                  </label>

                  ${atlasStringCharacterCountControl({
                    operation: c.operation,
                    paramName: "then_string_character_count",
                    count: c.count,
                    characterCountHint:
                      "Returns a numeric whole-number result. Blank text returns 0; null remains blank/NULL.",
                  })}
  </div>`;
  };

document.addEventListener(
  "change",
  (event) => {
    if (
      event.target.matches(
        '[data-param="value_mode"], [data-param="string_operation"], [data-param="then_string_operation"]',
      )
    )
      atlasCommitLiveEditor?.({ rerender: true });
  },
  true,
);

const ATLAS_STRING_CHARACTER_COUNT_SELECTOR =
  '[data-param="string_character_count"], ' +
  '[data-param="then_string_character_count"]';

function atlasIsStringCharacterCountInput(input) {
  return !!input?.matches?.(ATLAS_STRING_CHARACTER_COUNT_SELECTOR);
}

function atlasValidateStringCharacterCountInput(
  input,
  { report = false } = {},
) {
  if (!atlasIsStringCharacterCountInput(input)) return true;
  const valid = atlasIsPositiveWholeNumber(input.value);
  input.setAttribute("aria-invalid", valid ? "false" : "true");
  input.setCustomValidity?.(
    valid ? "" : "Enter a positive whole number greater than zero.",
  );
  if (!valid && report) input.reportValidity?.();
  return valid;
}

document.addEventListener(
  "input",
  (event) => {
    if (!atlasIsStringCharacterCountInput(event.target)) return;
    atlasValidateStringCharacterCountInput(event.target);
  },
  true,
);

document.addEventListener(
  "change",
  (event) => {
    const input = event.target;
    if (!atlasIsStringCharacterCountInput(input)) return;
    if (!atlasValidateStringCharacterCountInput(input, { report: true }))
      return;
    input.value = atlasPositiveWholeNumber(input.value);
    const committed = atlasCommitLiveEditor?.({ rerender: false });
    if (committed === false) return;
    atlasRequestRender?.({ preview: true, logicTable: true, validation: true });
    scheduleAutosave?.();
  },
  true,
);

function atlasStringTransformIssuesForAudit() {
  return (state.audit.steps || []).flatMap((step) => {
    const p = step.params || {};
    if (
      step.step_type === "create_column" &&
      p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE
    )
      return atlasValidateStringTransform(p).map((issue) => ({
        ...issue,
        stepId: step.id,
      }));
    if (
      step.step_type === "if_then" &&
      p.then_action_type === "set_column_string_transform"
    )
      return atlasValidateStringTransform(p, "then_").map((issue) => ({
        ...issue,
        stepId: step.id,
      }));
    return [];
  });
}
// ATLAS-STRING-TRANSFORM-UPDATE:END

/* ATLAS-CREATED-FIELD-PICKER:BEGIN */
/* ATLAS Visual Field Picker created-column update. Loaded at end of 15g. */
const ATLAS_CREATED_SOURCE = "__created_columns__",
  ATLAS_CREATED_LABEL = "Calculated Fields",
  ATLAS_CALCULATED_COLOR = "#7da2d8";
function atlasPickerEntries() {
  return typeof hierarchicalStepEntries === "function"
    ? hierarchicalStepEntries({ includeDisabled: true })
    : (state.audit.steps || []).map((step, i) => ({
        step,
        number: String(i + 1),
      }));
}
function atlasPickerReferenceSource(value) {
  let step = typeof value === "string" ? stepById?.(value) : value,
    seen = new Set();
  while (step && !seen.has(step.id)) {
    seen.add(step.id);
    if (step.step_type === "reference_source" || step.autoGeneratedReference)
      return step.params?.source_file || step.source || "";
    step = step.parentId ? stepById?.(step.parentId) : null;
  }
  return "";
}
function atlasReferenceChildSource(step) {
  if (!step?.parentId) return "";
  return atlasPickerReferenceSource(stepById?.(step.parentId)) || "";
}
function atlasPickerSourceMatches(option, referenceSource) {
  if (!referenceSource) return true;
  const resolved =
    typeof atlasResolveSelectedSource === "function"
      ? atlasResolveSelectedSource(referenceSource)
      : null;
  const identityCandidates =
    typeof atlasSourceIdentityCandidates === "function"
      ? atlasSourceIdentityCandidates
      : () => [];
  const wanted = new Set(identityCandidates(resolved || referenceSource));
  wanted.add(
    String(referenceSource || "")
      .trim()
      .toLowerCase(),
  );
  const candidates = [
    ...identityCandidates(option),
    String(option?.sourceAlias || "")
      .trim()
      .toLowerCase(),
    String(option?.sourceFile || option || "")
      .trim()
      .toLowerCase(),
  ];
  return candidates.some((value) => value && wanted.has(value));
}
const atlasPickerSourceOptionsBeforeReferenceScope = pickerSourceOptions;
pickerSourceOptions = function pickerSourceOptionsForReferenceChildren() {
  const options = atlasPickerSourceOptionsBeforeReferenceScope();
  if (!visualPickerState) return options;
  const referenceSource = atlasReferenceChildSource(
    stepById?.(visualPickerState.targetStepId || state.selectedStepId),
  );
  if (!referenceSource) return options;
  return options.filter((option) =>
    atlasPickerSourceMatches(option, referenceSource),
  );
};
function atlasCreatedFieldPlacement(step) {
  const referenceSource = atlasReferenceChildSource(step);
  if (!referenceSource) {
    return {
      attached: false,
      sourceKey: ATLAS_CREATED_SOURCE,
      sourceFile: ATLAS_CREATED_SOURCE,
      sourceAlias: ATLAS_CREATED_LABEL,
      sourceColor: ATLAS_CALCULATED_COLOR,
    };
  }
  const resolved =
    typeof atlasResolveSelectedSource === "function"
      ? atlasResolveSelectedSource(referenceSource)
      : null;
  const catalog =
    (typeof atlasCatalogSourcesForSelection === "function"
      ? atlasCatalogSourcesForSelection(
          sourceCatalogEntries(),
          state.audit?.sources || [],
          referenceSource,
        )
      : [])[0] || null;
  const source = catalog || resolved || { sourceFile: referenceSource };
  const sourceKey =
    (typeof atlasStableSourceKey === "function" &&
      atlasStableSourceKey(source)) ||
    source.sourceKey ||
    referenceSource;
  const sourceFile =
    source.sourceFile || resolved?.sourceFile || referenceSource;
  const sourceAlias =
    source.alias ||
    resolved?.alias ||
    (typeof sourceAliasFor === "function" ? sourceAliasFor(sourceFile) : "") ||
    sourceFile;
  const sourceColor =
    (typeof atlasSelectedSourceColor === "function" &&
      atlasSelectedSourceColor(resolved || source || referenceSource)) ||
    resolved?.color ||
    source.color ||
    ATLAS_CALCULATED_COLOR;
  return {
    attached: true,
    sourceKey,
    sourceFile,
    sourceAlias,
    sourceColor,
  };
}
function atlasCreatedFieldMatchesRequest(placement, requested) {
  const wanted = String(requested || "").trim();
  if (!wanted) return true;
  if (!placement?.attached) {
    return [
      ATLAS_CREATED_SOURCE,
      ATLAS_CREATED_LABEL,
      "Calculated Field",
      "calculated-field",
      "calculated-fields",
    ].some((value) => value.toLowerCase() === wanted.toLowerCase());
  }
  if (
    [placement.sourceKey, placement.sourceFile, placement.sourceAlias].some(
      (value) =>
        String(value || "")
          .trim()
          .toLowerCase() === wanted.toLowerCase(),
    )
  )
    return true;
  return atlasPickerSourceMatches(
    {
      sourceKey: placement.sourceKey,
      sourceFile: placement.sourceFile,
      sourceAlias: placement.sourceAlias,
    },
    wanted,
  );
}
function atlasPickerCreatedSource(step) {
  return atlasCreatedFieldPlacement(step).sourceFile;
}

function commitPickerSelection(value, sourceFile = "") {
  if (!visualPickerState?.targetStepId) return false;

  setPickerTargetValue(value, sourceFile);
  return true;
}

function atlasCreatedFieldEntries({
  targetStepId = "",
  sourceFile = "",
  includeUnavailable = false,
} = {}) {
  const entries = atlasPickerEntries(),
    found = targetStepId
      ? entries.findIndex((e) => e.step.id === targetStepId)
      : entries.length,
    target = found < 0 ? entries.length : found;
  return entries.flatMap((entry, index) => {
    const step = entry.step,
      name = String(step.params?.column_name || step.field || "").trim(),
      placement = atlasCreatedFieldPlacement(step),
      available = index < target;
    if (
      step.step_type !== "create_column" ||
      !name ||
      (!includeUnavailable && !available) ||
      (sourceFile && !atlasCreatedFieldMatchesRequest(placement, sourceFile))
    )
      return [];
    return [
      {
        fieldName: name,
        rawFieldName: name,
        vanityLabel: name,
        label: name,
        detail: `Created by Step ${entry.number || index + 1}`,
        sourceKey: placement.sourceKey,
        sourceFile: placement.sourceFile,
        sourceAlias: placement.sourceAlias,
        sourceColor: placement.sourceColor || ATLAS_CALCULATED_COLOR,
        attached: placement.attached,
        origin: "created",
        isCreatedField: true,
        creatorStepId: step.id,
        available,
      },
    ];
  });
}
function atlasUnifiedFieldEntries({ sourceFile = "", targetStepId = "" } = {}) {
  const sources = atlasCatalogSourcesForSelection(
    sourceCatalogEntries(),
    (atlasDisplayDocument?.() || state.audit)?.sources || [],
    sourceFile,
  );
  const base = sources.flatMap((source) =>
    (source.fields || []).map((field) => {
      const parts = fieldDisplayParts(field, source.sourceFile);
      const sourceKey = atlasStableSourceKey(source) || source.sourceKey;
      const picked = (state.audit.sources || []).find((item) =>
        atlasSourceMatchesLookup(item, sourceKey),
      );
      return {
        ...field,
        sourceKey,
        sourceFile: source.sourceFile,
        sourceAlias: source.alias || source.sourceFile,
        fieldName: parts.raw,
        rawFieldName: parts.raw,
        vanityLabel: parts.vanity,
        label: parts.display,
        detail: parts.alternate,
        sourceColor: picked?.color || "",
        origin: "source",
        isCreatedField: false,
      };
    }),
  );
  const seen = new Set();
  return [
    ...base,
    ...atlasCreatedFieldEntries({ targetStepId, sourceFile }),
  ].filter((f) => {
    const key = `${f.origin}:${f.sourceKey || f.sourceFile}:${f.fieldName}:${f.creatorStepId || ""}`;
    if (!f.fieldName || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const atlasFieldsForSourceOriginal = fieldsForSource;
fieldsForSource = function (sourceFile = "") {
  const rows = atlasUnifiedFieldEntries({
    sourceFile,
    targetStepId: state.selectedStepId || "",
  });
  return rows.length ? rows : atlasFieldsForSourceOriginal(sourceFile);
};
pickerFieldOptions = function (sourceFile = "") {
  return atlasUnifiedFieldEntries({
    sourceFile,
    targetStepId: visualPickerState?.targetStepId || state.selectedStepId || "",
  });
};
function atlasFieldPickerEligibilityPolicy(picker, step) {
  const referenceSource = atlasReferenceChildSource(step);
  if (referenceSource)
    return { mode: "reference-source", sourceFile: referenceSource };
  const name =
    picker?.dataset?.paramName || picker?.dataset?.conditionName || "";
  if (picker?.closest?.("[data-math-row]"))
    return { mode: "all-selected", sourceFile: "" };
  const multiSourceNames = new Set([
    "fieldName",
    "compareFieldName",
    "then_target_column",
    "then_value_field",
  ]);
  const concatenateNames = new Set(["concat_field_1", "concat_field_2"]);
  if (
    picker?.dataset?.openMiniPicker === "field" &&
    ((step?.step_type === "if_then" && multiSourceNames.has(name)) ||
      (step?.step_type === "create_column" &&
        step?.params?.value_mode === "Concatenate fields" &&
        concatenateNames.has(name)))
  )
    return { mode: "all-selected", sourceFile: "" };
  return {
    mode: "single-source",
    sourceFile:
      picker?.dataset?.pickerSource || atlasPickerReferenceSource(step) || "",
  };
}
function atlasPickerScope(picker, step) {
  return atlasFieldPickerEligibilityPolicy(picker, step).sourceFile;
}
const atlasSetPickerTargetValueOriginal = setPickerTargetValue;
setPickerTargetValue = function atlasSetPickerTargetValueCommitBeforeRender(
  value,
  sourceFile = "",
) {
  const context = visualPickerState;
  if (!context) return;
  const step = stepById?.(context.targetStepId || state.selectedStepId);
  const target = context.target;
  const editor = target?.closest("[data-live-editor-step-id]");
  const conditionRow = target?.closest(".guided-condition-row");
  const mathRow = target?.closest("[data-math-row]");
  if (mathRow && context.kind === "field") {
    const fieldControl = mathRow.querySelector("[data-math-field]");
    const sourceControl = mathRow.querySelector("[data-math-source]");
    if (fieldControl) fieldControl.value = value;
    if (sourceControl) sourceControl.value = sourceFile;
    atlasSyncMathEditor(mathRow.closest("[data-math-editor]"));
    visualPickerState = null;
    window.ATLASVisualPicker?.close?.("select");
    return;
  }
  const option =
    context.kind === "field"
      ? pickerFieldOptions(context.sourceFile).find(
          (x) =>
            x.fieldName === value &&
            (x.sourceKey === sourceFile ||
              x.sourceAlias === sourceFile ||
              (x.sourceFile === sourceFile &&
                !atlasDisplayNameCollision(sourceFile))),
        )
      : null;
  const ref = option?.isCreatedField
    ? { kind: "created", creatorStepId: option.creatorStepId, sourceFile }
    : null;

  const parameterSourcePairs = {
    field_name: "source_file",
    left_field: "left_source",
    right_field: "right_source",
    then_value_field: "then_value_source_file",
    concat_field_1: "concat_source_1",
    concat_field_2: "concat_source_2",
    string_source_field: "string_source_file",
    then_string_source_field: "then_string_source_file",
  };
  const parameterFieldPairs = {
    source_file: "field_name",
    left_source: "left_field",
    right_source: "right_field",
    then_value_source_file: "then_value_field",
    concat_source_1: "concat_field_1",
    concat_source_2: "concat_field_2",
    string_source_file: "string_source_field",
    then_string_source_file: "then_string_source_field",
  };

  if (context.targetType === "condition") {
    const control = conditionRow?.querySelector(
      `[data-condition-field="${CSS.escape(context.name)}"]`,
    );
    if (control) control.value = value;
    if (context.kind === "field") {
      const sourceName =
        context.name === "compareFieldName"
          ? "compareSourceFile"
          : "sourceFile";
      const sourceControl = conditionRow?.querySelector(
        `[data-condition-field="${sourceName}"]`,
      );
      if (sourceControl && sourceFile) sourceControl.value = sourceFile;
    }
  } else {
    const control = editor?.querySelector(
      `[data-param="${CSS.escape(context.name)}"]`,
    );
    if (control) control.value = value;
    if (context.kind === "field") {
      const sourceName = parameterSourcePairs[context.name];
      const sourceControl = sourceName
        ? editor?.querySelector(`[data-param="${sourceName}"]`)
        : null;
      if (sourceControl && sourceFile) sourceControl.value = sourceFile;
    } else if (context.kind === "source") {
      const fieldName = parameterFieldPairs[context.name];
      const fieldControl = fieldName
        ? editor?.querySelector(`[data-param="${fieldName}"]`)
        : null;
      if (fieldControl?.value) {
        const valid = fieldsForSource(value).some((field) => {
          const parts = fieldDisplayParts(field, value);
          return (
            fieldControl.value === parts.raw ||
            fieldControl.value === parts.vanity
          );
        });
        if (!valid) fieldControl.value = "";
      }
    }
  }

  // Capture the updated hidden controls before any picker state or editor DOM is removed.
  atlasCommitLiveEditor?.({ rerender: false });

  // Preserve created-field reference metadata after the standard editor capture.
  if (step && (context.kind === "field" || context.kind === "source")) {
    step.params = step.params || {};
    if (context.kind === "source" && context.targetType !== "condition") {
      step.params[context.name] = value;
    } else if (context.targetType === "condition") {
      const conditions = parseStepConditions?.(step) || [];
      const condition = conditions.find((c) => c.id === context.conditionId);
      if (condition) {
        const compare = context.name === "compareFieldName";
        const refKey = compare ? "compareFieldRef" : "fieldRef";
        condition[context.name] = value;
        condition[compare ? "compareSourceFile" : "sourceFile"] = sourceFile;
        if (ref) condition[refKey] = ref;
        else delete condition[refKey];
        atlasWriteLiveEditorConditions?.(step, conditions);
      }
    } else {
      step.params[context.name] = value;
      const key = `${context.name}_field_ref`;
      if (ref) step.params[key] = ref;
      else delete step.params[key];
      const sourceName = parameterSourcePairs[context.name];
      if (sourceName && sourceFile) step.params[sourceName] = sourceFile;
    }
  }

  visualPickerState = null;
  document
    .querySelector(".visual-picker-modal-backdrop.dynamic-mini-picker")
    ?.remove();
  atlasMarkLogicIssuesDirty?.();
  renderAll?.();
  scheduleAutosave?.();
};
function atlasCreatedPickerHtml() {
  if (!visualPickerState) return "";
  const values =
      visualPickerState.kind === "source"
        ? pickerSourceOptions()
        : pickerFieldOptions(visualPickerState.sourceFile),
    query = String(visualPickerState.query || "").toLowerCase(),
    groups = new Map();
  values
    .filter((x) =>
      `${x.sourceFile} ${x.sourceAlias} ${x.fieldName} ${x.label}`
        .toLowerCase()
        .includes(query),
    )
    .forEach((x) => {
      const group =
        visualPickerState.kind === "source"
          ? "Selected Sources"
          : x.sourceFile === ATLAS_CREATED_SOURCE
            ? ATLAS_CREATED_LABEL
            : x.sourceFile;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(x);
    });
  return (
    [...groups]
      .map(
        ([group, items]) =>
          `<section class="visual-picker-group"><div class="visual-picker-group-title"><strong>${esc(group)}</strong><span>${items.length}</span></div><div class="visual-picker-option-list">${items.map((item) => `<button type="button" class="visual-picker-option ${item.isCreatedField ? "custom-field-pill" : ""}" data-mini-picker-value="${esc(visualPickerState.kind === "source" ? item.sourceFile : item.fieldName)}" data-mini-picker-source="${esc(item.sourceFile)}" style="--source-color:${esc(item.sourceColor || "#7da2d8")}"><span class="source-color-dot"></span><span class="visual-picker-option-copy"><strong>${esc(visualPickerState.kind === "source" ? item.sourceFile : item.label)}</strong><small>${esc(visualPickerState.kind === "source" ? item.sourceAlias : `${item.sourceAlias}.${item.fieldName}`)}</small></span>${item.isCreatedField ? '<span class="created-column-badge">fx Created</span>' : ""}</button>`).join("")}</div></section>`,
      )
      .join("") ||
    '<p class="hint">No selected source fields match the current search.</p>'
  );
}
renderMiniPicker = function renderMiniPickerSharedAdapter() {
  document
    .querySelector(".visual-picker-modal-backdrop.dynamic-mini-picker")
    ?.remove();
  if (!visualPickerState) return;
  if (!window.ATLASVisualPicker?.open) {
    console.error("ATLAS Visual Picker: shared component is unavailable.");
    visualPickerState = null;
    return;
  }

  const pickerKind = visualPickerState.kind;
  const referenceSource = atlasReferenceChildSource(
    stepById?.(visualPickerState.targetStepId || state.selectedStepId),
  );
  let values =
    pickerKind === "source"
      ? pickerSourceOptions()
      : pickerFieldOptions(referenceSource || visualPickerState.sourceFile);
  const entries = values.map((item) => {
    const sourceFile = item.sourceFile || "";
    const sourceAlias = item.sourceAlias || sourceFile || "Other";
    const fieldName = item.fieldName || "";
    const sourceKey =
      item.sourceKey ||
      atlasStableSourceKey({
        sourceKey: item.sourceKey,
        alias: item.sourceAlias,
        sourceFile,
      }) ||
      sourceFile;
    const sourceLabelText = atlasSourceDisambiguatedLabel({
      sourceFile,
      alias: sourceAlias,
      sourceKey,
      sourceMetadata: { sourceTitle: sourceFile },
    });
    return {
      key: pickerKind === "source" ? sourceKey : `${sourceKey}::${fieldName}`,
      label:
        pickerKind === "source"
          ? sourceLabelText
          : item.vanityLabel || item.label || fieldName,
      rawName: pickerKind === "source" ? sourceLabelText : fieldName,
      detail:
        pickerKind === "source" && sourceAlias && sourceAlias !== sourceFile
          ? sourceAlias
          : "",
      sourceKey,
      sourceLabel:
        pickerKind === "source"
          ? "Selected Sources"
          : sourceFile === ATLAS_CREATED_SOURCE
            ? ATLAS_CREATED_LABEL
            : sourceLabelText,
      sourceColor:
        item.sourceColor || atlasSelectedSourceColor(sourceKey) || "#7da2d8",
      custom: Boolean(item.isCreatedField),
      badge: item.isCreatedField ? "Custom" : "",
      pickerValue: pickerKind === "source" ? sourceKey : fieldName,
      pickerSource: sourceKey,
    };
  });
  const selectedValue = String(
    visualPickerState.target
      ?.closest(".guided-condition-row")
      ?.querySelector(
        `[data-condition-field="${CSS.escape(visualPickerState.name || "")}"]`,
      )?.value ||
      visualPickerState.target?.value ||
      "",
  );
  const selectedSource =
    visualPickerState.selectedSourceFile || visualPickerState.sourceFile || "";
  const selectedEntry = entries.find(
    (entry) =>
      entry.pickerValue === selectedValue &&
      (pickerKind === "source" ||
        !selectedSource ||
        entry.pickerSource === selectedSource),
  );

  window.ATLASVisualPicker.open({
    mode: pickerKind,
    title:
      pickerKind === "source" ? "Choose Selected Source File" : "Choose Field",
    guidance: referenceSource
      ? "Only the reference source for this step is available here."
      : pickerKind === "source"
        ? "Only sources selected for this audit are available here."
        : "Fields are grouped by source. Attached calculated fields appear under that source. Standalone calculated fields appear under Calculated Fields, and only after their creation step.",
    searchPlaceholder: "Search selected sources and fields...",
    hideLabelMode: pickerKind !== "field",
    entries,
    query: visualPickerState.query || "",
    sort:
      typeof atlasFieldPickerSortMode === "string"
        ? atlasFieldPickerSortMode
        : "source",
    selectedKey: selectedEntry?.key || null,
    onSelect(entry) {
      if (!visualPickerState || !entry) return;
      commitPickerSelection(entry.pickerValue, entry.pickerSource);
    },
    onClose(reason) {
      if (reason !== "select") visualPickerState = null;
    },
  });
};
function atlasRemoveSourceControl(html, label, field, value = "") {
  const template = document.createElement("template");
  template.innerHTML = html;
  const sourceTrigger = [
    ...template.content.querySelectorAll(
      'button[data-open-mini-picker="source"][data-condition-name]',
    ),
  ].find((button) => button.dataset.conditionName === field);
  const sourceLabel = sourceTrigger?.closest("label");
  if (!sourceLabel) return html;
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.dataset.conditionField = field;
  hidden.value = value || "";
  sourceLabel.replaceWith(hidden);
  return template.innerHTML;
}
const atlasRenderConditionRowOriginal = renderConditionRow;
renderConditionRow = function (condition, index) {
  let html = atlasRenderConditionRowOriginal(condition, index);
  html = atlasRemoveSourceControl(
    html,
    "Source File",
    "sourceFile",
    condition.fieldName ? condition.sourceFile || "" : "",
  );
  return atlasRemoveSourceControl(
    html,
    "Compare Source",
    "compareSourceFile",
    condition.compareSourceFile || condition.sourceFile || "",
  );
};
function atlasCreatedRefs(step) {
  const refs = [],
    p = step.params || {};
  Object.entries(p).forEach(([key, value]) => {
    if (key.endsWith("_field_ref") && value?.kind === "created")
      refs.push({ ...value, location: key });
  });
  try {
    (JSON.parse(p.conditions_json || "[]") || []).forEach((c) => {
      if (c.fieldRef?.kind === "created")
        refs.push({ ...c.fieldRef, location: "condition" });
      if (c.compareFieldRef?.kind === "created")
        refs.push({ ...c.compareFieldRef, location: "compare condition" });
    });
  } catch (_e) {}
  return refs;
}
function atlasCreatedFieldIssuesForAudit() {
  const entries = atlasPickerEntries(),
    positions = new Map(entries.map((e, i) => [e.step.id, i])),
    creators = new Map(
      entries
        .filter((e) => e.step.step_type === "create_column")
        .map((e) => [e.step.id, e.step]),
    );
  return entries.flatMap((entry) =>
    atlasCreatedRefs(entry.step).flatMap((ref) => {
      const creator = creators.get(ref.creatorStepId);
      if (!creator)
        return [
          {
            level: "error",
            code: "created_field_removed",
            stepId: entry.step.id,
            message: `Created-column reference in ${ref.location} is invalid because its Create Column rule was removed.`,
          },
        ];
      if (
        (positions.get(ref.creatorStepId) ?? Infinity) >=
        (positions.get(entry.step.id) ?? -1)
      )
        return [
          {
            level: "error",
            code: "created_field_forward_reference",
            stepId: entry.step.id,
            message: `Created column "${creator.params?.column_name || creator.field || ""}" is referenced before its Create Column rule.`,
          },
        ];
      return [];
    }),
  );
}
const atlasColumnNameFocus = new WeakMap();
document.addEventListener(
  "focusin",
  (event) => {
    const input = event.target.closest?.('[data-param="column_name"]');
    if (input) atlasColumnNameFocus.set(input, input.value || "");
  },
  true,
);
document.addEventListener(
  "focusout",
  (event) => {
    const input = event.target.closest?.('[data-param="column_name"]');
    if (!input) return;
    const oldName = atlasColumnNameFocus.get(input) || "",
      newName = String(input.value || "").trim(),
      creator = stepById?.(
        input.closest("[data-live-editor-step-id]")?.dataset.liveEditorStepId ||
          state.selectedStepId,
      );
    if (!creator || !oldName || !newName || oldName === newName) return;
    (state.audit.steps || []).forEach((step) => {
      const p = step.params || {};
      Object.entries(p).forEach(([key, ref]) => {
        if (key.endsWith("_field_ref") && ref?.creatorStepId === creator.id) {
          const valueKey = key.slice(0, -10);
          if (p[valueKey] === oldName) p[valueKey] = newName;
        }
      });
      try {
        const conditions = JSON.parse(p.conditions_json || "[]");
        let changed = false;
        conditions.forEach((c) => {
          if (
            c.fieldRef?.creatorStepId === creator.id &&
            c.fieldName === oldName
          ) {
            c.fieldName = newName;
            changed = true;
          }
          if (
            c.compareFieldRef?.creatorStepId === creator.id &&
            c.compareFieldName === oldName
          ) {
            c.compareFieldName = newName;
            changed = true;
          }
        });
        if (changed) atlasWriteLiveEditorConditions?.(step, conditions);
      } catch (_e) {}
    });
    atlasMarkLogicIssuesDirty?.();
    renderAll?.();
    scheduleAutosave?.();
  },
  true,
);
document.addEventListener(
  "click",
  (event) => {
    const picker = event.target.closest?.('[data-open-mini-picker="field"]');
    if (!picker) return;
    queueMicrotask(() => {
      if (!visualPickerState) return;
      const step = stepById?.(
        picker.closest("[data-live-editor-step-id]")?.dataset
          .liveEditorStepId || state.selectedStepId,
      );
      visualPickerState.targetStepId = step?.id || state.selectedStepId || "";
      visualPickerState.conditionId =
        picker.closest(".guided-condition-row")?.dataset.conditionId || "";
      visualPickerState.selectedSourceFile = picker.dataset.pickerSource || "";
      visualPickerState.sourceFile = atlasPickerScope(picker, step);
      renderMiniPicker();
    });
  },
  true,
);

function atlasClearConcatenateField(step, position) {
  if (!step || step.step_type !== "create_column") return false;
  const suffix = position === "2" ? "2" : "1";
  const fieldName = `concat_field_${suffix}`;
  const sourceName = `concat_source_${suffix}`;
  step.params = step.params || {};
  delete step.params[fieldName];
  delete step.params[sourceName];
  delete step.params[`${fieldName}_field_ref`];
  atlasMarkLogicIssuesDirty?.();
  atlasRequestRender?.({
    selectedStep: true,
    logicTable: true,
    preview: true,
    validation: true,
  });
  scheduleAutosave?.();
  status?.(
    `${suffix === "1" ? "First" : "Second"} Concatenate field cleared.`,
    "ok",
  );
  return true;
}
document.addEventListener(
  "click",
  (event) => {
    const clear = event.target.closest?.("[data-clear-concat-field]");
    if (!clear) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const editor = clear.closest("[data-live-editor-step-id]");
    const step = stepById?.(
      editor?.dataset.liveEditorStepId || state.selectedStepId,
    );
    atlasClearConcatenateField(step, clear.dataset.clearConcatField || "1");
  },
  true,
);

/* ATLAS-CREATED-FIELD-PICKER:END */

/* ATLAS-LOGIC-RULE-VIRTUALIZATION:BEGIN */
const ATLAS_LOGIC_VIRTUAL_OVERSCAN_PX = 700;
const ATLAS_LOGIC_VIRTUAL_ESTIMATED_HEIGHT = 118;
const atlasLogicVirtualHeights = new Map();
let atlasLogicVirtualFrameId = 0;
let atlasLogicVirtualDragMode = false;
let atlasLogicVirtualLastWidth = 0;
const atlasCollapsedLogicParents = new Set();

function atlasLogicStepHasChildren(stepId) {
  return (childrenOf?.(stepId) || []).length > 0;
}

function atlasLogicParentCollapsed(stepId) {
  return atlasCollapsedLogicParents.has(stepId);
}

function atlasLogicStepHiddenByCollapsedAncestor(step) {
  let parentId = step?.parentId || "";
  const seen = new Set();
  while (parentId && !seen.has(parentId)) {
    if (atlasCollapsedLogicParents.has(parentId)) return true;
    seen.add(parentId);
    parentId = stepById?.(parentId)?.parentId || "";
  }
  return false;
}

function atlasExpandLogicAncestors(stepId) {
  let parentId = stepById?.(stepId)?.parentId || "";
  const seen = new Set();
  let changed = false;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    changed = atlasCollapsedLogicParents.delete(parentId) || changed;
    parentId = stepById?.(parentId)?.parentId || "";
  }
  if (changed) atlasInvalidateLogicVirtualMeasurements();
  return changed;
}

function atlasLogicVirtualEntries() {
  const entries =
    typeof atlasVisibleStepEntries === "function"
      ? atlasVisibleStepEntries()
      : hierarchicalStepEntries({ includeDisabled: true });
  const currentIds = new Set(entries.map((entry) => entry.step.id));
  Array.from(atlasCollapsedLogicParents).forEach((stepId) => {
    if (!currentIds.has(stepId) || !atlasLogicStepHasChildren(stepId))
      atlasCollapsedLogicParents.delete(stepId);
  });
  return entries.filter(
    (entry) => !atlasLogicStepHiddenByCollapsedAncestor(entry.step),
  );
}

function atlasLogicVirtualHeight(entry) {
  return (
    atlasLogicVirtualHeights.get(entry.step.id) ||
    ATLAS_LOGIC_VIRTUAL_ESTIMATED_HEIGHT
  );
}

function atlasLogicVirtualOffsets(entries) {
  const offsets = [0];
  entries.forEach((entry) => {
    offsets.push(offsets[offsets.length - 1] + atlasLogicVirtualHeight(entry));
  });
  return offsets;
}

function atlasLogicVirtualIndexAtOffset(offsets, value) {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function atlasLogicVirtualRange(entries, offsets, list) {
  if (!entries.length) return { start: 0, end: 0 };
  if (atlasLogicVirtualDragMode) return { start: 0, end: entries.length };
  const top = Math.max(0, list.scrollTop - ATLAS_LOGIC_VIRTUAL_OVERSCAN_PX);
  const bottom =
    list.scrollTop + list.clientHeight + ATLAS_LOGIC_VIRTUAL_OVERSCAN_PX;
  const start = atlasLogicVirtualIndexAtOffset(offsets, top);
  const end = Math.min(
    entries.length,
    atlasLogicVirtualIndexAtOffset(offsets, bottom) + 1,
  );
  return { start, end: Math.max(start + 1, end) };
}

function atlasLogicVirtualSpacer(position, height) {
  return `<div class="logic-virtual-spacer logic-virtual-spacer-${position}" data-logic-virtual-spacer="${position}" aria-hidden="true" style="height:${Math.max(0, Math.round(height))}px;min-height:${Math.max(0, Math.round(height))}px;flex:0 0 auto;pointer-events:none"></div>`;
}

function atlasMeasureLogicVirtualCards(list, anchorId, anchorOffset) {
  let changedAboveAnchor = 0;
  const cards = list.querySelectorAll(".logic-rule-card[data-id]");
  const sample = cards[0];
  let margin = 0;
  if (sample) {
    const style = getComputedStyle(sample);
    margin =
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0);
  }
  cards.forEach((card) => {
    const measured = Math.ceil(card.getBoundingClientRect().height + margin);
    const id = card.dataset.id;
    const previous =
      atlasLogicVirtualHeights.get(id) || ATLAS_LOGIC_VIRTUAL_ESTIMATED_HEIGHT;
    if (measured > 0 && Math.abs(measured - previous) > 1) {
      atlasLogicVirtualHeights.set(id, measured);
      if (anchorId && card.offsetTop < anchorOffset)
        changedAboveAnchor += measured - previous;
    }
  });
  if (changedAboveAnchor) list.scrollTop += changedAboveAnchor;
}

const atlasInverseSyncSignatures = new WeakMap();

function atlasInverseSyncKey(step, steps) {
  const linked = steps
    .filter(
      (item) =>
        item.params?.inverse_of_step_id === step.id ||
        item.inverseOfStepId === step.id,
    )
    .map((item) => item.id)
    .join("\n");
  return `${linked}\n${JSON.stringify([
    step.step_type,
    step.source,
    step.field,
    step.parentId,
    step.branchType,
    step.params,
  ])}`;
}

function atlasRenderVirtualLogicRules(options = {}) {
  const list = e.stepsList || $("stepsList");
  if (!list) return;
  const audit = atlasDisplayDocument?.() || state.audit;
  const steps = audit.steps || [];
  if (audit === state.audit) {
    steps.forEach((step, index) => normalizeCatalogStep?.(step, index));
    steps.forEach((step) => {
      if (step.step_type !== "if_then" || step.params?.inverse_else === "Yes")
        return;
      const key = atlasInverseSyncKey(step, steps);
      if (atlasInverseSyncSignatures.get(step) === key) return;
      syncInverseElseStepsForSource?.(step.id);
      atlasInverseSyncSignatures.set(step, atlasInverseSyncKey(step, steps));
    });
  }

  const entries = atlasLogicVirtualEntries();
  const width = Math.round(list.getBoundingClientRect().width);
  if (atlasLogicVirtualLastWidth && width !== atlasLogicVirtualLastWidth)
    atlasLogicVirtualHeights.clear();
  atlasLogicVirtualLastWidth = width;

  let offsets = atlasLogicVirtualOffsets(entries);
  const range = atlasLogicVirtualRange(entries, offsets, list);
  const anchor = entries[range.start]?.step.id || "";
  const anchorOffset = offsets[range.start] || 0;
  const cards = entries
    .slice(range.start, range.end)
    .map((entry) => renderLogicRuleCard(entry))
    .join("");
  list.style.gap = "0";
  list.innerHTML = entries.length
    ? `${atlasLogicVirtualSpacer("before", offsets[range.start])}${cards}${atlasLogicVirtualSpacer("after", offsets[offsets.length - 1] - offsets[range.end])}`
    : "";

  atlasMeasureLogicVirtualCards(list, anchor, anchorOffset);
  offsets = atlasLogicVirtualOffsets(entries);
  const before = list.querySelector('[data-logic-virtual-spacer="before"]');
  const after = list.querySelector('[data-logic-virtual-spacer="after"]');
  if (before) {
    before.style.height = `${Math.max(0, Math.round(offsets[range.start]))}px`;
    before.style.minHeight = before.style.height;
  }
  if (after) {
    after.style.height = `${Math.max(0, Math.round(offsets[offsets.length - 1] - offsets[range.end]))}px`;
    after.style.minHeight = after.style.height;
  }

  if (options.includeSelectedStep !== false) renderSelectedStep?.();
  if (options.includeLogicTable !== false) renderLogicTablePreviewRows?.();
  requestAnimationFrame(atlasSyncRulesHeightToEditor);
}

function atlasScheduleVirtualLogicRules() {
  if (atlasLogicVirtualFrameId) return;
  atlasLogicVirtualFrameId = requestAnimationFrame(() => {
    atlasLogicVirtualFrameId = 0;
    atlasRenderVirtualLogicRules({
      includeSelectedStep: false,
      includeLogicTable: false,
    });
  });
}

function atlasRevealLogicStep(stepId, options = {}) {
  atlasExpandLogicAncestors(stepId);
  const entries = atlasLogicVirtualEntries();
  const index = entries.findIndex((entry) => entry.step.id === stepId);
  const list = e.stepsList || $("stepsList");
  if (!list || index < 0) return false;
  state.selectedStepId = stepId;
  const offsets = atlasLogicVirtualOffsets(entries);
  const align = options.align || "center";
  const targetTop = offsets[index];
  const targetHeight = atlasLogicVirtualHeight(entries[index]);
  list.scrollTop =
    align === "start"
      ? targetTop
      : Math.max(0, targetTop - (list.clientHeight - targetHeight) / 2);
  atlasRenderVirtualLogicRules({
    includeSelectedStep: options.includeSelectedStep !== false,
    includeLogicTable: options.includeLogicTable !== false,
  });
  requestAnimationFrame(() => {
    const card = Array.from(
      list.querySelectorAll(".logic-rule-card[data-id]"),
    ).find((item) => item.dataset.id === stepId);
    if (!card) return;
    if (options.highlight) card.classList.add("logic-issue-target-highlight");
    if (options.focus !== false) {
      const focusTarget =
        card.querySelector("[data-select-step], button, [tabindex]") || card;
      if (!focusTarget.hasAttribute("tabindex") && focusTarget === card)
        focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    }
  });
  return true;
}

function atlasInvalidateLogicVirtualMeasurements(stepId = "") {
  if (stepId) atlasLogicVirtualHeights.delete(stepId);
  else atlasLogicVirtualHeights.clear();
}

renderSteps = function renderStepsVirtualized(options = {}) {
  atlasRenderVirtualLogicRules(options);
};

document.addEventListener(
  "click",
  (event) => {
    const toggle = event.target.closest?.("[data-toggle-step-children]");
    if (!toggle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const stepId = toggle.dataset.toggleStepChildren || "";
    if (!stepId || !atlasLogicStepHasChildren(stepId)) return;
    const collapsing = !atlasCollapsedLogicParents.has(stepId);
    if (collapsing) atlasCollapsedLogicParents.add(stepId);
    else atlasCollapsedLogicParents.delete(stepId);
    if (
      collapsing &&
      state.selectedStepId &&
      state.selectedStepId !== stepId &&
      isDescendantOf?.(stepId, state.selectedStepId)
    )
      state.selectedStepId = stepId;
    atlasInvalidateLogicVirtualMeasurements();
    atlasRenderVirtualLogicRules();
    requestAnimationFrame(() => {
      const nextToggle = Array.from(
        (e.stepsList || $("stepsList"))?.querySelectorAll(
          "[data-toggle-step-children]",
        ) || [],
      ).find((control) => control.dataset.toggleStepChildren === stepId);
      nextToggle?.focus({ preventScroll: true });
    });
  },
  true,
);

document.addEventListener(
  "scroll",
  (event) => {
    const list = e.stepsList || $("stepsList");
    if (event.target === list && !atlasLogicVirtualDragMode)
      atlasScheduleVirtualLogicRules();
  },
  true,
);

window.addEventListener("resize", () => {
  atlasInvalidateLogicVirtualMeasurements();
  atlasScheduleVirtualLogicRules();
});

function atlasExpandLogicVirtualWindowForDrag() {
  const list = e.stepsList || $("stepsList");
  if (!list) return;
  const entries = atlasLogicVirtualEntries();
  const mounted = Array.from(
    list.querySelectorAll(".logic-rule-card[data-id]"),
  );
  if (!mounted.length) {
    atlasRenderVirtualLogicRules({
      includeSelectedStep: false,
      includeLogicTable: false,
    });
    return;
  }
  const firstIndex = entries.findIndex(
    (entry) => entry.step.id === mounted[0].dataset.id,
  );
  const lastIndex = entries.findIndex(
    (entry) => entry.step.id === mounted[mounted.length - 1].dataset.id,
  );
  list
    .querySelectorAll("[data-logic-virtual-spacer]")
    .forEach((node) => node.remove());
  mounted[0].insertAdjacentHTML(
    "beforebegin",
    entries
      .slice(0, Math.max(0, firstIndex))
      .map((entry) => renderLogicRuleCard(entry))
      .join(""),
  );
  mounted[mounted.length - 1].insertAdjacentHTML(
    "afterend",
    entries
      .slice(Math.max(0, lastIndex + 1))
      .map((entry) => renderLogicRuleCard(entry))
      .join(""),
  );
}

document.addEventListener(
  "pointerdown",
  (event) => {
    const dragHandle = event.target.closest?.(".compact-dragger");
    if (!dragHandle?.closest(".logic-rule-card[draggable='true']")) return;
    atlasLogicVirtualDragMode = true;
    atlasExpandLogicVirtualWindowForDrag();
  },
  true,
);

function atlasEndLogicVirtualDrag() {
  if (!atlasLogicVirtualDragMode) return;
  atlasLogicVirtualDragMode = false;
  atlasScheduleVirtualLogicRules();
}
document.addEventListener("pointerup", atlasEndLogicVirtualDrag, true);
document.addEventListener("dragend", atlasEndLogicVirtualDrag, true);
document.addEventListener("drop", atlasEndLogicVirtualDrag, true);
/* ATLAS-LOGIC-RULE-VIRTUALIZATION:END */

/* Compact viewport pane switch. Visibility is CSS-only so the editor DOM stays mounted. */
const atlasLogicPaneMedia = window.matchMedia("(max-width: 1100px)");

function atlasActivateLogicPane(pane, { focusPanel = false } = {}) {
  const page = document.getElementById("page-steps");
  if (!page) return;
  const tabs = [...page.querySelectorAll("[data-logic-pane-tab]")];
  const panels = [...page.querySelectorAll("[data-logic-pane]")];
  if (!tabs.length || !panels.length) return;
  const nextPane = pane === "step" ? "step" : "rules";
  page.dataset.logicPane = nextPane;
  tabs.forEach((tab) => {
    const selected = tab.dataset.logicPaneTab === nextPane;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.classList.toggle(
      "is-logic-pane-active",
      panel.dataset.logicPane === nextPane,
    );
  });
  if (focusPanel && atlasLogicPaneMedia.matches) {
    panels
      .find((panel) => panel.dataset.logicPane === nextPane)
      ?.focus({ preventScroll: true });
  }
}

function atlasRevealLogicStepPane() {
  atlasActivateLogicPane("step", { focusPanel: true });
}

function atlasBindLogicPaneSwitch() {
  const tablist = document.querySelector(
    "#page-steps [data-logic-pane-switch]",
  );
  if (!tablist || tablist.dataset.bound === "true") return;
  tablist.dataset.bound = "true";
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-logic-pane-tab]");
    if (!tab || !tablist.contains(tab)) return;
    atlasActivateLogicPane(tab.dataset.logicPaneTab);
  });
  tablist.addEventListener("keydown", (event) => {
    const tabs = [...tablist.querySelectorAll("[role='tab']")];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let nextIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    atlasActivateLogicPane(tabs[nextIndex].dataset.logicPaneTab);
    tabs[nextIndex].focus();
  });
}

atlasBindLogicPaneSwitch();
