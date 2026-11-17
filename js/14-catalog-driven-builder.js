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
  ["split_field", "Split Field"],
  ["sort_records", "Sort Records"],
  ["remove_duplicates", "Remove Duplicates"],
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
    delete step.params.join_keys_json;
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
    step.params.then_action_type =
      step.params.then_action_type || atlasDefaultIfThenActionType(step);
  }
  if (step.step_type === "join")
    step.params.join_type = step.params.join_type || "INNER JOIN";
  // A new Format field step has no format until the author chooses one.
  if (step.step_type === "format_field")
    step.params.format = step.params.format || "";
  if (step.step_type === "sort_records") {
    step.params.sort_direction = step.params.sort_direction || "Ascending";
    atlasSyncSortFieldParams(step.params);
  }
  if (step.step_type === "remove_duplicates") {
    step.params.duplicate_action =
      step.params.duplicate_action || "Keep first record";
    atlasSyncDuplicateFieldParams(step.params);
  }
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
        icon: String(option.icon || ""),
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
  return `<button type="button" class="atlas-choice-option${on ? " is-selected" : ""}" role="radio" aria-checked="${on ? "true" : "false"}" data-choice-value="${esc(item.value)}" tabindex="${on ? "0" : "-1"}">${item.icon && window.atlasIcon ? `<span class="atlas-choice-icon" aria-hidden="true">${window.atlasIcon(item.icon)}</span>` : ""}<span class="atlas-choice-label">${esc(item.label)}</span>${item.description ? `<span class="atlas-choice-description">${esc(item.description)}</span>` : ""}</button>`;
}

/**
 * Visible single-choice control. The hidden input keeps the existing data
 * attribute so callers can keep reading `.value` and listening for `change`.
 * variant: "segment" for 2–4 short labels, "chips" for wrapping phrases,
 * "cards" when each option needs a description.
 * popover ("pills", "list", or "grid") renders a trigger button that opens
 * the group in an anchored panel; the group and hidden input stay in place.
 * "grid" lays options out as tiles; an option `icon` names an atlasIcon.
 */
let atlasChoicePopoverSequence = 0;

/**
 * IF steps display matching records by default. Older steps that already carry
 * written action text keep the Freeform action so their wording is not lost.
 * @param {any} step - IF step that has no action type yet.
 */
function atlasDefaultIfThenActionType(step) {
  const params = step?.params || {};
  return String(params.then_action || step?.action || "").trim()
    ? "freeform"
    : "display";
}

function atlasChoiceControl({
  options = [],
  selected = "",
  variant = "segment",
  label = "Choose",
  heading = "",
  attributes = "",
  popover = "",
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
  const title = heading || label;
  if (["pills", "list", "grid"].includes(popover)) {
    const id = `atlas-choice-popover-${++atlasChoicePopoverSequence}`;
    return `<div class="atlas-choice-popover-field"><button type="button" class="atlas-choice-trigger" data-choice-popover-trigger aria-haspopup="true" aria-expanded="false" aria-controls="${id}" aria-label="${esc(title)}: ${esc(currentItem?.label || "Choose")}"><span class="atlas-choice-heading">${esc(title)}</span><span class="atlas-choice-current">${esc(currentItem?.label || "Choose")}</span><span class="atlas-choice-caret" aria-hidden="true">⌄</span></button><div class="atlas-choice-popover atlas-choice-popover-${popover}" id="${id}" hidden>${control}</div></div>`;
  }
  return control;
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
  const wrapper = group.closest(".atlas-choice-popover-field");
  const current = wrapper?.querySelector(".atlas-choice-current");
  if (current) current.textContent = currentLabel;
  const trigger = wrapper?.querySelector("[data-choice-popover-trigger]");
  if (trigger)
    trigger.setAttribute(
      "aria-label",
      `${trigger.querySelector(".atlas-choice-heading")?.textContent || ""}: ${currentLabel}`,
    );
}

let atlasOpenChoicePopoverTrigger = null;

function atlasPositionChoicePopover(trigger = atlasOpenChoicePopoverTrigger) {
  const panel = trigger?.isConnected
    ? document.getElementById(trigger.getAttribute("aria-controls"))
    : null;
  if (!panel || panel.hidden) return;
  const rect = trigger.getBoundingClientRect();
  const gutter = 12;
  const width = Math.min(
    window.innerWidth - gutter * 2,
    Math.max(
      rect.width,
      panel.classList.contains("atlas-choice-popover-grid")
        ? 360
        : panel.classList.contains("atlas-choice-popover-list")
          ? 280
          : 260,
    ),
    panel.classList.contains("atlas-choice-popover-grid") ? 440 : 400,
  );
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.left))}px`;
  panel.style.maxHeight = "";
  const below = window.innerHeight - rect.bottom - gutter - 8;
  const above = rect.top - gutter - 8;
  const height = panel.scrollHeight;
  if (height > below && above > below) {
    const maxHeight = Math.min(height, above);
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.top = `${rect.top - 8 - maxHeight}px`;
  } else {
    panel.style.maxHeight = `${Math.max(120, below)}px`;
    panel.style.top = `${rect.bottom + 8}px`;
  }
}

function atlasCloseChoicePopover({ restoreFocus = false } = {}) {
  const trigger = atlasOpenChoicePopoverTrigger;
  atlasOpenChoicePopoverTrigger = null;
  if (!trigger) return;
  trigger.setAttribute("aria-expanded", "false");
  const panel = document.getElementById(trigger.getAttribute("aria-controls"));
  if (panel) panel.hidden = true;
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

function atlasOpenChoicePopover(trigger) {
  const panel = document.getElementById(trigger?.getAttribute("aria-controls"));
  if (!panel) return;
  atlasCloseChoicePopover();
  panel.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  atlasOpenChoicePopoverTrigger = trigger;
  atlasPositionChoicePopover(trigger);
  (
    panel.querySelector(".atlas-choice-option.is-selected") ||
    panel.querySelector(".atlas-choice-option")
  )?.focus();
}

document.addEventListener(
  "click",
  (event) => {
    const trigger = event.target.closest?.("[data-choice-popover-trigger]");
    if (trigger) {
      event.preventDefault();
      if (atlasOpenChoicePopoverTrigger === trigger) atlasCloseChoicePopover();
      else atlasOpenChoicePopover(trigger);
      return;
    }
    if (
      atlasOpenChoicePopoverTrigger &&
      !event.target.closest?.(".atlas-choice-popover")
    )
      atlasCloseChoicePopover();
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!atlasOpenChoicePopoverTrigger) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      atlasCloseChoicePopover({ restoreFocus: true });
    } else if (event.key === "Tab") {
      atlasCloseChoicePopover({ restoreFocus: true });
      event.preventDefault();
    }
  },
  true,
);

window.addEventListener("resize", () => atlasPositionChoicePopover());
document.addEventListener(
  "scroll",
  (event) => {
    if (
      atlasOpenChoicePopoverTrigger &&
      !event.target?.closest?.(".atlas-choice-popover")
    )
      atlasPositionChoicePopover();
  },
  true,
);

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
  group
    .querySelectorAll(".atlas-choice-option")
    .forEach((button) => button.remove());
  group.insertAdjacentHTML(
    "beforeend",
    items.map((item) => atlasChoiceOptionButton(item, current)).join(""),
  );
  atlasSyncChoiceSelection(input);
  return true;
}

function atlasApplyChoiceValue(button, { focus = true } = {}) {
  const group = button?.closest?.(".atlas-choice");
  const input = group?.querySelector("input[type='hidden']");
  const next = button?.dataset.choiceValue ?? "";
  if (!group || !input || input.value === next) {
    if (focus) button?.focus?.();
    return;
  }
  input.value = next;
  atlasSyncChoiceSelection(input);
  if (focus) button.focus();
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function atlasSortDirectionState(value) {
  const descending = value === "Descending";
  return {
    value: descending ? "Descending" : "Ascending",
    icon: descending ? "sort-desc" : "sort-asc",
    label: descending
      ? "Sort direction: descending. Activate to sort ascending."
      : "Sort direction: ascending. Activate to sort descending.",
    title: descending ? "Descending" : "Ascending",
  };
}

function atlasSortDirectionToggle(
  value,
  inputAttribute = 'data-param="sort_direction"',
) {
  const state = atlasSortDirectionState(value);
  return `<input type="hidden" ${inputAttribute} value="${esc(state.value)}"><button type="button" class="sort-direction-toggle" data-sort-direction-toggle aria-label="${esc(state.label)}" title="${esc(state.title)}">${window.atlasIcon?.(state.icon) || ""}</button>`;
}

document.addEventListener(
  "click",
  (event) => {
    const toggle = event.target.closest?.("[data-sort-direction-toggle]");
    if (!toggle || toggle.disabled) return;
    const input = toggle.parentElement?.querySelector(
      'input[data-sort-direction], input[data-param="sort_direction"]',
    );
    if (!input) return;
    event.preventDefault();
    const state = atlasSortDirectionState(
      input.value === "Descending" ? "Ascending" : "Descending",
    );
    input.value = state.value;
    toggle.setAttribute("aria-label", state.label);
    toggle.title = state.title;
    toggle.innerHTML = window.atlasIcon?.(state.icon) || "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  },
  true,
);

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest?.("[data-choice-value]");
    if (!button || !button.closest(".atlas-choice")) return;
    event.preventDefault();
    const inPopover = !!button.closest(".atlas-choice-popover");
    if (inPopover) atlasCloseChoicePopover({ restoreFocus: true });
    atlasApplyChoiceValue(button, { focus: !inPopover });
  },
  true,
);

/** Counts rendered grid columns so Up/Down move one row in a tile grid. */
function atlasChoiceGridColumns(group) {
  const template = getComputedStyle(group).gridTemplateColumns;
  if (!template || template === "none") return 1;
  return Math.max(1, template.trim().split(/\s+/).length);
}

document.addEventListener(
  "keydown",
  (event) => {
    const button = event.target.closest?.(".atlas-choice-option");
    if (!button) return;
    const group = button.closest(".atlas-choice");
    const options = [...group.querySelectorAll(".atlas-choice-option")];
    const index = options.indexOf(button);
    let next = index;
    const columns = button.closest(".atlas-choice-popover-grid")
      ? atlasChoiceGridColumns(group)
      : 0;
    if (columns > 1 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const step = event.key === "ArrowDown" ? columns : -columns;
      const target = index + step;
      next = target >= 0 && target < options.length ? target : index;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    if (button.closest(".atlas-choice-popover")) {
      options[next].focus();
      return;
    }
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
 * Renders hidden source alias input markup.
 * @param {any} params - Step params object.
 */
function sourceAliasHidden(params) {
  return `<input type="hidden" data-param="source_alias" value="${esc(params.source_alias || sourceAliasFor(params.source_file || ""))}">`;
}

/**
 * Reads the condition editor's rows and bullet groups back into a tree.
 * Returns null when the container has no tree-aware condition list, so callers
 * can fall back to reading rows as a flat list.
 * @param {Element} container - Editor root or step card holding the rows.
 * @param {(row: Element, index: number) => any} readLeaf - Reads one row.
 */
function atlasReadConditionTreeFromDom(container, readLeaf) {
  const stack = container?.querySelector?.(
    ".condition-guided-stack[data-condition-list]",
  );
  if (!stack) return null;
  const readList = (list, depth) =>
    [...list.children].flatMap((node, index) => {
      if (node.matches(".guided-condition-group")) {
        const header = node.querySelector(":scope > .condition-group-header");
        const items = node.querySelector(":scope > [data-condition-list]");
        return [
          {
            id: node.dataset.conditionId || uid("cond"),
            conditionType: "group",
            connector:
              header?.querySelector('[data-condition-field="connector"]')
                ?.value || "AND",
            groupConnector: atlasConditionConnectorOf(
              header?.querySelector('[data-group-field="groupConnector"]')
                ?.value,
              "OR",
            ),
            items: items ? readList(items, depth + 1) : [],
          },
        ];
      }
      if (node.matches(".guided-condition-row"))
        return [readLeaf(node, depth === 0 ? index : Math.max(index, 1))];
      return [];
    });
  return readList(stack, 0);
}

/**
 * Writes guided IF conditions back to a step in the canonical params/summary shape.
 * @param {any} step - Step to update.
 * @param {Array<any>} conditions - Guided condition list.
 */
function atlasWriteLiveEditorConditions(step, conditions) {
  step.params =
    step.params && typeof step.params === "object" ? step.params : {};
  const tree = atlasNormalizeConditionTree(conditions || []);
  step.params.conditions_json = JSON.stringify(tree);
  // The legacy flat mirror lists every single condition, including grouped ones.
  step.conditions = atlasConditionLeaves(tree).map((condition) => ({
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
        ATLAS_DATE_DIFFERENCE_VALUE_MODE,
      ],
    }).filter(
      (value) =>
        value !== "Expression / calculation" &&
        value !== "Expression/Calculation",
    );
    // A legacy written expression keeps its own (legacy) choice so the
    // picker does not claim another type; new steps can't choose it.
    const writtenExpression = atlasCreateColumnIsWrittenExpression(p);
    if (writtenExpression)
      valueModes.push([p.value_mode, "Written expression (legacy)"]);
    const selectedValueMode =
      !writtenExpression &&
      (p.value_mode === "Expression / calculation" ||
        p.value_mode === "Expression/Calculation")
        ? ""
        : p.value_mode;
    const namedSplit =
      p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE &&
      p.string_operation === "split" &&
      atlasStringTransformConfig(p).named;
    const columnNameInput = namedSplit
      ? `<input type="hidden" data-param="column_name" value="${esc(p.column_name || "")}">`
      : `<label>New Column Name<input data-param="column_name" value="${esc(p.column_name || "")}" placeholder="e.g., Error Message"></label>`;
    return `<div class="guided-builder"><h4>Create Column</h4>${columnNameInput}<div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: atlasDescribedChoices(valueModes, {
          "Static value": "Write a fixed value into the new column.",
          "Source field value": "Copy or calculate from a source field.",
          [ATLAS_STRING_TRANSFORM_VALUE_MODE]:
            "Take characters, a character count, or split parts from a field.",
          "Concatenate fields": "Join two fields into one value.",
          [ATLAS_DATE_DIFFERENCE_VALUE_MODE]:
            "Count the days between a date field and the run date.",
          ...(writtenExpression
            ? {
                [p.value_mode]:
                  "Written in words (legacy). Choose a structured type.",
              }
            : {}),
        }),
        selected: selectedValueMode,
        variant: "cards",
        label: "Column Value Type",
        heading: "Column Value Type",
        popover: "pills",
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
  if (step.step_type === "format_field") return atlasFormatFieldEditorHtml(p);
  if (step.step_type === "split_field") return atlasSplitFieldEditorHtml(p);
  if (step.step_type === "sort_records")
    return `<div class="guided-builder"><h4>Sort Records</h4>${atlasSortFieldsEditorHtml(p)}</div>`;
  if (step.step_type === "remove_duplicates")
    return `<div class="guided-builder"><h4>Remove Duplicates</h4>${atlasDuplicateFieldsEditorHtml(p)}<div class="atlas-choice-field">${atlasChoiceControl(
      {
        options: atlasDescribedChoices(
          catalogArrayFromOptions({
            path: "app_config.logic_options.duplicate_actions",
            fallback: [
              "Keep first record",
              "Drop all duplicated records",
              "Keep last record",
            ],
          }).map((value) => [
            value,
            {
              "Keep first record": "Keep first",
              "Drop all duplicated records": "Keep none",
              "Keep last record": "Keep last",
            }[value] || value,
          ]),
          {
            "Keep first record": "Keep the earliest matching record.",
            "Drop all duplicated records":
              "Remove every record that has a duplicate.",
            "Keep last record": "Keep the latest matching record.",
          },
        ),
        selected: p.duplicate_action,
        variant: "cards",
        label: "Records to keep",
        heading: "Records to Keep",
        popover: "list",
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
    )}</label><div class="atlas-choice-field">${atlasChoiceControl({
      options: catalogArrayFromOptions({
        path: "app_config.logic_options.operators",
        fallback: ["is equal to"],
      }),
      selected: p.operator,
      variant: "chips",
      label: "Operator",
      heading: "Operator",
      popover: "pills",
      attributes: 'data-param="operator"',
    })}</div><label>Compare Value<textarea data-param="compare_value" placeholder="One or more values">${esc(p.compare_value || "")}</textarea></label>${
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
        : `<div class="atlas-choice-field">${atlasChoiceControl({
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
            popover: "list",
            attributes: 'data-param="flag_action"',
          })}</div><label>Message<input data-param="message" value="${esc(p.message || "")}"></label><label>Output Column${fieldInputFromOptions(
            {
              name: "output_column",
              value:
                p.output_column ||
                phrasePlaceholder("error_message_column", "Error Message"),
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

/**
 * Renders THEN/ELSE action controls.
 * @param {any} p - Input used by renderThenActionBuilder.
 * @param {any} prefix - Action label prefix such as THEN or ELSE.
 */
function renderThenActionBuilder(p, prefix = "THEN") {
  return `<div class="then-action-builder"><h4>${prefix} Action</h4><label>${prefix} Action Type<select data-param="then_action_type"><option value="freeform" ${p.then_action_type === "freeform" ? "selected" : ""}>Freeform Text</option><option value="set_column_value" ${p.then_action_type === "set_column_value" ? "selected" : ""}>Set Column Value from Field</option><option value="display_text" ${p.then_action_type === "display_text" ? "selected" : ""}>Display Text Response in Column</option><option value="do_not_display" ${p.then_action_type === "do_not_display" ? "selected" : ""}>Do Not Display</option></select></label><label>${prefix} Action<textarea data-param="then_action" placeholder="e.g., display records in the audit">${esc(p.then_action || "")}</textarea></label><label>Display Text<input data-param="then_text" value="${esc(p.then_text || "")}" placeholder="e.g., Research IT0027"></label><label>Output Column${fieldInputFromOptions(
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
      const readLeaf = (row, index) => {
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
          compareParameter: get("compareParameter"),
        };
      };
      const conditions =
        atlasReadConditionTreeFromDom(card, readLeaf) ||
        conditionRows.map(readLeaf);
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
  return atlasConditionLeaves(conditions || []).map((condition) => ({
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
  // Reuse the target's ids by position so ELSE edits keep stable identities.
  const existingLeaves = targetStep
    ? atlasConditionLeaves(parseStepConditions(targetStep))
    : [];
  let leafIndex = 0;
  return atlasMapConditionLeaves(inverted, (condition) => ({
    ...condition,
    id: existingLeaves[leafIndex++]?.id || condition.id || uid("cond"),
  }));
}

function atlasSourceForInverseStep(sourceStep, conditions) {
  return (
    sourceStep?.params?.source_file ||
    sourceStep?.source ||
    atlasConditionLeaves(conditions || [])[0]?.sourceFile ||
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
      return `<div class="card step-card ${state.selectedStepId === step.id ? "selected" : ""} ${step.parentId ? `branch-${esc(step.branchType || "then")}` : "branch-root"}" data-id="${esc(step.id)}" data-parent-id="${esc(step.parentId || "")}" style="--depth:${entry.level}">
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

/**
 * Rewrites duplicate_fields_json from the stored list (migrating the legacy
 * single field) and mirrors the first column into field_name/source_file so
 * reference checks that read those params keep working.
 * @param {any} params - Remove Duplicates step params, updated in place.
 */
function atlasSyncDuplicateFieldParams(params = {}) {
  const fields = atlasDuplicateFieldsFromParams(params);
  const legacyField = String(params.field_name || "").trim();
  // A repair that rewrote the mirrored params wins over the first entry.
  if (fields.length && legacyField) {
    const first = fields[0];
    const legacySource = String(params.source_file || "").trim();
    if (first.fieldName !== legacyField || first.sourceFile !== legacySource)
      fields[0] = atlasNormalizeDuplicateField({
        sourceFile: legacySource,
        sourceAlias: params.source_alias,
        fieldName: legacyField,
      });
  }
  atlasApplyDuplicateFields(params, fields);
  return params;
}

/** Stores a Remove Duplicates column list and its first-column mirror. */
function atlasApplyDuplicateFields(params = {}, fields = []) {
  params.duplicate_fields_json = atlasSerializeDuplicateFields(fields);
  const first = atlasDuplicateFieldsFromParams(params)[0];
  params.source_file = first?.sourceFile || "";
  params.source_alias = first?.sourceAlias || "";
  params.field_name = first?.fieldName || "";
  return params;
}

function atlasDuplicateFieldRowHtml(item) {
  const sourceLabel =
    item.sourceAlias || sourceAliasFor?.(item.sourceFile) || item.sourceFile;
  const color =
    typeof atlasSelectedSourceColor === "function"
      ? atlasSelectedSourceColor(item.sourceFile)
      : "";
  const style = color ? ` style="--source-color:${esc(color)}"` : "";
  const key = atlasDuplicateFieldKey(item);
  const removeLabel = sourceLabel
    ? `Remove column ${item.fieldName} from file ${sourceLabel}`
    : `Remove column ${item.fieldName}`;
  return `<li class="duplicate-field-row" data-duplicate-field="${esc(key)}">${sourceLabel ? `<span class="visual-picker-pill duplicate-field-source"${style}><span class="visual-picker-pill-main">${esc(sourceLabel)}</span></span>` : ""}<span class="duplicate-field-name">${esc(item.fieldName)}</span><button type="button" class="secondary small duplicate-field-remove" data-remove-duplicate-field="${esc(key)}" aria-label="${esc(removeLabel)}">Remove</button></li>`;
}

/**
 * Renders the Remove Duplicates column list editor.
 * @param {any} params - Step params.
 */
function atlasDuplicateFieldsEditorHtml(params = {}) {
  const fields = atlasDuplicateFieldsFromParams(params);
  const first = fields[0] || {};
  const list = fields.length
    ? `<ul class="duplicate-field-list" aria-label="Columns that must match">${fields.map((item) => atlasDuplicateFieldRowHtml(item)).join("")}</ul>`
    : `<div class="empty-state duplicate-fields-empty"><p>No columns selected yet. Add the columns that must all match for a record to count as a duplicate.</p></div>`;
  return `<div class="duplicate-fields-editor" data-duplicate-editor>
    <input type="hidden" data-param="duplicate_fields_json" data-duplicate-json value="${esc(atlasSerializeDuplicateFields(fields))}">
    <input type="hidden" data-param="source_file" value="${esc(first.sourceFile || "")}">
    <input type="hidden" data-param="source_alias" value="${esc(first.sourceAlias || "")}">
    <input type="hidden" data-param="field_name" value="${esc(first.fieldName || "")}">
    <div class="duplicate-fields-header"><span class="atlas-choice-heading">Columns to Match</span><span class="hint">A record is a duplicate when every selected column matches another record.</span></div>
    ${list}
    <div class="duplicate-fields-actions"><button type="button" class="secondary small" data-add-duplicate-field>Add Columns</button></div>
  </div>`;
}

/**
 * Reconciles the Sort Records field list with its first-field mirror params
 * (source_file, source_alias, field_name, sort_direction) so validation and
 * reference checks that read those params keep working.
 * @param {any} params - Sort Records step params, updated in place.
 */
function atlasSyncSortFieldParams(params = {}) {
  const fields = atlasSortFieldsFromParams(params);
  const legacyField = String(params.field_name || "").trim();
  // A repair that rewrote the mirrored params wins over the first entry.
  const firstIndex = fields.findIndex((item) => item.fieldName);
  if (firstIndex >= 0 && legacyField) {
    const first = fields[firstIndex];
    const legacySource = String(params.source_file || "").trim();
    if (first.fieldName !== legacyField || first.sourceFile !== legacySource)
      fields[firstIndex] = atlasNormalizeSortField({
        ...first,
        sourceFile: legacySource,
        sourceAlias: params.source_alias,
        fieldName: legacyField,
      });
  }
  atlasApplySortFields(params, fields);
  return params;
}

/** Stores a Sort Records field list and its first-field mirror. */
function atlasApplySortFields(params = {}, fields = []) {
  params.sort_fields_json = atlasSerializeSortFields(fields);
  const first = atlasSortFieldsFromParams(params).find(
    (item) => item.fieldName,
  );
  params.source_file = first?.sourceFile || "";
  params.source_alias = first?.sourceAlias || "";
  params.field_name = first?.fieldName || "";
  params.sort_direction = first?.direction || "Ascending";
  return params;
}

function atlasSortFieldRowHtml(item = {}, position = 1) {
  const entry = atlasNormalizeSortField(item);
  const sourceLabel = entry.fieldName
    ? entry.sourceAlias ||
      sourceAliasFor?.(entry.sourceFile) ||
      entry.sourceFile
    : "";
  const fieldLabel = entry.fieldName || "Select field...";
  const name = entry.fieldName || `sort field ${position}`;
  return `<div class="sort-field-row" data-sort-row data-sort-id="${esc(entry.id)}">
    <span class="sort-field-position" data-sort-position aria-hidden="true">${position}</span>
    <div class="sort-field-picker">
      <input type="hidden" data-sort-source value="${esc(entry.sourceFile)}">
      <input type="hidden" data-sort-field value="${esc(entry.fieldName)}">
      <button type="button" class="visual-picker-trigger-button field-token ${entry.fieldName ? "" : "empty"}" data-open-mini-picker="field" data-param-name="sort_field" data-picker-source="" aria-label="${esc(`Choose ${name}`)}"><span class="visual-picker-trigger-copy"><strong>${esc(fieldLabel)}</strong>${sourceLabel ? `<small>${esc(sourceLabel)}</small>` : ""}</span><span aria-hidden="true">⌄</span></button>
    </div>
    <div class="sort-field-direction">${atlasSortDirectionToggle(entry.direction, "data-sort-direction")}</div>
    <button type="button" class="secondary small sort-field-remove" data-remove-sort-field aria-label="${esc(`Remove ${name}`)}">Remove</button>
  </div>`;
}

/**
 * Renders the Sort Records multi-field editor.
 * @param {any} params - Step params.
 */
function atlasSortFieldsEditorHtml(params = {}) {
  const fields = atlasSortFieldsFromParams(params);
  const rows = fields.length ? fields : [atlasNormalizeSortField({})];
  const first = fields.find((item) => item.fieldName) || {};
  return `<div class="sort-fields-editor" data-sort-editor>
    <input type="hidden" data-param="sort_fields_json" data-sort-json value="${esc(atlasSerializeSortFields(rows))}">
    <input type="hidden" data-param="source_file" value="${esc(first.sourceFile || "")}">
    <input type="hidden" data-param="source_alias" value="${esc(first.sourceAlias || "")}">
    <input type="hidden" data-param="field_name" value="${esc(first.fieldName || "")}">
    <input type="hidden" data-param="sort_direction" value="${esc(first.direction || "Ascending")}">
    <div class="sort-fields-header"><strong>Sort fields</strong><button type="button" class="secondary small" data-add-sort-field>Add Field</button></div>
    <p class="hint">Fields are applied in listed order. Later fields break ties in earlier ones.</p>
    <div class="sort-field-list">${rows.map((item, index) => atlasSortFieldRowHtml(item, index + 1)).join("")}</div>
    <div class="empty-state sort-fields-empty" data-sort-empty hidden><p>No sort fields yet. Add a field to choose how records are ordered.</p></div>
  </div>`;
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
    <div class="atlas-choice-field math-operator-control"><span class="atlas-choice-heading">Operator</span>${atlasChoiceControl(
      {
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
      },
    )}</div>
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
    <div class="math-rounding-grid"><div class="atlas-choice-field"><span class="atlas-choice-heading">Rounding</span>${atlasChoiceControl(
      {
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
      },
    )}</div>
    <label>Decimal places<input data-param="rounding_decimal_places" inputmode="numeric" value="${esc(p.rounding_decimal_places || "0")}"></label></div>`;
};
// ATLAS-MATH-OPERATIONS-UPDATE:END

// ATLAS-STRING-TRANSFORM-UPDATE:BEGIN
const ATLAS_STRING_TRANSFORM_VALUE_MODE = "String transformation";
const ATLAS_STRING_TRANSFORM_OPERATIONS = [
  "first_characters",
  "last_characters",
  "character_count",
  "split",
];
/** Split modes: each delimiter, or only the first or last one (two parts). */
const ATLAS_STRING_SPLIT_MODES = ["every", "first", "last"];
/** Most columns one split may name; keeps the editor and formulas readable. */
const ATLAS_STRING_SPLIT_MAX_COLUMNS = 20;
/** Word aliases offered for common delimiters, with the characters they mean. */
const ATLAS_STRING_SPLIT_DELIMITERS = [
  ["space", " ", "Space"],
  ["comma", ",", "Comma"],
  ["hyphen", "-", "Hyphen"],
  ["underscore", "_", "Underscore"],
  ["period", ".", "Period"],
  ["slash", "/", "Forward slash"],
  ["backslash", "\\", "Backslash"],
  ["pipe", "|", "Pipe"],
  ["semicolon", ";", "Semicolon"],
  ["colon", ":", "Colon"],
  ["tab", "\t", "Tab"],
];

function atlasStringOperationChoice(
  paramName,
  selected,
  { split = false } = {},
) {
  return atlasChoiceControl({
    options: [
      ["first_characters", "First characters"],
      ["last_characters", "Last characters"],
      ["character_count", "Character count"],
      ...(split ? [["split", "Split on delimiter"]] : []),
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
  const destinationColumn = String(
    get("target_column", get("column_name", "")),
  ).trim();
  return {
    ...(operation === "split"
      ? atlasStringSplitConfig(get, destinationColumn)
      : {}),
    operation,
    sourceFile: String(
      get("string_source_file", get("source_file", "")),
    ).trim(),
    sourceAlias: String(get("string_source_alias", "")).trim(),
    sourceField: String(get("string_source_field", "")).trim(),
    position,
    count: String(get("string_character_count", "")).trim(),
    destinationColumn,
    resultMetadata:
      operation === "character_count"
        ? { dataType: "integer", fieldType: "number", format: "whole number" }
        : { dataType: "string", fieldType: "text", format: "text" },
  };
}

/** Resolves a delimiter choice (word alias or "custom") to its characters. */
function atlasStringSplitDelimiter(choice, custom = "") {
  const key = String(choice || "")
    .trim()
    .toLowerCase();
  if (key === "custom") return String(custom ?? "");
  const known = ATLAS_STRING_SPLIT_DELIMITERS.find(([word]) => word === key);
  return known ? known[1] : "";
}

/**
 * Split settings for a String transformation step.
 * A known column count (typed for "every", always 2 for first/last) means each
 * output is named; with no count the base name is repeated as Name_1, Name_2...
 */
function atlasStringSplitConfig(get, baseColumn = "") {
  const rawMode = String(get("string_split_mode") || "").trim();
  const splitMode = ATLAS_STRING_SPLIT_MODES.includes(rawMode)
    ? rawMode
    : "every";
  const rawChoice = String(get("string_split_delimiter") || "")
    .trim()
    .toLowerCase();
  const delimiterChoice =
    rawChoice === "custom" ||
    ATLAS_STRING_SPLIT_DELIMITERS.some(([word]) => word === rawChoice)
      ? rawChoice
      : "space";
  const customDelimiter = String(get("string_split_custom_delimiter") ?? "");
  const delimiter = atlasStringSplitDelimiter(delimiterChoice, customDelimiter);
  const typedCount = atlasPositiveWholeNumber(get("string_split_column_count"));
  const columnCount =
    splitMode === "every"
      ? typedCount
        ? String(Math.min(Number(typedCount), ATLAS_STRING_SPLIT_MAX_COLUMNS))
        : ""
      : "2";
  const named = !!columnCount;
  const outputColumns = named
    ? Array.from({ length: Number(columnCount) }, (_, index) =>
        String(get(`string_split_column_${index + 1}`) || "").trim(),
      )
    : [];
  return {
    splitMode,
    delimiterChoice,
    customDelimiter,
    delimiter,
    columnCount,
    named,
    outputColumns,
    baseColumn: named ? "" : baseColumn,
    outputPattern: !named && baseColumn ? `${baseColumn}_x` : "",
  };
}

/**
 * Column names a Create Column step adds. A split adds one per named part, or
 * a single "Name_x" entry standing for Name_1, Name_2... when the count is open.
 */
function atlasCreatedColumnNames(step) {
  if (!step || step.step_type !== "create_column") return [];
  const p = step.params || {};
  if (
    p.value_mode === ATLAS_STRING_TRANSFORM_VALUE_MODE &&
    String(p.string_operation || "").trim() === "split"
  ) {
    const c = atlasStringTransformConfig(p);
    const names = c.named ? c.outputColumns : [c.outputPattern];
    return [...new Set(names.filter(Boolean))];
  }
  const name = String(p.column_name || step.field || "").trim();
  return name ? [name] : [];
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
  if (config.operation === "split") {
    if (!config.delimiter)
      issues.push({
        level: "error",
        code: "string_split_delimiter",
        message:
          "Split needs a delimiter. Choose one or type a custom delimiter.",
      });
    const count = String(
      value[`${prefix}string_split_column_count`] ?? "",
    ).trim();
    if (
      config.splitMode === "every" &&
      count &&
      !atlasPositiveWholeNumber(count)
    )
      issues.push({
        level: "error",
        code: "string_split_count",
        message:
          "Number of columns must be a positive whole number, or blank to number the columns automatically.",
      });
    if (config.named) {
      const seen = new Set();
      config.outputColumns.forEach((name, index) => {
        const key = name.toLowerCase();
        if (!name)
          issues.push({
            level: "error",
            code: "string_split_column",
            column: index + 1,
            message: `Split column ${index + 1} needs a name.`,
          });
        else if (seen.has(key))
          issues.push({
            level: "error",
            code: "string_split_column",
            column: index + 1,
            message: `Split column "${name}" is named more than once.`,
          });
        seen.add(key);
      });
    }
    // Named splits take their names from the column list, not column_name.
    return issues.filter(
      (item) => !(config.named && item.code === "string_destination"),
    );
  }
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
    if (
      typeof atlasJoinKeyPairsInUse === "function" &&
      step.step_type === "join"
    )
      atlasJoinKeyPairsInUse(p).forEach((pair) => {
        add(p.left_source, pair.left_field);
        add(p.right_source, pair.right_field);
      });
    else {
      add(p.left_source, p.left_field);
      add(p.right_source, p.right_field);
    }
    add(p.concat_source_1 || p.source_file, p.concat_field_1);
    add(p.concat_source_2 || p.source_file, p.concat_field_2);
    add(p.then_value_source_file || p.source_file, p.then_value_field);
    atlasStringTransformFieldReferences(step).forEach((r) =>
      add(r.sourceFile, r.fieldName),
    );
    try {
      atlasConditionLeaves(JSON.parse(p.conditions_json || "[]")).forEach(
        (c) => {
          add(c.sourceFile, c.fieldName);
          add(c.compareSourceFile || c.sourceFile, c.compareFieldName);
        },
      );
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

/**
 * Removes the fields `stepId` registered under names it no longer produces.
 * Only fields stamped with `createdByStepId` are touched.
 */
function atlasDropStepCreatedFields(fields, stepId, keepNames = []) {
  if (!Array.isArray(fields) || !stepId) return 0;
  const keep = new Set(
    keepNames.map((name) =>
      String(name || "")
        .trim()
        .toLowerCase(),
    ),
  );
  let removed = 0;
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    const item = fields[index];
    const name = String(item?.fieldName || item?.name || "")
      .trim()
      .toLowerCase();
    if (item?.createdByStepId === stepId && !keep.has(name)) {
      fields.splice(index, 1);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Cleans an audit of calculated fields left behind by earlier edits: fields
 * registered under a step's old column names, or by steps that are gone or no
 * longer create columns, plus Display Fields preferences that only pointed at
 * such a name. Returns the number of entries removed.
 */
function atlasPruneStaleCreatedFields(audit) {
  if (!audit || !Array.isArray(audit.fields)) return 0;
  const steps = Array.isArray(audit.steps) ? audit.steps : [];
  const namesFor = (step) =>
    step?.step_type === "create_column" ? atlasCreatedColumnNames(step) : [];
  const byId = new Map(steps.map((step) => [step?.id, step]));
  let removed = 0;
  const stepIds = new Set(
    audit.fields.map((field) => field?.createdByStepId).filter(Boolean),
  );
  stepIds.forEach((stepId) => {
    removed += atlasDropStepCreatedFields(
      audit.fields,
      stepId,
      namesFor(byId.get(stepId)),
    );
  });
  if (Array.isArray(audit.displayFields)) {
    const fold = (value) =>
      String(value || "")
        .trim()
        .toLowerCase();
    // Every name requirementsFieldRows can list as a calculated row.
    const outputNames = (step) => {
      const p = step?.params || {};
      return [
        p.output_column,
        p.destination_column,
        p.then_output_column,
        p.then_target_column,
        p.created_field,
        p.column_name,
      ];
    };
    const live = new Set(
      steps
        .flatMap((step) => [...namesFor(step), ...outputNames(step)])
        .filter(Boolean)
        .map(fold),
    );
    audit.fields.forEach((field) => {
      if (field?.calculated || field?.created || field?.custom)
        live.add(fold(field.fieldName || field.name));
    });
    const before = audit.displayFields.length;
    audit.displayFields = audit.displayFields.filter((pref) => {
      const calculated =
        fold(pref?.sourceFile) === "calculated field" ||
        fold(pref?.sourceKey) === "calculated-field";
      // Preferences keyed to a step follow that step's current name.
      if (!calculated || fold(pref?.canonicalKey).startsWith("calculated:"))
        return true;
      return live.has(fold(pref.fieldName));
    });
    removed += before - audit.displayFields.length;
  }
  return removed;
}

function atlasRegisterStringTransformResult(step) {
  if (
    !step ||
    step.step_type !== "create_column" ||
    step.params?.value_mode !== ATLAS_STRING_TRANSFORM_VALUE_MODE
  )
    return null;
  const config = atlasStringTransformConfig(step.params);
  if (config.operation === "split") return atlasRegisterSplitResults(step);
  const fields = state.audit.fields || (state.audit.fields = []);
  // The step is normalized on every render, so each keystroke in the column
  // name lands here. Drop what it registered under earlier names first.
  atlasDropStepCreatedFields(
    fields,
    step.id,
    config.destinationColumn ? [config.destinationColumn] : [],
  );
  if (!config.destinationColumn) return null;
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

/**
 * Registers each split output as a calculated text field and drops fields this
 * step created under names it no longer uses.
 */
function atlasRegisterSplitResults(step) {
  const names = atlasCreatedColumnNames(step);
  const fields = state.audit.fields || (state.audit.fields = []);
  atlasDropStepCreatedFields(fields, step.id, names);
  const registered = names.map((name) => {
    let field = fields.find(
      (item) =>
        String(item.fieldName || item.name || "") === name &&
        atlasIsCustomField?.(item),
    );
    if (!field) {
      field = {
        id: uid("field"),
        sourceFile: "Calculated Field",
        fieldName: name,
        name,
      };
      fields.push(field);
    }
    Object.assign(field, {
      calculated: true,
      created: true,
      custom: true,
      dataCategory: "Calculated Field/Custom Column",
      fieldType: "text",
      dataType: "string",
      format: "text",
      resultOperation: "split",
      createdByStepId: step.id,
    });
    return field;
  });
  step.params.result_data_type = "string";
  step.params.result_field_type = "text";
  return registered[0] || null;
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
      if (normalizedString.operation === "split") {
        p.string_split_mode = normalizedString.splitMode;
        p.string_split_delimiter = normalizedString.delimiterChoice;
        // Named splits keep column_name on the first output so checks and
        // pickers that read one created name still find this step.
        if (normalizedString.named && normalizedString.outputColumns[0])
          p.column_name = normalizedString.outputColumns[0];
      }
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
      ${atlasStringOperationChoice("string_operation", c.operation, { split: true })}
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

    ${
      c.operation === "split"
        ? atlasStringSplitControls(p, c)
        : atlasStringCharacterCountControl({
            operation: c.operation,
            paramName: "string_character_count",
            count: c.count,
          })
    }`;
};

/** Existing field names offered while typing a split column name. */
function atlasStringSplitNameSuggestions(c) {
  const names = new Set();
  const add = (value) => {
    const text = String(value || "").trim();
    if (text) names.add(text);
  };
  try {
    (typeof fieldsForSource === "function"
      ? fieldsForSource(c.sourceFile)
      : []
    ).forEach((field) => add(field.fieldName || field.name));
  } catch (_error) {
    /* Suggestions are optional; typing a name still works. */
  }
  (state.audit?.fields || []).forEach((field) =>
    add(field.fieldName || field.name),
  );
  return [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
}

/** Delimiter, split mode, column count, and output names for a split. */
function atlasStringSplitControls(p, c) {
  const listId = `atlas-split-names-${esc(p.string_source_field || "field").replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const suggestions = atlasStringSplitNameSuggestions(c)
    .map((name) => `<option value="${esc(name)}"></option>`)
    .join("");
  const custom =
    c.delimiterChoice === "custom"
      ? `<label>Custom delimiter<input data-param="string_split_custom_delimiter" value="${esc(c.customDelimiter)}" placeholder='e.g., " - " or "||"' aria-describedby="atlas-split-custom-hint"><small id="atlas-split-custom-hint" class="hint">Spaces count. The delimiter is matched exactly, not as a pattern.</small></label>`
      : "";
  const count =
    c.splitMode === "every"
      ? `<label>Number of columns<input type="number" data-param="string_split_column_count" inputmode="numeric" min="1" max="${ATLAS_STRING_SPLIT_MAX_COLUMNS}" step="1" value="${esc(c.columnCount)}" placeholder="Blank = number automatically" aria-describedby="atlas-split-count-hint"><small id="atlas-split-count-hint" class="hint">${
          c.named
            ? "Name each column below. Values with fewer parts leave the extra columns blank."
            : `Leave blank to create ${esc(c.outputPattern || "Name_x")} columns (Name_1, Name_2, …) from the New Column Name.`
        }</small></label>`
      : `<p class="hint">Splitting on the ${c.splitMode} delimiter always makes two columns: the text before it and the text after it. Values without the delimiter keep the whole value in the first column and leave the second blank.</p>`;
  const names = c.named
    ? `<div class="split-column-names atlas-choice-field" role="group" aria-labelledby="${listId}-heading"><span class="atlas-choice-heading" id="${listId}-heading">Output column names</span>${c.outputColumns
        .map(
          (name, index) =>
            `<label>Column ${index + 1}<input data-param="string_split_column_${index + 1}" value="${esc(name)}" list="${listId}" placeholder="Pick a field or type a new name"></label>`,
        )
        .join("")}<datalist id="${listId}">${suggestions}</datalist></div>`
    : "";
  return `
    <div class="atlas-choice-field">
      <span class="atlas-choice-heading">Split at</span>
      ${atlasChoiceControl({
        options: [
          ["every", "Each delimiter"],
          ["first", "First delimiter"],
          ["last", "Last delimiter"],
        ],
        selected: c.splitMode,
        variant: "segment",
        label: "Split at",
        attributes: 'data-param="string_split_mode"',
      })}
    </div>
    <label>Delimiter<select data-param="string_split_delimiter">${[
      ...ATLAS_STRING_SPLIT_DELIMITERS.map(([value, , label]) => [
        value,
        label,
      ]),
      ["custom", "Custom…"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}"${value === c.delimiterChoice ? " selected" : ""}>${esc(label)}</option>`,
      )
      .join("")}</select></label>
    ${custom}
    ${count}
    ${names}`;
}
// ATLAS-STRING-TRANSFORM-UPDATE:END

// ATLAS-STRUCTURED-STEP-EDITORS:START
/* Structured settings for Split field and Create column. New settings are
 * stored next to the older ones, which are kept as mirrors the current
 * compiler can read. A setting the older compiler cannot run leaves its mirror
 * blank, so that compiler blocks the step instead of running it wrongly. */

const ATLAS_DATE_DIFFERENCE_VALUE_MODE = "Date difference";
const ATLAS_SPLIT_BY = ["delimiter", "width"];
const ATLAS_SPLIT_MODES = ["part", "explode"];
const ATLAS_SPLIT_MAX_DELIMITER = 20;
const ATLAS_SPLIT_MAX_WIDTH = 10000;
const ATLAS_SPLIT_MAX_PART = 1000;
const ATLAS_CONCAT_MAX_SEPARATOR = 20;
const ATLAS_SPLIT_ORDINALS = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

/**
 * Reads a written split part ("first value", "2", "last") as "last" or a
 * 1-based position, the way the compiler reads split_part.
 * @param {any} value - Stored split_part.
 * @returns {string} "last", a whole number as text, or "" when blank.
 */
function atlasSplitPartValue(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return "";
  if (/\blast\b/.test(text)) return "last";
  const digits = text.match(/\d+/);
  if (digits) return String(Math.max(1, Number(digits[0])));
  const word = Object.keys(ATLAS_SPLIT_ORDINALS).find((key) =>
    new RegExp(`\\b${key}\\b`).test(text),
  );
  return word ? String(ATLAS_SPLIT_ORDINALS[word]) : text;
}

/**
 * Maps a legacy split_on value to a delimiter choice.
 * @param {any} splitOn - Legacy split_on text, such as "comma" or "-".
 * @returns {{choice: string, custom: string}}
 */
function atlasSplitDelimiterFromLegacy(splitOn) {
  const raw = String(splitOn ?? "");
  if (!raw) return { choice: "", custom: "" };
  const word = raw.trim().toLowerCase();
  const aliases = { dash: "hyphen", dot: "period", "forward slash": "slash" };
  const byWord = ATLAS_STRING_SPLIT_DELIMITERS.find(
    ([key]) => key === (aliases[word] || word),
  );
  if (byWord) return { choice: byWord[0], custom: "" };
  const byChar = ATLAS_STRING_SPLIT_DELIMITERS.find(([, char]) => char === raw);
  if (byChar) return { choice: byChar[0], custom: "" };
  return { choice: "custom", custom: raw };
}

/**
 * Structured Split field settings, read from new params or legacy split_on.
 * @param {Record<string, any>} p - Step params.
 */
function atlasSplitFieldConfig(p = {}) {
  const legacy = !p.split_by && !p.split_mode;
  const by = ATLAS_SPLIT_BY.includes(p.split_by) ? p.split_by : "delimiter";
  const mode = ATLAS_SPLIT_MODES.includes(p.split_mode) ? p.split_mode : "part";
  const fromLegacy = legacy ? atlasSplitDelimiterFromLegacy(p.split_on) : null;
  const delimiterChoice = String(
    fromLegacy ? fromLegacy.choice : p.split_delimiter || "",
  );
  const customDelimiter = String(
    fromLegacy ? fromLegacy.custom : (p.split_custom_delimiter ?? ""),
  );
  const delimiter =
    delimiterChoice === "custom"
      ? customDelimiter
      : atlasStringSplitDelimiter(delimiterChoice);
  return {
    by,
    mode,
    delimiterChoice,
    customDelimiter,
    delimiter,
    width: String(p.split_width ?? "").trim(),
    part: mode === "part" ? atlasSplitPartValue(p.split_part) || "1" : "",
    outputColumn: String(p.output_column ?? "").trim(),
  };
}

/**
 * Lists what a Split field step still needs before it can run.
 * @param {Record<string, any>} p - Step params.
 * @returns {string[]} Plain-language problems; empty when complete.
 */
function atlasSplitFieldProblems(p = {}) {
  const c = atlasSplitFieldConfig(p);
  const problems = [];
  if (!String(p.field_name || "").trim()) problems.push("Choose the field.");
  if (c.by === "delimiter") {
    if (!c.delimiterChoice) problems.push("Choose a delimiter.");
    else if (!c.delimiter) problems.push("Type the custom delimiter.");
    else if (c.delimiter.length > ATLAS_SPLIT_MAX_DELIMITER)
      problems.push(
        `Use a delimiter of ${ATLAS_SPLIT_MAX_DELIMITER} characters or fewer.`,
      );
  } else {
    const width = Number(c.width);
    if (!/^\d+$/.test(c.width) || width < 1 || width > ATLAS_SPLIT_MAX_WIDTH)
      problems.push(
        `Enter a width from 1 to ${ATLAS_SPLIT_MAX_WIDTH} characters.`,
      );
  }
  if (c.mode === "part") {
    if (
      c.part !== "last" &&
      !(/^\d+$/.test(c.part) && Number(c.part) <= ATLAS_SPLIT_MAX_PART)
    )
      problems.push(
        `Choose the part to keep: a number from 1 to ${ATLAS_SPLIT_MAX_PART}, or last.`,
      );
    if (!c.outputColumn) problems.push("Choose the output column.");
  }
  return problems;
}

/**
 * Writes the structured Split field settings and their split_on mirror.
 * split_on keeps the delimiter only for a delimiter split that keeps one part,
 * the one case the current compiler runs; otherwise it is blank so that
 * compiler blocks the step.
 * @param {Record<string, any>} params - Step params, changed in place.
 */
function atlasNormalizeSplitFieldParams(params) {
  if (!params) return params;
  const c = atlasSplitFieldConfig(params);
  params.split_by = c.by;
  params.split_mode = c.mode;
  params.split_delimiter = c.by === "delimiter" ? c.delimiterChoice : "";
  params.split_custom_delimiter =
    c.by === "delimiter" && c.delimiterChoice === "custom"
      ? c.customDelimiter
      : "";
  params.split_width = c.by === "width" ? c.width : "";
  params.split_part = c.part;
  if (c.mode === "explode") params.output_column = "";
  params.split_on =
    c.by === "delimiter" && c.mode === "part"
      ? c.delimiterChoice === "custom"
        ? c.customDelimiter
        : c.delimiterChoice
      : "";
  return params;
}

/**
 * Renders the Split field editor.
 * @param {Record<string, any>} p - Step params.
 */
function atlasSplitFieldEditorHtml(p = {}) {
  const c = atlasSplitFieldConfig(p);
  const delimiterOptions = [
    ["", "Choose delimiter"],
    ...ATLAS_STRING_SPLIT_DELIMITERS.map(([value, , label]) => [value, label]),
    ["custom", "Custom…"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}"${value === c.delimiterChoice ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
  const splitOn =
    c.by === "delimiter"
      ? `<label>Delimiter<select data-param="split_delimiter" required>${delimiterOptions}</select></label>${
          c.delimiterChoice === "custom"
            ? `<label>Custom delimiter<input data-param="split_custom_delimiter" value="${esc(c.customDelimiter)}" maxlength="${ATLAS_SPLIT_MAX_DELIMITER}" placeholder='e.g., " - "' aria-describedby="atlas-split-field-custom-hint"><small id="atlas-split-field-custom-hint" class="hint">Spaces count. Matched exactly, not as a pattern.</small></label>`
            : ""
        }`
      : `<label>Width (characters)<input type="number" data-param="split_width" inputmode="numeric" min="1" max="${ATLAS_SPLIT_MAX_WIDTH}" step="1" value="${esc(c.width)}" placeholder="e.g., 4" required></label>`;
  const result =
    c.mode === "part"
      ? `<label>Part to Keep<input data-param="split_part" value="${esc(c.part)}" list="atlas-split-part-options" placeholder="1, 2, 3 … or last" aria-describedby="atlas-split-part-hint"><datalist id="atlas-split-part-options"><option value="1"></option><option value="2"></option><option value="3"></option><option value="last"></option></datalist><small id="atlas-split-part-hint" class="hint">A position counted from 1, or "last". Values with fewer parts give a blank.</small></label><label>Output Column${fieldInputFromOptions(
          {
            name: "output_column",
            value: c.outputColumn,
            placeholder: "Select or create column",
            sourceFile: "",
          },
        )}</label>`
      : `<p class="hint full">Each part becomes its own record, replacing the field's value. The other columns are copied to every new record. Blank parts are dropped.</p>`;
  return `<div class="guided-builder"><h4>Split Field</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
    {
      name: "field_name",
      value: p.field_name,
      placeholder: "Select field",
      sourceFile: p.source_file,
    },
  )}</label><div class="atlas-choice-field"><span class="atlas-choice-heading">Split By</span>${atlasChoiceControl(
    {
      options: [
        ["delimiter", "Delimiter"],
        ["width", "Fixed width"],
      ],
      selected: c.by,
      variant: "segment",
      label: "Split by",
      attributes: 'data-param="split_by"',
    },
  )}</div>${splitOn}<div class="atlas-choice-field full">${atlasChoiceControl({
    options: [
      ["part", "Keep one part", "Write one part to an output column."],
      ["explode", "One record per part", "Turn each part into its own record."],
    ],
    selected: c.mode,
    variant: "cards",
    label: "Result",
    heading: "Result",
    popover: "list",
    attributes: 'data-param="split_mode"',
  })}</div>${result}</div>`;
}

/**
 * Date difference settings for a Create column step.
 * @param {Record<string, any>} p - Step params.
 */
function atlasDateDifferenceConfig(p = {}) {
  return {
    sourceFile: String(p.date_diff_source_file || "").trim(),
    sourceAlias: String(p.date_diff_source_alias || "").trim(),
    fieldName: String(p.date_diff_field || "").trim(),
    parameter: "runDate",
    direction:
      p.date_diff_direction === "field_minus_parameter"
        ? "field_minus_parameter"
        : "parameter_minus_field",
    unit: "days",
  };
}

/**
 * True for a legacy "Expression / calculation" column whose value is written
 * text (a custom expression) rather than a structured kind.
 * @param {Record<string, any>} p - Step params.
 */
function atlasCreateColumnIsWrittenExpression(p = {}) {
  return (
    (p.value_mode === "Expression / calculation" ||
      p.value_mode === "Expression/Calculation") &&
    !["first_characters", "character_count"].includes(p.expression_type)
  );
}

/**
 * Lists what a Create column step's structured value still needs.
 * @param {Record<string, any>} p - Step params.
 * @returns {string[]} Plain-language problems; empty when complete.
 */
function atlasCreateColumnStructuredProblems(p = {}) {
  const problems = [];
  if (p.value_mode === ATLAS_DATE_DIFFERENCE_VALUE_MODE) {
    if (!atlasDateDifferenceConfig(p).fieldName)
      problems.push("Choose the date field.");
  }
  if (
    p.value_mode === "Concatenate fields" &&
    String(p.concat_separator ?? "").length > ATLAS_CONCAT_MAX_SEPARATOR
  )
    problems.push(
      `Use a separator of ${ATLAS_CONCAT_MAX_SEPARATOR} characters or fewer.`,
    );
  if (atlasCreateColumnIsWrittenExpression(p))
    problems.push(
      "This column is written as an expression. Choose a structured value type.",
    );
  return problems;
}

/**
 * Keeps Create column structured settings tidy. Date difference settings are
 * kept only in that mode, with the source alias filled in. A written
 * expression is copied into column_description, which is never run.
 * @param {Record<string, any>} params - Step params, changed in place.
 */
function atlasNormalizeCreateColumnStructuredParams(params) {
  if (!params) return params;
  const dateKeys = [
    "date_diff_source_file",
    "date_diff_source_alias",
    "date_diff_field",
    "date_diff_parameter",
    "date_diff_direction",
    "date_diff_unit",
  ];
  if (params.value_mode === ATLAS_DATE_DIFFERENCE_VALUE_MODE) {
    const c = atlasDateDifferenceConfig(params);
    params.date_diff_source_file = c.sourceFile;
    params.date_diff_source_alias = c.sourceFile
      ? sourceAliasFor(c.sourceFile) || c.sourceAlias
      : "";
    params.date_diff_field = c.fieldName;
    params.date_diff_parameter = c.parameter;
    params.date_diff_direction = c.direction;
    params.date_diff_unit = c.unit;
  } else dateKeys.forEach((key) => delete params[key]);
  if (params.value_mode !== "Concatenate fields")
    delete params.concat_separator;
  const written = String(params.expression || "").trim();
  if (
    !String(params.column_description || "").trim() &&
    written &&
    atlasCreateColumnIsWrittenExpression(params)
  )
    params.column_description = written;
  return params;
}

/* Format field: format_kind names a v3 format; the older `format` text is kept
 * as a mirror the current compiler reads. Kinds it can't run get a mirror it
 * does not know, so it blocks the step. */
const ATLAS_FORMAT_KINDS = [
  ["text", "Text", "Keep the value as text."],
  ["trim", "Trim spaces", "Remove spaces at the start and end."],
  ["upper", "Upper case", "Change letters to upper case."],
  ["lower", "Lower case", "Change letters to lower case."],
  ["number", "Number", "Read the value as a number."],
  ["date", "Date", "Show the value as a date in a set format."],
  ["zeroPad", "Leading zeros", "Pad whole numbers with zeros to a width."],
];
const ATLAS_FORMAT_DATE_OUTPUTS = [
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "YYYYMMDD",
  "DD.MM.YYYY",
];
const ATLAS_FORMAT_NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/**
 * Reads a legacy `format` string as a structured format.
 * @param {any} format - Legacy format text, e.g. "8 digits with leading zeros".
 * @returns {{kind: string, width?: string, dateOutput?: string}}
 */
function atlasFormatFromLegacy(format) {
  const text = String(format ?? "").trim();
  const low = text.toLowerCase();
  if (!low) return { kind: "" };
  const digits = low.match(/^(\w+) digits? with leading zero(?:e)?s?$/);
  if (digits) {
    const width = /^\d+$/.test(digits[1])
      ? Number(digits[1])
      : ATLAS_FORMAT_NUMBER_WORDS[digits[1]] || 0;
    return width ? { kind: "zeroPad", width: String(width) } : { kind: "" };
  }
  const date = ATLAS_FORMAT_DATE_OUTPUTS.find(
    (name) => name.toLowerCase() === low,
  );
  if (date) return { kind: "date", dateOutput: date };
  if (low.includes("mm/dd/yyyy"))
    return { kind: "date", dateOutput: "MM/DD/YYYY" };
  if (ATLAS_FORMAT_KINDS.some(([kind]) => kind.toLowerCase() === low))
    return {
      kind: ATLAS_FORMAT_KINDS.find(([kind]) => kind.toLowerCase() === low)[0],
    };
  return { kind: "" };
}

/**
 * Structured Format field settings, from new params or the legacy `format`.
 * @param {Record<string, any>} p - Step params.
 */
function atlasFormatFieldConfig(p = {}) {
  const known = ATLAS_FORMAT_KINDS.some(([kind]) => kind === p.format_kind);
  const legacy = known ? null : atlasFormatFromLegacy(p.format);
  return {
    kind: known ? p.format_kind : legacy.kind,
    decimals: String(p.format_decimals ?? "").trim(),
    dateOutput: String(
      (known ? p.format_date_output : legacy.dateOutput) || "",
    ).trim(),
    width: String((known ? p.format_width : legacy.width) ?? "").trim(),
    legacyText: !known && !legacy.kind ? String(p.format ?? "").trim() : "",
  };
}

/** The legacy `format` text the current compiler reads for these settings. */
function atlasFormatMirror(c) {
  if (c.kind === "text") return "text";
  if (c.kind === "number")
    return c.decimals === "" ? "number" : "number (decimals)";
  if (c.kind === "date") return c.dateOutput || "date";
  if (c.kind === "zeroPad")
    return c.width ? `${c.width} digits with leading zeros` : "leading zeros";
  return c.kind || c.legacyText;
}

/**
 * Lists what a Format field step still needs before it can run.
 * @param {Record<string, any>} p - Step params.
 */
function atlasFormatFieldProblems(p = {}) {
  const c = atlasFormatFieldConfig(p);
  const problems = [];
  if (!String(p.field_name || "").trim()) problems.push("Choose the field.");
  if (!c.kind)
    problems.push(
      c.legacyText
        ? `The format "${c.legacyText}" is not a known format. Choose one.`
        : "Choose a format.",
    );
  if (
    c.kind === "number" &&
    c.decimals !== "" &&
    !(/^\d+$/.test(c.decimals) && Number(c.decimals) <= 10)
  )
    problems.push("Enter decimal places from 0 to 10, or leave blank.");
  if (c.kind === "date" && !ATLAS_FORMAT_DATE_OUTPUTS.includes(c.dateOutput))
    problems.push("Choose a date format.");
  if (
    c.kind === "zeroPad" &&
    !(/^\d+$/.test(c.width) && Number(c.width) >= 1 && Number(c.width) <= 100)
  )
    problems.push("Enter a width from 1 to 100 digits.");
  return problems;
}

/**
 * Writes the structured Format field settings and the `format` mirror.
 * @param {Record<string, any>} params - Step params, changed in place.
 */
function atlasNormalizeFormatFieldParams(params) {
  if (!params) return params;
  const c = atlasFormatFieldConfig(params);
  if (!c.kind) {
    delete params.format_kind;
    return params;
  }
  params.format_kind = c.kind;
  params.format_decimals = c.kind === "number" ? c.decimals : "";
  params.format_date_output = c.kind === "date" ? c.dateOutput : "";
  params.format_width = c.kind === "zeroPad" ? c.width : "";
  params.format = atlasFormatMirror(c);
  return params;
}

/**
 * Renders the Format field editor.
 * @param {Record<string, any>} p - Step params.
 */
function atlasFormatFieldEditorHtml(p = {}) {
  const c = atlasFormatFieldConfig(p);
  const legacy = c.legacyText
    ? `<div class="logic-editor-callout full" role="note">This step's format is written as "${esc(c.legacyText)}", which is not a known format. Choose one below.</div>`
    : "";
  const detail =
    c.kind === "number"
      ? `<label>Decimal places<input type="number" data-param="format_decimals" inputmode="numeric" min="0" max="10" step="1" value="${esc(c.decimals)}" placeholder="Blank keeps them as they are" aria-describedby="atlas-format-decimals-hint"><small id="atlas-format-decimals-hint" class="hint">Rounds to this many places. Leave blank for a plain number.</small></label>`
      : c.kind === "date"
        ? `<label>Date format<select data-param="format_date_output" required><option value="">Choose date format</option>${ATLAS_FORMAT_DATE_OUTPUTS.map(
            (name) =>
              `<option value="${esc(name)}"${name === c.dateOutput ? " selected" : ""}>${esc(name)}</option>`,
          ).join("")}</select></label>`
        : c.kind === "zeroPad"
          ? `<label>Width (digits)<input type="number" data-param="format_width" inputmode="numeric" min="1" max="100" step="1" value="${esc(c.width)}" placeholder="e.g., 8" required aria-describedby="atlas-format-width-hint"><small id="atlas-format-width-hint" class="hint">Whole numbers shorter than this get zeros in front. Other values are left as they are.</small></label>`
          : "";
  return `<div class="guided-builder"><h4>Format Field</h4><input type="hidden" data-param="source_file" value="${esc(p.source_file || "")}">${sourceAliasHidden(p)}<label>Field${fieldInputFromOptions(
    {
      name: "field_name",
      value: p.field_name,
      placeholder: "Select field",
      sourceFile: p.source_file,
    },
  )}</label>${legacy}<input type="hidden" data-param="format" value="${esc(p.format || "")}"><div class="atlas-choice-field full">${atlasChoiceControl(
    {
      options: ATLAS_FORMAT_KINDS,
      selected: c.kind,
      variant: "cards",
      label: "Format",
      heading: "Format",
      popover: "list",
      attributes: 'data-param="format_kind"',
    },
  )}</div>${detail}</div>`;
}

/**
 * Lists what a Remove duplicates step still needs before it can run.
 * @param {Record<string, any>} p - Step params.
 */
function atlasRemoveDuplicatesProblems(p = {}) {
  const problems = [];
  const fields =
    typeof atlasDuplicateFieldsFromParams === "function"
      ? atlasDuplicateFieldsFromParams(p)
      : [];
  if (!fields.length) problems.push("Choose at least one key field.");
  if (
    ![
      "Keep first record",
      "Keep last record",
      "Drop all duplicated records",
    ].includes(p.duplicate_action)
  )
    problems.push("Choose which record to keep.");
  return problems;
}

const atlasNormalizeCatalogStepBeforeStructuredEditors = normalizeCatalogStep;
normalizeCatalogStep = function normalizeCatalogStepWithStructuredEditors(
  step,
  index = 0,
) {
  const normalized = atlasNormalizeCatalogStepBeforeStructuredEditors(
    step,
    index,
  );
  const target = normalized || step;
  if (target?.step_type === "split_field")
    atlasNormalizeSplitFieldParams(target.params);
  if (target?.step_type === "create_column")
    atlasNormalizeCreateColumnStructuredParams(target.params);
  if (target?.step_type === "format_field")
    atlasNormalizeFormatFieldParams(target.params);
  return normalized;
};

/** Optional description of the column, shown when one is stored. */
function atlasColumnDescriptionHtml(p, { force = false } = {}) {
  const text = String(p.column_description || "");
  if (!force && !text.trim()) return "";
  const hint = force
    ? "For readers only. It is not run as a formula."
    : "For readers only. The column's value comes from the settings above.";
  return `<label class="full">Description (not run)<textarea data-param="column_description" placeholder="What this column is for" aria-describedby="atlas-column-description-hint">${esc(text)}</textarea><small id="atlas-column-description-hint" class="hint">${hint}</small></label>`;
}

const atlasRenderCreateModeInputsBeforeStructuredEditors =
  renderCreateModeInputs;
renderCreateModeInputs = function renderCreateModeInputsStructured(p) {
  if (atlasCreateColumnIsWrittenExpression(p))
    return `<div class="logic-editor-callout full" role="note">This column is written as an expression. Choose a value type above, such as String transformation or ${ATLAS_DATE_DIFFERENCE_VALUE_MODE}, so it runs the same way every time. The written text is kept below as the description.</div><input type="hidden" data-param="expression" value="${esc(p.expression || "")}">${atlasColumnDescriptionHtml(
      { column_description: p.column_description || p.expression || "" },
      { force: true },
    )}`;
  if (p.value_mode === ATLAS_DATE_DIFFERENCE_VALUE_MODE) {
    const c = atlasDateDifferenceConfig(p);
    return `<input type="hidden" data-param="date_diff_source_file" value="${esc(c.sourceFile)}"><input type="hidden" data-param="date_diff_parameter" value="runDate"><input type="hidden" data-param="date_diff_unit" value="days"><label>Date Field${fieldInputFromOptions(
      {
        name: "date_diff_field",
        value: c.fieldName,
        placeholder: "Select date field",
        sourceFile: c.sourceFile,
      },
    )}</label><label>Compared With<input value="Run date" readonly aria-describedby="atlas-date-diff-hint"><small id="atlas-date-diff-hint" class="hint">The date the audit is run.</small></label><div class="atlas-choice-field full"><span class="atlas-choice-heading">Result (days)</span>${atlasChoiceControl(
      {
        options: [
          ["parameter_minus_field", "Run date minus field"],
          ["field_minus_parameter", "Field minus run date"],
        ],
        selected: c.direction,
        variant: "segment",
        label: "Result in days",
        attributes: 'data-param="date_diff_direction"',
      },
    )}<small class="hint">Run date minus field counts days since the date, for example days since hire. Field minus run date counts days until it.</small></div>${atlasColumnDescriptionHtml(p)}`;
  }
  const base = atlasRenderCreateModeInputsBeforeStructuredEditors(p);
  if (p.value_mode === "Concatenate fields")
    return `${base}<label>Separator<input data-param="concat_separator" value="${esc(p.concat_separator ?? "")}" maxlength="${ATLAS_CONCAT_MAX_SEPARATOR}" placeholder='e.g., " - " (blank joins directly)' aria-describedby="atlas-concat-separator-hint"><small id="atlas-concat-separator-hint" class="hint">Placed between the two values. Spaces count.</small></label>${atlasColumnDescriptionHtml(p)}`;
  return `${base}${atlasColumnDescriptionHtml(p)}`;
};
// Conditions: one operator vocabulary, a run parameter mode and value arrays.
const ATLAS_RUN_PARAMETERS = [
  ["runDate", "Run Date", "The date the audit is run."],
];
const ATLAS_PARAMETER_OPERATORS = [
  "is equal to",
  "is not equal to",
  "is greater than",
  "is greater than or equal to",
  "is less than",
  "is less than or equal to",
];
/** Text the current compiler reads as the run date (see RUN_TOKENS). */
const ATLAS_RUN_PARAMETER_MIRROR = { runDate: "run date" };

/** The value mode shown in the editor; a run parameter is stored as values. */
function atlasConditionUiValueMode(condition = {}) {
  const mode = condition.valueMode || "values";
  if (mode === "parameter") return "parameter";
  if (mode === "values" && condition.compareParameter) return "parameter";
  return mode;
}

/** Splits a stored value list into an array, one value per line. */
function atlasConditionValueArray(condition = {}) {
  if (Array.isArray(condition.compareValues))
    return condition.compareValues
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  return String(condition.compareValue ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Normalizes one condition in place.
 * - A run parameter is stored as valueMode "values" plus compareParameter.
 *   compareValue mirrors it as "run date", which the current compiler reads
 *   as the run date. With an operator it cannot use, the mirror is blank so
 *   the current compiler blocks the condition.
 * - A value list is kept in compareValues (an array) and in compareValue
 *   (one value per line), which the current compiler reads.
 */
function atlasNormalizeConditionLeaf(condition = {}) {
  const next = { ...condition };
  if (atlasConditionUiValueMode(next) === "parameter") {
    const parameter = ATLAS_RUN_PARAMETERS.some(
      ([value]) => value === next.compareParameter,
    )
      ? next.compareParameter
      : "runDate";
    next.valueMode = "values";
    next.compareParameter = parameter;
    next.compareValue = ATLAS_PARAMETER_OPERATORS.includes(next.operator)
      ? ATLAS_RUN_PARAMETER_MIRROR[parameter]
      : "";
    delete next.compareValues;
    return next;
  }
  delete next.compareParameter;
  if ((next.valueMode || "values") === "values") {
    const values = atlasConditionValueArray(next);
    next.compareValues = values;
    next.compareValue = values.join("\n");
  } else delete next.compareValues;
  return next;
}

/** Problems with one condition's structured settings. */
function atlasConditionProblems(condition = {}) {
  if (atlasConditionUiValueMode(condition) !== "parameter") return [];
  return ATLAS_PARAMETER_OPERATORS.includes(condition.operator)
    ? []
    : [
        `The run date can only be compared with ${ATLAS_PARAMETER_OPERATORS.join(", ")}.`,
      ];
}

const atlasWriteLiveEditorConditionsBeforeStructuredEditors =
  atlasWriteLiveEditorConditions;
atlasWriteLiveEditorConditions = function atlasWriteStructuredConditions(
  step,
  conditions,
) {
  const tree =
    typeof atlasMapConditionTree === "function"
      ? atlasMapConditionTree(conditions || [], {
          leaf: (node) => atlasNormalizeConditionLeaf(node),
        })
      : conditions;
  return atlasWriteLiveEditorConditionsBeforeStructuredEditors(step, tree);
};
// ATLAS-STRUCTURED-STEP-EDITORS:END
