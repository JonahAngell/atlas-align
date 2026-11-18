/**
 * The selected step editor's Step Type control. New rules can't pick legacy
 * types (Filter Rows, Flag Records, ELSE), but a saved step of one still has
 * to show and keep its own type: the editor saves the control's value, so a
 * control without it switched the step to the first choice, Create Column.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const STEPS = {
  filter_rows: {
    source_file: "wd",
    field_name: "Status",
    operator: "is equal to",
    compare_value: "Active",
    filter_action: "Keep matching rows",
  },
  flag_records: {
    source_file: "wd",
    field_name: "Email",
    operator: "is blank/null",
    flag_action: "display_text",
    message: "Missing email",
    output_column: "Error Message",
  },
  else: { then_action_type: "do_not_display" },
  if_then: {},
};

/** The Step Type control's saved value and label in the editor markup. */
function stepTypeControl(html) {
  const value = html.match(
    /<input type="hidden" data-live-step-type-select="" value="([^"]*)">/,
  )?.[1];
  const label = html.match(
    /aria-label="Step Type: ([^"]*)"/,
  )?.[1];
  return { value, label };
}

for (const [stepType, params] of Object.entries(STEPS))
  test(`the step editor keeps a ${stepType} step's own type`, async () => {
    const context = await loadApp();
    context.__step = {
      id: `step-${stepType}`,
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: 1,
      step_type: stepType,
      notes: "",
      conditions: [],
      params: { ...params },
    };
    vm.runInContext("normalizeCatalogStep(__step, 0)", context);
    const html = vm.runInContext("atlasRenderStepEditor(__step)", context);
    const control = stepTypeControl(html);
    assert.equal(control.value, stepType);
    // A type new rules can pick keeps the menu's own label (If/Then).
    if (stepType !== "if_then")
      assert.equal(
        control.label,
        vm.runInContext(
          "ATLASStepTypeRuntime.definitionFor(__step).label",
          context,
        ),
      );
  });
