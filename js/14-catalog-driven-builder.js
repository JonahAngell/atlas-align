/**
 * 14-catalog-driven-builder.js
 *
 * Catalog-driven step normalization and base guided-builder rendering for each supported Logic Builder step type.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Step type catalog
// -----------------------------------------------------------------------------
const STEP_TYPE_OPTIONS = [
  ["reference_source", "Reference Source"],
  ["create_column", "Create Column"],
  ["if_then", "IF / THEN"],
  ["join", "Join / Union Sources"],
  ["format_field", "Format Field"],
  ["sort_records", "Sort Records"],
];
const LEGACY_TYPE_MAP = {
  source: "reference_source",
  create: "create_column",
  if: "if_then",
  compare: "if_then",
  join: "join",
  transform: "filter_rows",
};

/**
 * Returns true when a Join Type value is Union.
 * @param {any} joinType - Input used by isUnionJoinType.
 */
function isUnionJoinType(joinType) {
  return (
    String(joinType || "")
      .trim()
      .toUpperCase() === "UNION"
  );
}
/**
 * Maps catalog step types back to legacy step type names.
 * @param {any} stepType - Input used by legacyTypeFromStepType.
 */
function legacyTypeFromStepType(stepType) {
  if (stepType === "reference_source") return "source";
  if (stepType === "create_column") return "create";
  if (stepType === "join") return "join";
  if (
    stepType === "if_then" ||
    stepType === "else" ||
    stepType === "filter_rows" ||
    stepType === "flag_records"
  )
    return "if";
  return "transform";
}

// -----------------------------------------------------------------------------
// Step normalization
// -----------------------------------------------------------------------------
/**
 * Normalizes a step into the catalog-driven schema.
 * @param {any} step - Logic step object being read or modified.
 * @param {any} index - Zero-based index used for ordering or display.
 */
function normalizeCatalogStep(step, index = 0) {
  if (!step) return step;
  step.step_type =
    step.step_type || LEGACY_TYPE_MAP[step.type] || step.type || "if_then";
  step.type = legacyTypeFromStepType(step.step_type);
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  if (step.step_type === "union_sources") {
    step.step_type = "join";
    step.type = "join";
    step.params.join_type = "UNION";
    step.params.left_source =
      step.params.left_source || step.params.union_left_source || "";
    step.params.right_source =
      step.params.right_source || step.params.union_right_source || "";
    step.params.output_source = step.params.output_source || step.source || "";
    step.params.left_alias =
      step.params.left_alias || sourceAliasFor(step.params.left_source);
    step.params.right_alias =
      step.params.right_alias || sourceAliasFor(step.params.right_source);
    step.params.left_field = "";
    step.params.right_field = "";
  }
  if (step.source && !step.params.source_file)
    step.params.source_file = step.source;
  if (
    step.field &&
    !step.params.field_name &&
    step.step_type !== "create_column"
  )
    step.params.field_name = step.field;
  if (step.step_type === "reference_source") {
    step.params.source_file =
      step.params.source_file ||
      step.source ||
      state.audit.sources[0]?.name ||
      "";
    step.params.source_alias =
      step.params.source_alias || sourceAliasFor(step.params.source_file);
  }
  if (step.step_type === "create_column") {
    step.params.column_name = step.params.column_name || step.field || "";
    step.params.value_mode = step.params.value_mode || "Static value";
    step.params.expression_type =
      step.params.expression_type || "custom_expression";
    // Legacy concatenate steps used one shared source. Migrate only populated
    // operands so a deliberately cleared field does not regain a stale source.
    if (step.params.value_mode === "Concatenate fields") {
      if (step.params.concat_field_1) {
        step.params.concat_source_1 =
          step.params.concat_source_1 ||
          step.params.source_file ||
          step.source ||
          "";
      } else {
        delete step.params.concat_source_1;
        delete step.params.concat_field_1_field_ref;
      }
      if (step.params.concat_field_2) {
        step.params.concat_source_2 =
          step.params.concat_source_2 ||
          step.params.source_file ||
          step.source ||
          "";
      } else {
        delete step.params.concat_source_2;
        delete step.params.concat_field_2_field_ref;
      }
    }
  }
  if (step.step_type === "if_then") {
    const conditions = parseStepConditions(step);
    if (!step.params.conditions_json)
      atlasWriteLiveEditorConditions(
        step,
        conditions.length ? conditions : [defaultGuidedCondition(step)],
      );
    step.params.then_action_type = step.params.then_action_type || "freeform";
  }
  if (step.step_type === "join")
    step.params.join_type = step.params.join_type || "INNER JOIN";
  if (step.step_type === "format_field")
    step.params.format =
      step.params.format ||
      catalogArrayFromOptions({
        path: "app_config.logic_options.format_options",
        fallback: ["text"],
      })[0];
  if (step.step_type === "sort_records")
    step.params.sort_direction = step.params.sort_direction || "Ascending";
  if (step.step_type === "remove_duplicates")
    step.params.duplicate_action =
      step.params.duplicate_action || "Keep first record";
  step.id = step.id || uid("step");
  step.sortOrder = Number.isFinite(Number(step.sortOrder))
    ? step.sortOrder
    : index + 1;
  if (!step.title)
    step.title =
      STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] ||
      "Logic Step";
  return step;
}

// -----------------------------------------------------------------------------
// Base guided-builder helpers
// -----------------------------------------------------------------------------
/**
 * Creates the default guided IF condition for a step.
 * @param {any} step - Logic step object being read or modified.
 */
function defaultGuidedCondition(step) {
  const fieldName = step.params?.field_name || step.field || "";
  const sourceFile = fieldName
    ? step.params?.source_file || step.source || ""
    : "";
  return {
    id: uid("cond"),
    connector: "IF",
    conditionType: "row_compare",
    sourceFile,
    sourceAlias: sourceAliasFor(sourceFile),
    fieldName,
    operator: "is equal to",
    valueMode: "values",
    compareValue: "",
  };
}
/**
 * Builds option markup from strings or value/label pairs.
 * @param {any} options - Configuration/options object.
 * @param {any} selected - Currently selected value.
 */
function optionsHtml(options, selected) {
  return options
    .map((option) =>
      Array.isArray(option)
        ? `<option value="${esc(option[0])}" ${selected === option[0] ? "selected" : ""}>${esc(option[1])}</option>`
        : `<option value="${esc(option)}" ${selected === option ? "selected" : ""}>${esc(option)}</option>`,
    )
    .join("");
}

/**
 * Normalizes strings, value/label pairs, or objects into choice-control items.
 * A third array entry is an optional description for card layouts.
 */
function atlasNormalizeChoiceOptions(options) {
  return (Array.isArray(options) ? options : []).map((option) => {
    if (Array.isArray(option)) {
      return {
        value: String(option[0] ?? ""),
        label: String(option[1] ?? option[0] ?? ""),
        description: String(option[2] || ""),
      };
    }
    if (option && typeof option === "object") {
      return {
        value: String(option.value ?? ""),
        label: String(option.label ?? option.value ?? ""),
        description: String(option.description || ""),
      };
    }
    return {
      value: String(option ?? ""),
      label: String(option ?? ""),
      description: "",
    };
  });
}

function atlasChoiceOptionButton(item, selected) {
  const on = item.value === selected;
  return `<button type="button" class="atlas-choice-option${on ? " is-selected" : ""}" role="radio" aria-checked="${on ? "true" : "false"}" data-choice-value="${esc(item.value)}" tabindex="${on ? "0" : "-1"}"><span class="atlas-choice-label">${esc(item.label)}</span>${item.description ? `<span class="atlas-choice-description">${esc(item.description)}</span>` : ""}</button>`;
}

/**
 * Visible single-choice control. The hidden input keeps the existing data
 * attribute so callers can keep reading `.value` and listening for `change`.
 * variant: "segment" for 2–4 short labels, "chips" for wrapping phrases,
 * "cards" when each option needs a description.
 * collapsible wraps cards or chips so the editor shows the current choice
 * until the group is opened.
 */
function atlasChoiceControl({
  options = [],
  selected = "",
  variant = "segment",
  label = "Choose",
  heading = "",
  attributes = "",
  collapsible = false,
} = {}) {
  const items = atlasNormalizeChoiceOptions(options);
  const current = items.some((item) => item.value === selected)
    ? String(selected)
    : items[0]?.value || "";
  const safeVariant = ["segment", "chips", "cards"].includes(variant)
    ? variant
    : "segment";
  const currentItem =
    items.find((item) => item.value === current) || items[0] || null;
  const control = `<div class="atlas-choice atlas-choice-${safeVariant}" role="radiogroup" aria-label="${esc(label)}"><input type="hidden" ${attributes} value="${esc(current)}">${items.map((item) => atlasChoiceOptionButton(item, current)).join("")}</div>`;
  if (!collapsible) return control;
  const title = heading || label;
  return `<details class="atlas-choice-disclosure"><summary><span class="atlas-choice-heading">${esc(title)}</span><span class="atlas-choice-current">${esc(currentItem?.label || "Choose")}</span></summary>${control}</details>`;
}

function atlasSyncChoiceSelection(input) {
  const group = input?.closest?.(".atlas-choice");
  if (!group) return;
  const value = input.value;
  let currentLabel = value;
  group.querySelectorAll(".atlas-choice-option").forEach((button) => {
    const on = button.dataset.choiceValue === value;
    button.classList.toggle("is-selected", on);
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.tabIndex = on ? 0 : -1;
    if (on)
      currentLabel =
        button.querySelector(".atlas-choice-label")?.textContent || value;
  });
  const current = group
    .closest(".atlas-choice-disclosure")
    ?.querySelector(".atlas-choice-current");
  if (current) current.textContent = currentLabel;
}

function atlasSetChoiceOptions(input, options, selected = input?.value || "") {
  const group = input?.closest?.(".atlas-choice");
  if (!group || !input) return false;
  const items = atlasNormalizeChoiceOptions(options);
  const current = items.some((item) => item.value === selected)
    ? String(selected)
    : items.some((item) => item.value === input.value)
      ? input.value
      : items[0]?.value || "";
  input.value = current;
  group.querySelectorAll(".atlas-choice-option").forEach((button) => button.remove());
  group.insertAdjacentHTML(
    "beforeend",
    items.map((item) => atlasChoiceOptionButton(item, current)).join(""),
  );
  atlasSyncChoiceSelection(input);
  return true;
}

function atlasApplyChoiceValue(button) {
  const group = button?.closest?.(".atlas-choice");
  const input = group?.querySelector("input[type='hidden']");
  const next = button?.dataset.choiceValue ?? "";
  if (!group || !input || input.value === next) {
    button?.focus?.();
    return;
  }
  input.value = next;
  atlasSyncChoiceSelection(input);
  button.focus();
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("[data-choice-value]");
    if (!button || !button.closest(".atlas-choice")) return;
    event.preventDefault();
    atlasApplyChoiceValue(button);
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    const button = event.target.closest?.(".atlas-choice-option");
    if (!button) return;
    const group = button.closest(".atlas-choice");
    const options = [...group.querySelectorAll(".atlas-choice-option")];
    const index = options.indexOf(button);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    atlasApplyChoiceValue(options[next]);
  },
  true,
);

function atlasDescribedChoices(options, descriptions = {}) {
  return (Array.isArray(options) ? options : []).map((option) => {
    const value = Array.isArray(option) ? option[0] : option;
    const label = Array.isArray(option) ? option[1] : option;
    return [value, label, descriptions[value] || ""];
  });
}
/**
 * Renders a field picker input using an options object.
 * Explicit property names keep call sites readable and avoid positional-argument ambiguity.
 * @param {Object} options - Field-picker rendering options.
 * @param {string} options.name - Parameter name written to data-param.
 * @param {string} options.value - Currently selected field value.
 * @param {string} options.placeholder - Empty-state label used by visual overrides.
 * @param {string} options.sourceFile - Source file used to scope available fields.
 */
function fieldInputFromOptions({
  name = "",
  value = "",
  placeholder = "Select field",
  sourceFile = "",
} = {}) {
  return `<select data-param="${esc(name)}">${fieldOptionsHtml(sourceFile, value || "")}</select>`;
}
/**
 * Renders a source picker input using an options object.
 * Explicit property names keep call sites readable and avoid positional-argument ambiguity.
 * @param {Object} options - Source-picker rendering options.
 * @param {string} options.name - Parameter name written to data-param.
 * @param {string} options.value - Currently selected source value.
 * @param {string} options.placeholder - Empty-state label used by visual overrides.
 */
function sourceInputFromOptions({
  name = "",
  value = "",
  placeholder = "Select source file",
} = {}) {
  return `<select data-param="${esc(name)}">${sourceOptionsHtml(value || "")}</select>`;
}
/**
 * Renders hidden source alias input markup.
 * @param {any} params - Step params object.
 */
function sourceAliasHidden(params) {
  return `<input type="hidden" data-param="source_alias" value="${esc(params.source_alias || sourceAliasFor(params.source_file || ""))}">`;
}

/**
 * Normalizes newline-delimited comparison input into one value per line.
 * @param {any} value - Raw comparison value list.
 */
function valuesToLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Writes guided IF conditions back to a step in the canonical params/summary shape.
 * @param {any} step - Step to update.
 * @param {Array<any>} conditions - Guided condition list.
 */
function atlasWriteLiveEditorConditions(step, conditions) {
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  step.params.conditions_json = JSON.stringify(conditions || []);
  step.conditions = (conditions || []).map((condition) => ({
    id: condition.id,
    field: condition.fieldName,
    operator: condition.operator,
    value: condition.compareValue,
  }));
}

// -----------------------------------------------------------------------------
// Catalog-driven editor rendering
// -----------------------------------------------------------------------------
/**
 * Renders the catalog-driven editor for a step type.
 * @param {any} step - Logic step object being read or modified.
 */
function renderGuidedBuilder(step) {
  normalizeCatalogStep(step);
  const p = step.params || {};
  if (step.step_type === "reference_source")
    return `<div class="guided-builder"><h4>Reference Source</h4><label>Source File${sourceInputFromOptions(
      {
        name: "source_file",
        value: p.source_file,
        placeholder: "Select source file",
      },
    )}</label><label>Source Alias<input data-param="source_alias" value="${esc(p.source_alias || sourceAliasFor(p.source_file || ""))}"></label></div>`;
  if (step.step_type === "create_column") {
    const valueModes = catalogArrayFromOptions({
      path: "app_config.logic_options.create_value_modes",
      fallback: [
        "Static value",
        "Source field value",
        ATLAS_STRING_TRANSFORM_VALUE_MODE,
        "Concatenate fields",
      ],
    }).filter(
      (value) =>
        value !== "Expression / calculation" &&
        value !== "Expression/Calculation",
    );
    const selectedValueMode =
      p.value_mode === "Expression / calculation" ||
      p.value_mode === "Expression/Calculation"
        ? ""
        : p.value_mode;
    return `<div class="guided-builder"><h4>Create Column</h4><label>New Column Name<input data-param="column_name" value="${esc(p.column_name || "")}" placeholder="e.g., Error Message"></label><div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: atlasDescribedChoices(valueModes, {
          "Static value": "Write a fixed value into the new column.",
          "Source field value": "Copy or calculate from a source field.",
          [ATLAS_STRING_TRANSFORM_VALUE_MODE]:
            "Take characters or a character count from a field.",
          "Concatenate fields": "Join two fields into one value.",
        }),
        selected: selectedValueMode,
        variant: "cards",
        label: "Column Value Type",
        heading: "Column Value Type",
        collapsible: true,
        attributes: 'data-param="value_mode"',
      },
    )}</div>${renderCreateModeInputs(p)}</div>`;
  }
  if (step.step_type === "if_then")
    return `<div class="guided-builder"><h4>IF Condition Builder</h4><div class="condition-guided-stack">${parseStepConditions(
      step,
    )
      .map((condition, index) => renderConditionRow(condition, index))
      .join(
        "",
      )}</div><div class="row"><button type="button" class="secondary small" data-guided-add-condition="AND">+ AND</button><button type="button" class="secondary small" data-guided-add-condition="OR">+ OR</button></div>${renderThenActionBuilder(p)}</div>`;
  if (step.step_type === "else")
    return `<div class="guided-builder"><h4>ELSE Action</h4><p class="hint">ELSE can apply an action or end with a colon so nested sub-steps can continue beneath it.</p>${renderThenActionBuilder(p, "ELSE")}</div>`;

  if (step.step_type === "join") {
    const union = isUnionJoinType(p.join_type);
    const joinOptions = [
      "INNER JOIN",
      "LEFT JOIN",
      "RIGHT JOIN",
      "FULL OUTER JOIN",
      "UNION",
    ];
    return `
    <div class="guided-builder">
      <h4>${union ? "Union Sources" : "Join / Union Sources"}</h4>
      <label>
        Join Type
        <select data-param="join_type">
          ${optionsHtml(joinOptions, p.join_type || "INNER JOIN")}
        </select>
      </label>
      <label>
        Left Source
        ${
          union
            ? sourceInputFromOptions({
                name: "left_source",
                value: p.left_source,
                placeholder: "Select source file",
              })
            : `<input type="hidden" data-param="left_source" value="${esc(p.left_source || "")}">`
        }
      </label>
      ${
        union
          ? ""
          : `<label>
        Left Field
        ${fieldInputFromOptions({
          name: "left_field",
          value: p.left_field,
          placeholder: "Select field",
          sourceFile: p.left_source,
        })}
      </label>`
      }
      <label>
        Right Source
        ${
          union
            ? sourceInputFromOptions({
                name: "right_source",
                value: p.right_source,
                placeholder: "Select source file",
              })
            : `<input type="hidden" data-param="right_source" value="${esc(p.right_source || "")}">`
        }
      </label>
      ${
        union
          ? ""
          : `<label>
        Right Field
        ${fieldInputFromOptions({
          name: "right_field",
          value: p.right_field,
          placeholder: "Select field",
          sourceFile: p.right_source,
        })}
      </label>`
      }
      ${
        union
          ? `<label>Output Source${sourceInputFromOptions({
              name: "output_source",
              value: p.output_source,
              placeholder: "Select source file",
            })}</label><p class="hint join-builder-union-hint">Union appends rows from both files into one combined output. No matching key is needed.</p>`
          : ""
      }
    </div>`;
  }
  if (step.step_type === "format_field")
    return `<div class="guided-builder"><h4>Format Field</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select field",
        sourceFile: p.source_file,
      },
    )}</label><div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: atlasDescribedChoices(
          catalogArrayFromOptions({
            path: "app_config.logic_options.format_options",
            fallback: ["text", "number"],
          }),
          {
            "eight digits with leading zeroes": "Pad the value to eight digits.",
            "date format MM/DD/YYYY": "Show the value as a date.",
            text: "Keep the value as text.",
            number: "Keep the value as a number.",
          },
        ),
        selected: p.format,
        variant: "cards",
        label: "Format",
        heading: "Format",
        collapsible: true,
        attributes: 'data-param="format"',
      },
    )}</div></div>`;
  if (step.step_type === "split_field")
    return `<div class="guided-builder"><h4>Split Field</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select field",
        sourceFile: p.source_file,
      },
    )}</label><label>Split On<input data-param="split_on" value="${esc(p.split_on || "")}"></label><label>Display Part<input data-param="split_part" value="${esc(p.split_part || "")}" placeholder="e.g., first value"></label><label>Output Column${fieldInputFromOptions(
      {
        name: "output_column",
        value: p.output_column,
        placeholder: "Select field",
        sourceFile: "",
      },
    )}</label></div>`;
  if (step.step_type === "sort_records")
    return `<div class="guided-builder"><h4>Sort Records</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Sort Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select field",
        sourceFile: p.source_file,
      },
    )}</label><div class="atlas-choice-field"><span class="atlas-choice-heading">Direction</span>${atlasChoiceControl(
      {
        options: catalogArrayFromOptions({
          path: "app_config.logic_options.sort_directions",
          fallback: ["Ascending", "Descending"],
        }),
        selected: p.sort_direction,
        variant: "segment",
        label: "Sort direction",
        attributes: 'data-param="sort_direction"',
      },
    )}</div></div>`;
  if (step.step_type === "remove_duplicates")
    return `<div class="guided-builder"><h4>Remove Duplicates</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select field",
        sourceFile: p.source_file,
      },
    )}</label><div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: atlasDescribedChoices(
          catalogArrayFromOptions({
            path: "app_config.logic_options.duplicate_actions",
            fallback: [
              "Keep first record",
              "Keep last record",
              "Drop all duplicated records",
            ],
          }),
          {
            "Keep first record": "Keep the earliest matching record.",
            "Keep last record": "Keep the latest matching record.",
            "Drop all duplicated records": "Remove every record that is duplicated.",
          },
        ),
        selected: p.duplicate_action,
        variant: "cards",
        label: "Duplicate action",
        heading: "Duplicate Action",
        collapsible: true,
        attributes: 'data-param="duplicate_action"',
      },
    )}</div></div>`;
  if (step.step_type === "filter_rows" || step.step_type === "flag_records")
    return `<div class="guided-builder"><h4>${step.step_type === "filter_rows" ? "Filter Rows" : "Flag Records"}</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select field",
        sourceFile: p.source_file,
      },
    )}</label><div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: catalogArrayFromOptions({
          path: "app_config.logic_options.operators",
          fallback: ["is equal to"],
        }),
        selected: p.operator,
        variant: "chips",
        label: "Operator",
        heading: "Operator",
        collapsible: true,
        attributes: 'data-param="operator"',
      },
    )}</div><label>Compare Value<textarea data-param="compare_value" placeholder="One or more values">${esc(p.compare_value || "")}</textarea></label>${
      step.step_type === "filter_rows"
        ? `<div class="atlas-choice-field"><span class="atlas-choice-heading">Filter Action</span>${atlasChoiceControl(
            {
              options: catalogArrayFromOptions({
                path: "app_config.logic_options.filter_actions",
                fallback: ["Keep matching rows", "Exclude matching rows"],
              }),
              selected: p.filter_action,
              variant: "segment",
              label: "Filter action",
              attributes: 'data-param="filter_action"',
            },
          )}</div>`
        : `<div class="atlas-choice-field">${atlasChoiceControl(
            {
              options: [
                [
                  "display_text",
                  "Display text response",
                  "Show a message for the matching record.",
                ],
                [
                  "do_not_display",
                  "Do not display record",
                  "Hide the matching record.",
                ],
              ],
              selected:
                p.flag_action === "do_not_display"
                  ? "do_not_display"
                  : "display_text",
              variant: "cards",
              label: "Flag action",
              heading: "Flag Action",
              collapsible: true,
              attributes: 'data-param="flag_action"',
            },
          )}</div><label>Message<input data-param="message" value="${esc(p.message || "")}"></label><label>Output Column${fieldInputFromOptions(
            {
              name: "output_column",
              value: p.output_column || phrasePlaceholder("error_message_column", "Error Message"),
              placeholder: "Select field",
              sourceFile: "",
            },
          )}</label>`
    }</div>`;
  return "";
}
/**
 * Renders Create Column inputs for the selected value mode.
 * @param {any} p - Input used by renderCreateModeInputs.
 */
function renderCreateModeInputs(p) {
  if (p.value_mode === "Static value")
    return `<label>Static Value<input data-param="static_value" value="${esc(p.static_value || "")}"></label>`;
  if (p.value_mode === "Source field value")
    return `<input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Source Field${fieldInputFromOptions(
      {
        name: "field_name",
        value: p.field_name,
        placeholder: "Select source field",
        sourceFile: p.source_file,
      },
    )}</label>`;
  if (p.value_mode === "Concatenate fields")
    return `<div class="logic-picker-pair"><input type="hidden" data-param="concat_source_1" value="${esc(p.concat_field_1 ? p.concat_source_1 || "" : "")}"><label>First Field${fieldInputFromOptions(
      {
        name: "concat_field_1",
        value: p.concat_field_1,
        placeholder: "Select first field",
        sourceFile: p.concat_field_1 ? p.concat_source_1 || "" : "",
      },
    )}<button type="button" class="secondary small" data-clear-concat-field="1" aria-label="Clear First Field" ${p.concat_field_1 ? "" : "disabled"}>Clear</button></label><input type="hidden" data-param="concat_source_2" value="${esc(p.concat_field_2 ? p.concat_source_2 || "" : "")}"><label>Second Field${fieldInputFromOptions(
      {
        name: "concat_field_2",
        value: p.concat_field_2,
        placeholder: "Select second field",
        sourceFile: p.concat_field_2 ? p.concat_source_2 || "" : "",
      },
    )}<button type="button" class="secondary small" data-clear-concat-field="2" aria-label="Clear Second Field" ${p.concat_field_2 ? "" : "disabled"}>Clear</button></label></div>`;
  return `<label>Expression Type<select data-param="expression_type"><option value="custom_expression" ${p.expression_type === "custom_expression" ? "selected" : ""}>Custom Expression</option><option value="first_characters" ${p.expression_type === "first_characters" ? "selected" : ""}>First Characters</option><option value="character_count" ${p.expression_type === "character_count" ? "selected" : ""}>Character Count</option></select></label><label>Expression / Calculation<textarea data-param="expression">${esc(p.expression || "")}</textarea></label><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Expression Source Field${fieldInputFromOptions(
    {
      name: "expression_source_field",
      value: p.expression_source_field,
      placeholder: "Select field",
      sourceFile: p.source_file,
    },
  )}</label><label>Number of Characters<input data-param="character_count" value="${esc(p.character_count || "")}"></label>`;
}
function compareMathOperationsForCondition(condition = {}) {
  return typeof parseSourceMathOperations === "function"
    ? parseSourceMathOperations(
        condition.compareMathJson ||
          condition.compare_math_json ||
          condition.compareMath ||
          [],
      )
    : [];
}

function compareMathOperatorOptions(selected = "*") {
  return (
    typeof ATLAS_SOURCE_MATH_OPERATORS !== "undefined"
      ? ATLAS_SOURCE_MATH_OPERATORS
      : ["+", "-", "*", "/"]
  )
    .map(
      (operator) =>
        `<option value="${esc(operator)}" ${operator === selected ? "selected" : ""}>${esc(operator)}</option>`,
    )
    .join("");
}

function renderCompareMathOperationRow(
  operation = {},
  fallbackSourceFile = "",
) {
  const id = operation.id || uid("math");
  const operator =
    typeof ATLAS_SOURCE_MATH_OPERATORS !== "undefined" &&
    ATLAS_SOURCE_MATH_OPERATORS.includes(operation.operator)
      ? operation.operator
      : "*";
  const operandType = operation.operandType === "field" ? "field" : "number";
  const operandSource = operation.operandSourceFile || fallbackSourceFile;
  return `<div class="compare-math-operation-row condition-value-row" data-compare-math-row data-compare-math-id="${esc(id)}">
    <select data-compare-math-operator aria-label="Math operator">${compareMathOperatorOptions(operator)}</select>
    <select data-compare-math-operand-type aria-label="Operand type"><option value="number" ${operandType === "number" ? "selected" : ""}>Number</option><option value="field" ${operandType === "field" ? "selected" : ""}>Field</option></select>
    <input data-compare-math-operand value="${esc(operation.operand || "")}" placeholder="Value" inputmode="decimal" ${operandType === "field" ? "hidden" : ""}>
    <select data-compare-math-operand-source ${operandType === "field" ? "" : "hidden"}>${sourceOptionsHtml(operandSource)}</select>
    <select data-compare-math-operand-field ${operandType === "field" ? "" : "hidden"}>${fieldOptionsHtml(operandSource, operation.operandFieldName || "")}</select>
    <button type="button" class="secondary small" data-remove-compare-math-operation>Remove</button>
  </div>`;
}

function renderCompareMathEditor(condition = {}, compareSourceFile = "") {
  const operations = compareMathOperationsForCondition(condition);
  const hiddenValue = JSON.stringify(operations);
  return `<div class="compare-math-editor condition-values-editor" data-compare-math-editor>
    <div class="condition-values-header"><label>Compare Field Math<input type="hidden" data-condition-field="compareMathJson" value="${esc(hiddenValue)}"></label><button type="button" class="secondary small" data-add-compare-math-operation>Add Operation</button></div>
    <p class="hint full">Optional operations are applied to the compare field in order.</p>
    <div class="compare-math-operations-list condition-values-list" data-compare-math-list>${operations.map((operation) => renderCompareMathOperationRow(operation, compareSourceFile)).join("")}</div>
  </div>`;
}

/**
 * Renders one guided IF/THEN condition row.
 * @param {any} condition - Condition object to format or render.
 * @param {any} index - Zero-based index used for ordering or display.
 */
function renderConditionRow(condition, index) {
  const sourceFile = condition.sourceFile || "";
  const valueMode = condition.valueMode || "values";
  const compareSource = condition.compareSourceFile || sourceFile;
  return `<div class="guided-condition-row" data-condition-index="${index}" data-condition-id="${esc(condition.id || uid("cond"))}">
    <select data-condition-field="connector"><option ${index === 0 ? "selected" : ""}>IF</option><option ${condition.connector === "AND" ? "selected" : ""}>AND</option><option ${condition.connector === "OR" ? "selected" : ""}>OR</option></select>
    <label>Source File<select data-condition-field="sourceFile">${sourceOptionsHtml(sourceFile)}</select></label>
    <label>Field<select data-condition-field="fieldName">${fieldOptionsHtml(sourceFile, condition.fieldName || "")}</select></label>
    <label>Operator<select data-condition-field="operator">${optionsHtml(
      catalogArrayFromOptions({
        path: "app_config.logic_options.operators",
        fallback: ["is equal to"],
      }),
      condition.operator,
    )}</select></label>
    <label>Value Mode<select data-condition-field="valueMode"><option value="values" ${valueMode === "values" ? "selected" : ""}>Values</option><option value="field" ${valueMode === "field" ? "selected" : ""}>Compare to Field</option><option value="blank" ${valueMode === "blank" ? "selected" : ""}>Blank / Null</option></select></label>
    ${
      valueMode === "field"
        ? `<label>Compare Source<select data-condition-field="compareSourceFile">${sourceOptionsHtml(compareSource)}</select></label><label>Compare Field<select data-condition-field="compareFieldName">${fieldOptionsHtml(compareSource, condition.compareFieldName || "")}</select></label>${renderCompareMathEditor(condition, compareSource)}`
        : valueMode === "blank"
          ? `<div class="logic-editor-callout">No comparison value required.</div>`
          : `<label>Values<textarea data-condition-field="compareValue" placeholder="One value per line">${esc(condition.compareValue || condition.expression || "")}</textarea></label>`
    }
    <button type="button" class="danger small" data-guided-delete-condition>Delete</button>
  </div>`;
}

/**
 * Renders THEN/ELSE action controls.
 * @param {any} p - Input used by renderThenActionBuilder.
 * @param {any} prefix - Action label prefix such as THEN or ELSE.
 */
function renderThenActionBuilder(p, prefix = "THEN") {
  return `<div class="then-action-builder"><h4>${prefix} Action</h4><label>${prefix} Action Type<select data-param="then_action_type"><option value="freeform" ${p.then_action_type === "freeform" ? "selected" : ""}>Freeform Text</option><option value="set_column_value" ${p.then_action_type === "set_column_value" ? "selected" : ""}>Set Column Value from Field</option><option value="display_text" ${p.then_action_type === "display_text" ? "selected" : ""}>Display Text Response in Column</option><option value="do_not_display" ${p.then_action_type === "do_not_display" ? "selected" : ""}>Do Not Display</option></select></label><label>${prefix} Action<textarea data-param="then_action" placeholder="e.g., display records in the audit">${esc(p.then_action || "")}</textarea></label><label>Display Text<input data-param="then_text" value="${esc(p.then_text || "")}" placeholder="e.g., Research IT0027"></label><label>Output Column${fieldInputFromOptions(
    {
      name: "then_output_column",
      value: p.then_output_column || phrasePlaceholder("error_message_column", "Error Message"),
      placeholder: "Select field",
      sourceFile: "",
    },
  )}</label><label>Target Column${fieldInputFromOptions({
    name: "then_target_column",
    value: p.then_target_column,
    placeholder: "Select field",
    sourceFile: "",
  })}</label><input type="hidden" data-param="then_value_source_file" value="${esc(p.then_value_source_file || p.source_file || "")}"><label>Value Field${fieldInputFromOptions(
    {
      name: "then_value_field",
      value: p.then_value_field,
      placeholder: "Select field",
      sourceFile: p.then_value_source_file || p.source_file,
    },
  )}</label></div>`;
}

// -----------------------------------------------------------------------------
// Base catalog-driven rules rendering
// -----------------------------------------------------------------------------
/**
 * Handles the renderSteps portion of the ATLAS Align client-side workflow.
 */
function renderStepsCatalogDrivenBase() {
  state.audit.steps.forEach((step, index) => normalizeCatalogStep(step, index));
  const entries = hierarchicalStepEntries({ includeDisabled: true });
  e.stepsList.innerHTML = entries
    .map((entry) => {
      const step = entry.step;
      return `<div class="card step-card ${state.selectedStepId === step.id ? "selected" : ""} ${step.parentId ? `branch-${step.branchType || "then"}` : "branch-root"}" data-id="${esc(step.id)}" data-parent-id="${esc(step.parentId || "")}" style="--depth:${entry.level}"><div class="step-header"><span class="step-title"><span class="step-number">${esc(entry.number)}</span>${esc(STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || step.step_type)}</span><span class="badge branch-badge">${esc(entry.branchLabel)}</span><span class="badge">${esc(STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || step.step_type)}</span></div><div class="hierarchy-controls"><label>Parent Step<select data-step-parent>${parentOptionsForStep(
        step,
      )
        .map(
          (option) =>
            `<option value="${esc(option.id)}" ${(step.parentId || "") === option.id ? "selected" : ""}>${esc(option.label)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Branch Type<select data-step-branch>${branchTypeOptions(step)}</select></label></div><input type="hidden" data-step-title value="${esc(step.title || STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || "Logic Step")}"><label>SWAT Step Type<select data-step-type>${optionsHtml(STEP_TYPE_OPTIONS, step.step_type)}</select></label><input type="hidden" data-step-source value="${esc(step.source || "")}"><input type="hidden" data-step-field value="${esc(step.field || "")}"><input type="hidden" data-step-action value="${esc(step.action || "")}">${renderGuidedBuilder(step)}<label>Manual Notes<textarea data-step-notes>${esc(step.notes || "")}</textarea></label><label><span class="check"><input type="checkbox" data-step-enabled ${step.enabled !== false ? "checked" : ""}> Enabled</span></label><div class="logic-preview-small"><strong>Generated Analyst Logic</strong><p>${esc(analystLogic(step))}</p></div><div class="row hierarchy-buttons"><button class="secondary small" data-select-step>Select</button><button class="small" data-add-child-step>Add Child Step</button><button class="secondary small" data-indent>Indent</button><button class="secondary small" data-outdent>Outdent</button><button class="danger small" data-delete-step>Delete Step</button></div></div>`;
    })
    .join("");
  renderSelectedStep();
}

// -----------------------------------------------------------------------------
// Catalog-driven capture override
// -----------------------------------------------------------------------------
const baseCapture = capture;
/**
 * Reads current DOM controls into the in-memory audit state.
 */
capture = function captureCatalogDriven() {
  baseCapture();
  document.querySelectorAll(".step-card").forEach((card) => {
    const step = state.audit.steps.find((item) => item.id === card.dataset.id);
    if (!step) return;
    step.step_type =
      card.querySelector("[data-step-type]")?.value ||
      step.step_type ||
      "if_then";
    step.type = legacyTypeFromStepType(step.step_type);
    step.params =
      step.params && typeof step.params === "object" ? step.params : {};
    card.querySelectorAll("[data-param]").forEach((input) => {
      const paramName = input.dataset.param;
      if (
        paramName === "string_character_count" ||
        paramName === "then_string_character_count"
      ) {
        const normalized = atlasPositiveWholeNumber(input.value);
        if (!normalized) {
          input.setAttribute("aria-invalid", "true");
          input.setCustomValidity?.(
            "Enter a positive whole number greater than zero.",
          );
          return;
        }
        input.value = normalized;
        input.setAttribute("aria-invalid", "false");
        input.setCustomValidity?.("");
        step.params[paramName] = normalized;
        return;
      }
      if (input.type === "checkbox")
        step.params[paramName] = input.checked ? "Yes" : "No";
      else step.params[paramName] = input.value;
    });
    const conditionRows = [...card.querySelectorAll(".guided-condition-row")];
    if (conditionRows.length) {
      const conditions = conditionRows.map((row, index) => {
        /**
         * Handles the get portion of the ATLAS Align client-side workflow.
         * @param {any} field - Field record.
         */
        const get = (field) =>
          row.querySelector(`[data-condition-field="${field}"]`)?.value || "";
        const sourceFile = get("sourceFile");
        const compareSourceFile = get("compareSourceFile") || sourceFile;
        return {
          id: row.dataset.conditionId || uid("cond"),
          connector: index === 0 ? "IF" : get("connector"),
          conditionType: "row_compare",
          sourceFile,
          sourceAlias: sourceAliasFor(sourceFile),
          fieldName: get("fieldName"),
          operator: get("operator"),
          valueMode: get("valueMode") || "values",
          compareValue: get("compareValue"),
          compareFieldName: get("compareFieldName"),
          compareSourceFile,
          compareSourceAlias: sourceAliasFor(compareSourceFile),
          expression: get("expression"),
          compareMathJson: get("compareMathJson"),
        };
      });
      atlasWriteLiveEditorConditions(step, conditions);
    }
    if (step.params.source_file) {
      step.source = step.params.source_file;
      step.params.source_alias = sourceAliasFor(step.params.source_file);
    }
    if (step.params.field_name) step.field = step.params.field_name;
    if (step.params.column_name) step.field = step.params.column_name;
  });
};

// -----------------------------------------------------------------------------
// ELSE branch actions
// -----------------------------------------------------------------------------
/**
 * Creates or updates an ELSE child step for an IF/THEN step.
 * @param {any} ifStep - Input used by createOrUpdateElseStep.
 */
function atlasConditionSummaries(conditions) {
  return (conditions || []).map((condition) => ({
    id: condition.id,
    field: condition.fieldName || condition.field || "",
    operator: condition.operator || "is equal to",
    value:
      condition.compareValue || condition.value || condition.expression || "",
  }));
}

function atlasCloneInverseConditionsForTarget(sourceStep, targetStep = null) {
  const inverted =
    typeof invertedConditionsForStep === "function"
      ? invertedConditionsForStep(sourceStep)
      : [];
  const existing = targetStep ? parseStepConditions(targetStep) : [];
  return inverted.map((condition, index) => ({
    ...condition,
    id: existing[index]?.id || condition.id || uid("cond"),
  }));
}

function atlasSourceForInverseStep(sourceStep, conditions) {
  return (
    sourceStep?.params?.source_file ||
    sourceStep?.source ||
    conditions?.[0]?.sourceFile ||
    ""
  );
}

function atlasInverseElseSortOrder(sourceStep) {
  const siblings = childrenOf(sourceStep.parentId || null);
  const index = siblings.findIndex((step) => step.id === sourceStep.id);
  const current = Number(sourceStep.sortOrder) || index + 1;
  const next = siblings[index + 1];
  if (next) return (current + (Number(next.sortOrder) || index + 2)) / 2;
  return current + 1;
}

function syncInverseElseStepsForSource(ifStepId) {
  const sourceStep = state.audit.steps.find(
    (step) => step.id === ifStepId && step.step_type === "if_then",
  );
  if (!sourceStep) return false;
  let changed = false;
  (state.audit.steps || []).forEach((step) => {
    if (
      step?.params?.inverse_else !== "Yes" ||
      step.params.inverse_of_step_id !== ifStepId
    )
      return;
    const conditions = atlasCloneInverseConditionsForTarget(sourceStep, step);
    const sourceFile = atlasSourceForInverseStep(sourceStep, conditions);
    const sourceAlias = sourceAliasFor(sourceFile);
    step.params =
      step.params && typeof step.params === "object" ? step.params : {};
    atlasWriteLiveEditorConditions(step, conditions);
    step.params.source_file = sourceFile;
    step.params.source_alias = sourceAlias;
    step.source = sourceFile;
    changed = true;
  });
  return changed;
}

function createInverseElseStepForIf(stepId) {
  capture?.();
  const sourceStep = state.audit.steps.find((step) => step.id === stepId);
  if (
    !sourceStep ||
    sourceStep.autoGeneratedReference ||
    sourceStep.step_type !== "if_then"
  ) {
    status?.(
      "Create inverse step (ELSE) is only available for manual IF steps.",
      "warn",
    );
    return null;
  }
  normalizeCatalogStep(sourceStep);
  const conditions = atlasCloneInverseConditionsForTarget(sourceStep);
  const sourceFile = atlasSourceForInverseStep(sourceStep, conditions);
  const sourceAlias = sourceAliasFor(sourceFile);
  const inverseStep = {
    id: uid("step"),
    enabled: true,
    parentId: sourceStep.parentId || null,
    branchType:
      sourceStep.branchType || (sourceStep.parentId ? "then" : "root"),
    sortOrder: atlasInverseElseSortOrder(sourceStep),
    title: "Inverse ELSE",
    type: "if",
    step_type: "if_then",
    source: sourceFile,
    field: "",
    action: "",
    notes: "",
    conditions: atlasConditionSummaries(conditions),
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
  const entries = hierarchicalStepEntries({ includeDisabled: true });
  const sourceEntryIndex = entries.findIndex(
    (entry) => entry.step.id === sourceStep.id,
  );
  let afterStep = sourceStep;
  for (
    let index = sourceEntryIndex + 1;
    index >= 0 && index < entries.length;
    index += 1
  ) {
    if (isDescendantOf(sourceStep.id, entries[index].step.id))
      afterStep = entries[index].step;
    else break;
  }
  const steps = state.audit.steps || [];
  const insertIndex = Math.max(
    steps.findIndex((step) => step.id === afterStep.id),
    steps.findIndex((step) => step.id === sourceStep.id),
  );
  if (insertIndex >= 0) steps.splice(insertIndex + 1, 0, inverseStep);
  else steps.push(inverseStep);
  state.audit.steps = steps;
  syncInverseElseStepsForSource(sourceStep.id);
  atlasNormalizeStepOrderGroups?.();
  state.selectedStepId = inverseStep.id;
  renderAll();
  showSection?.("steps");
  scheduleAutosave();
  status?.("Created inverse ELSE step.", "ok");
  return inverseStep;
}

function createOrUpdateElseStep(ifStep) {
  // Legacy helper kept for existing references. New ELSE behavior uses linked inverse IF steps.
  return createInverseElseStepForIf(ifStep?.id || ifStep);
}
document.addEventListener("click", (event) => {
  const card = event.target.closest(".step-card");
  if (!card) return;
  const step = state.audit.steps.find((item) => item.id === card.dataset.id);
  if (!step) return;
  if (event.target.matches("[data-guided-add-condition]")) {
    capture();
    const conditions = parseStepConditions(step);
    conditions.push({
      ...defaultGuidedCondition(step),
      connector: event.target.dataset.guidedAddCondition,
    });
    atlasWriteLiveEditorConditions(step, conditions);
    syncInverseElseStepsForSource?.(step.id);
    renderAll();
    scheduleAutosave();
  }
  if (event.target.matches("[data-guided-delete-condition]")) {
    capture();
    const index = Number(
      event.target.closest(".guided-condition-row")?.dataset.conditionIndex ||
        0,
    );
    const conditions = parseStepConditions(step).filter(
      (_condition, conditionIndex) => conditionIndex !== index,
    );
    atlasWriteLiveEditorConditions(
      step,
      conditions.length ? conditions : [defaultGuidedCondition(step)],
    );
    syncInverseElseStepsForSource?.(step.id);
    renderAll();
    scheduleAutosave();
  }
});

// -----------------------------------------------------------------------------
// Audit workspace render override
// -----------------------------------------------------------------------------
// Overrides for the audit-workspace pane redesign: generated reference steps are locked and shown first.
/**
 * Handles the renderSteps portion of the ATLAS Align client-side workflow.
 */
function renderStepsAuditWorkspace() {
  state.audit.steps.forEach((step, index) => normalizeCatalogStep(step, index));
  const entries = hierarchicalStepEntries({ includeDisabled: true });
  e.stepsList.innerHTML = entries
    .map((entry) => {
      const step = entry.step;
      if (step.autoGeneratedReference) {
        return `<div class="card step-card generated-reference-step ${state.selectedStepId === step.id ? "selected" : ""}" data-id="${esc(step.id)}" data-parent-id="" style="--depth:${entry.level}">
        <div class="step-header"><span class="step-title"><span class="step-number">${esc(entry.number)}</span>Reference Source</span><span class="badge">Generated</span><span class="badge">Locked</span></div>
        <p class="hint">This reference step is generated from the source files selected in Sources & Fields.</p>
        <div class="logic-preview-small"><strong>Generated Analyst Logic</strong><p>${esc(analystLogic(step))}</p></div>
        <div class="row hierarchy-buttons"><button class="secondary small" data-select-step>Select</button></div>
      </div>`;
      }
      return `<div class="card step-card ${state.selectedStepId === step.id ? "selected" : ""} ${step.parentId ? `branch-${step.branchType || "then"}` : "branch-root"}" data-id="${esc(step.id)}" data-parent-id="${esc(step.parentId || "")}" style="--depth:${entry.level}">
      <div class="step-header"><span class="step-title"><span class="step-number">${esc(entry.number)}</span>${esc(STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || step.step_type)}</span><span class="badge branch-badge">${esc(entry.branchLabel)}</span><span class="badge">${esc(STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || step.step_type)}</span></div>
      <div class="hierarchy-controls"><label>Parent Step<select data-step-parent>${parentOptionsForStep(
        step,
      )
        .map(
          (option) =>
            `<option value="${esc(option.id)}" ${(step.parentId || "") === option.id ? "selected" : ""}>${esc(option.label)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Branch Type<select data-step-branch>${branchTypeOptions(step)}</select></label></div>
      <input type="hidden" data-step-title value="${esc(step.title || STEP_TYPE_OPTIONS.find(([value]) => value === step.step_type)?.[1] || "Logic Step")}">
      <label>SWAT Step Type<select data-step-type>${optionsHtml(STEP_TYPE_OPTIONS, step.step_type)}</select></label>
      <input type="hidden" data-step-source value="${esc(step.source || "")}"><input type="hidden" data-step-field value="${esc(step.field || "")}"><input type="hidden" data-step-action value="${esc(step.action || "")}">
      ${renderGuidedBuilder(step)}
      <label>Manual Notes<textarea data-step-notes>${esc(step.notes || "")}</textarea></label>
      <label><span class="check"><input type="checkbox" data-step-enabled ${step.enabled !== false ? "checked" : ""}> Enabled</span></label>
      <div class="logic-preview-small"><strong>Generated Analyst Logic</strong><p>${esc(analystLogic(step))}</p></div>
      <div class="row hierarchy-buttons"><button class="secondary small" data-select-step>Select</button><button class="small" data-add-child-step>Add Child Step</button><button class="secondary small" data-indent>Indent</button><button class="secondary small" data-outdent>Outdent</button><button class="danger small" data-delete-step>Delete Step</button></div>
    </div>`;
    })
    .join("");
  renderSelectedStep();
}

// 14 provides the catalog-driven fallback renderer. 15-visual-ui-upgrades.js
// replaces renderSteps with the final visual renderer after this file loads.
renderSteps = renderStepsAuditWorkspace;

const atlasCatalogJsonCache = new WeakMap();

function atlasCachedCatalogJson(step, key, raw, compute) {
  let entry = atlasCatalogJsonCache.get(step);
  if (!entry) {
    entry = Object.create(null);
    atlasCatalogJsonCache.set(step, entry);
  }
  const cached = entry[key];
  if (cached && cached.raw === raw) return cached.value;
  const value = compute(raw);
  entry[key] = { raw, value };
  return value;
}

// ATLAS-MATH-OPERATIONS-UPDATE:BEGIN
const atlasNormalizeCatalogStepBeforeMathUpdate = normalizeCatalogStep;
normalizeCatalogStep = function normalizeCatalogStepWithMath(step, index = 0) {
  const normalized = atlasNormalizeCatalogStepBeforeMathUpdate(step, index);
  if (!normalized) return normalized;
  const p = normalized.params || {};
  ["source_math_json", "then_math_json"].forEach((key) => {
    if (!p[key]) return;
    try {
      p[key] = atlasCachedCatalogJson(normalized, key, p[key], (raw) =>
        atlasSerializeMathOperations(atlasParseRawMathOperations(raw)),
      );
    } catch (_error) {
      /* Preserve malformed legacy JSON so validation can report it. */
    }
  });
  if (p.conditions_json) {
    try {
      p.conditions_json = atlasCachedCatalogJson(
        normalized,
        "conditions_json",
        p.conditions_json,
        (raw) => {
          const conditions = JSON.parse(raw);
          conditions.forEach((condition) => {
            const math =
              condition.compareMathJson ||
              condition.compare_math_json ||
              condition.compareMath;
            if (math)
              condition.compareMathJson = atlasSerializeMathOperations(
                atlasParseRawMathOperations(math),
              );
          });
          return JSON.stringify(conditions);
        },
      );
    } catch (_error) {
      /* Existing conditions validation owns malformed JSON. */
    }
  }
  if (
    normalized.step_type === "if_then" &&
    p.then_action_type === "set_column_calculation"
  ) {
    p.then_rounding_mode = p.then_rounding_mode || "none";
    p.then_rounding_decimal_places = atlasDecimalPlacesValue(
      p.then_rounding_decimal_places,
      "0",
    );
  }
  return normalized;
};

function atlasNumericFieldOptionsHtml(sourceFile = "", selected = "") {
  const fields = (
    typeof fieldsForSource === "function" ? fieldsForSource(sourceFile) : []
  ).filter(atlasIsNumericField);
  return [
    '<option value="">Select numeric field...</option>',
    ...fields.map((field) => {
      const parts = fieldDisplayParts(field, sourceFile);
      const label = parts.alternate
        ? `${parts.display} (${parts.alternate})`
        : parts.display;
      return `<option value="${esc(parts.raw)}" ${selected === parts.raw || selected === parts.vanity ? "selected" : ""}>${esc(label)}</option>`;
    }),
  ].join("");
}

function atlasMathOperatorOptions(selected = "*") {
  return ATLAS_SOURCE_MATH_OPERATORS.map(
    (value) =>
      `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`,
  ).join("");
}

function atlasMathEditorHtml(name, value, baseSourceFile = "") {
  let operations = [];
  try {
    operations = atlasParseRawMathOperations(value).map((operation) =>
      atlasNormalizeMathOperation(operation),
    );
  } catch (_error) {
    operations = [];
  }
  return `<div class="math-operations-editor" data-math-editor data-math-param="${esc(name)}" data-base-source="${esc(baseSourceFile)}">
    <input type="hidden" data-param="${esc(name)}" data-math-json value="${esc(typeof value === "string" ? value : atlasSerializeMathOperations(operations))}">
    <div class="math-operations-header"><strong>Mathematical operations</strong><button type="button" class="secondary small" data-add-math-operation>Add Operation</button></div>
    <p class="hint">Operations are applied in listed order. Division by a field returns blank/NULL when its value is zero.</p>
    <div class="math-operation-list">${operations.map((operation) => atlasMathOperationRowHtml(operation, baseSourceFile)).join("")}</div>
  </div>`;
}

function atlasMathOperationRowHtml(operation = {}, fallbackSourceFile = "") {
  const item = atlasNormalizeMathOperation(operation);
  const fieldMode = item.operandType === "field";
  const selectedSourceFile = item.operandFieldName
    ? item.operandSourceFile
    : "";
  const fieldLabel = item.operandFieldName || "Select field...";
  const sourceLabel = selectedSourceFile
    ? sourceAliasFor?.(selectedSourceFile) || selectedSourceFile
    : "";
  const modeLabel = fieldMode ? "Source Field" : "Static Value";
  return `<div class="math-operation-row" data-math-row data-math-id="${esc(item.id)}">
    <div class="atlas-choice-field math-operator-control"><span class="atlas-choice-heading">Operator</span>${atlasChoiceControl({
      options: [
        ["+", "+"],
        ["-", "−"],
        ["*", "×"],
        ["/", "÷"],
      ],
      selected: item.operator || "*",
      variant: "segment",
      label: "Math operator",
      attributes: 'data-math-operator=""',
    })}</div>
    <div class="math-operand-mode"><span class="math-control-label">Operand type</span><label class="math-mode-switch"><input type="checkbox" role="switch" data-math-operand-mode ${fieldMode ? "checked" : ""} aria-label="Use a source field for this mathematical operand"><span class="math-mode-switch-track" aria-hidden="true"></span><span data-math-mode-label>${modeLabel}</span></label><input type="hidden" data-math-operand-type value="${fieldMode ? "field" : "number"}"></div>
    <div class="math-active-operand">
      <label class="math-number-operand" ${fieldMode ? "hidden" : ""}>Value<input data-math-operand inputmode="decimal" value="${esc(item.operand)}" placeholder="e.g., -1.5"></label>
      <div class="math-field-operand" ${fieldMode ? "" : "hidden"}>
        <span class="math-control-label">Value</span>
        <input type="hidden" data-math-source value="${esc(selectedSourceFile)}">
        <input type="hidden" data-math-field value="${esc(item.operandFieldName)}">
        <button type="button" class="visual-picker-trigger-button field-token ${item.operandFieldName ? "" : "empty"}" data-open-mini-picker="field" data-param-name="math_operand_field" data-picker-source="" aria-label="Choose field operand"><span class="visual-picker-trigger-copy"><strong>${esc(fieldLabel)}</strong>${sourceLabel ? `<small>${esc(sourceLabel)}</small>` : ""}</span><span aria-hidden="true">⌄</span></button>
      </div>
    </div>
    <button type="button" class="secondary small math-remove" data-remove-math-operation>Remove</button>
  </div>`;
}

const atlasRenderCreateModeInputsBeforeMathUpdate = renderCreateModeInputs;
renderCreateModeInputs = function renderCreateModeInputsWithMath(p) {
  if (p.value_mode !== "Source field value")
    return atlasRenderCreateModeInputsBeforeMathUpdate(p);
  return `<input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}
    <label>Source Field${fieldInputFromOptions({
      name: "field_name",
      value: p.field_name,
      placeholder: "Select source field",
      sourceFile: p.source_file,
    })}</label>
    ${atlasMathEditorHtml("source_math_json", p.source_math_json || "[]", p.source_file)}
    <div class="math-rounding-grid"><div class="atlas-choice-field"><span class="atlas-choice-heading">Rounding</span>${atlasChoiceControl({
      options: [
        ["none", "None"],
        ["nearest", "Nearest"],
        ["up", "Up"],
        ["down", "Down"],
      ],
      selected: p.rounding_mode || "none",
      variant: "segment",
      label: "Rounding",
      attributes: 'data-param="rounding_mode"',
    })}</div>
    <label>Decimal places<input data-param="rounding_decimal_places" inputmode="numeric" value="${esc(p.rounding_decimal_places || "0")}"></label></div>`;
};
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
const ATLAS_STRING_TRANSFORM_VALUE_MODE = "String transformation";
const ATLAS_STRING_TRANSFORM_OPERATIONS = [
  "first_characters",
  "last_characters",
  "character_count",
];

function atlasStringOperationChoice(paramName, selected) {
  return atlasChoiceControl({
    options: [
      ["first_characters", "First characters"],
      ["last_characters", "Last characters"],
      ["character_count", "Character count"],
    ],
    selected: selected || "first_characters",
    variant: "segment",
    label: "String operation",
    attributes: `data-param="${esc(paramName)}"`,
  });
}

function atlasRoundingChoice(paramName, selected) {
  return atlasChoiceControl({
    options: [
      ["none", "None"],
      ["nearest", "Nearest"],
      ["up", "Up"],
      ["down", "Down"],
    ],
    selected: selected || "none",
    variant: "segment",
    label: "Rounding",
    attributes: `data-param="${esc(paramName)}"`,
  });
}
const ATLAS_STRING_TRANSFORM_POSITIONS = ["first", "last"];

function atlasPositiveWholeNumber(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : "";
}

function atlasIsPositiveWholeNumber(value) {
  return atlasPositiveWholeNumber(value) !== "";
}

function atlasStringTransformConfig(value = {}, prefix = "") {
  const get = (name, fallback = "") => value[`${prefix}${name}`] ?? fallback;
  const rawOperation = String(get("string_operation") || "").trim();
  const legacyPosition = ATLAS_STRING_TRANSFORM_POSITIONS.includes(
    get("string_position"),
  )
    ? get("string_position")
    : "first";
  const operation = ATLAS_STRING_TRANSFORM_OPERATIONS.includes(rawOperation)
    ? rawOperation
    : rawOperation === "string_length"
      ? "character_count"
      : rawOperation === "substring"
        ? legacyPosition === "last"
          ? "last_characters"
          : "first_characters"
        : "first_characters";
  const position = operation === "last_characters" ? "last" : "first";
  return {
    operation,
    sourceFile: String(
      get("string_source_file", get("source_file", "")),
    ).trim(),
    sourceAlias: String(get("string_source_alias", "")).trim(),
    sourceField: String(get("string_source_field", "")).trim(),
    position,
    count: String(get("string_character_count", "")).trim(),
    destinationColumn: String(
      get("target_column", get("column_name", "")),
    ).trim(),
    resultMetadata:
      operation === "character_count"
        ? { dataType: "integer", fieldType: "number", format: "whole number" }
        : { dataType: "string", fieldType: "text", format: "text" },
  };
}

function atlasStringCharacterCountControl({
  operation = "",
  paramName = "",
  count = "",
  characterCountHint = "",
} = {}) {
  if (operation === "character_count") return "";

  return `
    <label>
      Number of Characters
      <input
        type="number"
        data-param="${esc(paramName)}"
        inputmode="numeric"
        pattern="[1-9][0-9]*"
        min="1"
        step="1"
        value="${esc(count)}">
    </label>`;
}

function atlasValidateStringTransform(value = {}, prefix = "") {
  const config = atlasStringTransformConfig(value, prefix);
  const issues = [];
  if (!config.sourceFile)
    issues.push({
      level: "error",
      code: "string_source",
      message: "String transformation requires a source file.",
    });
  if (!config.sourceField)
    issues.push({
      level: "error",
      code: "string_field",
      message: "String transformation requires a source field.",
    });
  if (!config.destinationColumn)
    issues.push({
      level: "error",
      code: "string_destination",
      message: "String transformation requires a destination column.",
    });
  if (
    config.operation !== "character_count" &&
    !atlasPositiveWholeNumber(config.count)
  )
    issues.push({
      level: "error",
      code: "string_count",
      message: "Number of characters must be a positive whole number.",
    });
  return issues;
}

function atlasStringTransformFieldReferences(step) {
  const p = step?.params || {};
  const references = [];
  if (
    step?.step_type === "create_column" &&
    p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE
  ) {
    const c = atlasStringTransformConfig(p);
    if (c.sourceFile && c.sourceField)
      references.push({ sourceFile: c.sourceFile, fieldName: c.sourceField });
  }
  if (
    step?.step_type === "if_then" &&
    p.then_action_type === "set_column_string_transform"
  ) {
    const c = atlasStringTransformConfig(p, "then_");
    if (c.sourceFile && c.sourceField)
      references.push({ sourceFile: c.sourceFile, fieldName: c.sourceField });
  }
  return references;
}

function atlasLogicFieldReferences(steps = state.audit.steps || []) {
  const references = [];
  const add = (sourceFile, fieldName) => {
    if (sourceFile && fieldName) references.push({ sourceFile, fieldName });
  };
  (steps || []).forEach((step) => {
    const p = step.params || {};
    add(p.source_file || step.source, p.field_name || step.field);
    add(p.source_file || step.source, p.expression_source_field);
    add(p.left_source, p.left_field);
    add(p.right_source, p.right_field);
    add(p.concat_source_1 || p.source_file, p.concat_field_1);
    add(p.concat_source_2 || p.source_file, p.concat_field_2);
    add(p.then_value_source_file || p.source_file, p.then_value_field);
    atlasStringTransformFieldReferences(step).forEach((r) =>
      add(r.sourceFile, r.fieldName),
    );
    try {
      (JSON.parse(p.conditions_json || "[]") || []).forEach((c) => {
        add(c.sourceFile, c.fieldName);
        add(c.compareSourceFile || c.sourceFile, c.compareFieldName);
      });
    } catch (_error) {
      /* Existing validation reports malformed condition JSON. */
    }
  });
  const seen = new Set();
  return references.filter((r) => {
    const key = `${r.sourceFile}\u0000${r.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function atlasRegisterStringTransformResult(step) {
  if (
    !step ||
    step.step_type !== "create_column" ||
    step.params?.value_mode !== ATLAS_STRING_TRANSFORM_VALUE_MODE
  )
    return null;
  const config = atlasStringTransformConfig(step.params);
  if (!config.destinationColumn) return null;
  const fields = state.audit.fields || (state.audit.fields = []);
  let field = fields.find(
    (item) =>
      String(item.fieldName || item.name || "") === config.destinationColumn &&
      atlasIsCustomField?.(item),
  );
  if (!field) {
    field = {
      id: uid("field"),
      sourceFile: "Calculated Field",
      fieldName: config.destinationColumn,
      name: config.destinationColumn,
    };
    fields.push(field);
  }
  Object.assign(field, {
    calculated: true,
    created: true,
    custom: true,
    dataCategory: "Calculated Field/Custom Column",
    fieldType: config.resultMetadata.fieldType,
    dataType: config.resultMetadata.dataType,
    format: config.resultMetadata.format,
    resultOperation: config.operation,
    createdByStepId: step.id,
  });
  step.params.result_data_type = config.resultMetadata.dataType;
  step.params.result_field_type = config.resultMetadata.fieldType;
  return field;
}

const atlasNormalizeCatalogStepBeforeStringTransform = normalizeCatalogStep;
normalizeCatalogStep = function normalizeCatalogStepWithStringTransform(
  step,
  index = 0,
) {
  const normalized = atlasNormalizeCatalogStepBeforeStringTransform(
    step,
    index,
  );
  if (!normalized) return normalized;
  const p = normalized.params || (normalized.params = {});
  if (normalized.step_type === "create_column") {
    if (
      ["first_characters", "last_characters", "character_count"].includes(
        p.expression_type,
      )
    ) {
      p.value_mode = ATLAS_STRING_TRANSFORM_VALUE_MODE;
      p.string_operation =
        p.expression_type === "character_count" ? "string_length" : "substring";
      p.string_position =
        p.expression_type === "last_characters" ? "last" : "first";
      p.string_source_file =
        p.string_source_file || p.source_file || normalized.source || "";
      p.string_source_field =
        p.string_source_field ||
        p.expression_source_field ||
        p.field_name ||
        "";
      p.string_character_count =
        p.string_character_count || p.character_count || "";
    }
    if (p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE) {
      const normalizedString = atlasStringTransformConfig(p);
      p.string_operation = normalizedString.operation;
      p.string_position = normalizedString.position;
      p.string_source_file =
        p.string_source_file || p.source_file || normalized.source || "";
      p.string_source_alias =
        sourceAliasFor?.(p.string_source_file) || p.string_source_file;
      atlasRegisterStringTransformResult(normalized);
    }
  }
  if (
    normalized.step_type === "if_then" &&
    p.then_action_type === "set_column_string_transform"
  ) {
    const normalizedThenString = atlasStringTransformConfig(p, "then_");
    p.then_string_operation = normalizedThenString.operation;
    p.then_string_position = normalizedThenString.position;
    p.then_string_source_file =
      p.then_string_source_file ||
      p.then_value_source_file ||
      p.source_file ||
      normalized.source ||
      "";
    p.then_string_source_alias =
      sourceAliasFor?.(p.then_string_source_file) || p.then_string_source_file;
    p.result_data_type =
      p.then_string_operation === "character_count" ? "integer" : "string";
  }
  return normalized;
};

const atlasRenderCreateModeInputsBeforeStringTransform = renderCreateModeInputs;
renderCreateModeInputs = function renderCreateModeInputsWithStringTransform(p) {
  if (p.value_mode !== ATLAS_STRING_TRANSFORM_VALUE_MODE)
    return atlasRenderCreateModeInputsBeforeStringTransform(p);
  const c = atlasStringTransformConfig(p);
  return `
    <div class="atlas-choice-field">
      <span class="atlas-choice-heading">Operation</span>
      ${atlasStringOperationChoice("string_operation", c.operation)}
    </div>
    
    <input 
      type="hidden" 
      data-param="string_position" 
      value="${esc(c.position)}">
        <input 
          type="hidden" 
          data-param="string_source_file" 
          value="${esc(c.sourceFile)}">
            <label>
              Source Field
              ${fieldInputFromOptions({
                name: "string_source_field",
                value: c.sourceField,
                placeholder: "Select source field",
                sourceFile: c.sourceFile,
              })}
            </label>

    ${atlasStringCharacterCountControl({
      operation: c.operation,
      paramName: "string_character_count",
      count: c.count,
    })}`;
};
// ATLAS-STRING-TRANSFORM-UPDATE:END
