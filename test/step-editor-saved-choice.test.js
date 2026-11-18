/**
 * A choice field shows a step's saved value even when no option lists it.
 * Older audits saved operators such as "is blank/null" or "EQUALS" that the
 * Operator menu no longer offers. The editor saves the control's value, so
 * a control without the saved value switched the step to "is equal to" on
 * its next edit and changed what it does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadApp } from "./support/step-type-harness.js";

const CASES = [
  ["flag_records", "is blank/null"],
  ["flag_records", "EQUALS"],
  ["filter_rows", "is blank/null"],
  ["filter_rows", "IS GREATER THAN OR EQUAL TO"],
];

/** The Operator control's saved value and shown label in editor markup. */
function operatorControl(html) {
  const input = html.match(/<input[^>]*data-param="operator"[^>]*>/)?.[0] || "";
  return {
    value: input.match(/value="([^"]*)"/)?.[1],
    label: html.match(/aria-label="Operator: ([^"]*)"/)?.[1],
  };
}

async function render(stepType, operator) {
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
    params: {
      source_file: "wd",
      field_name: "Email",
      operator,
      compare_value: "",
      ...(stepType === "flag_records"
        ? { flag_action: "do_not_display" }
        : { filter_action: "Keep matching rows" }),
    },
  };
  vm.runInContext("normalizeCatalogStep(__step, 0)", context);
  return {
    context,
    html: vm.runInContext("atlasRenderStepEditor(__step)", context),
  };
}

for (const [stepType, operator] of CASES)
  test(`a ${stepType} step keeps its saved "${operator}" operator`, async () => {
    const { context, html } = await render(stepType, operator);
    assert.equal(
      vm.runInContext("__step.params.operator", context),
      operator,
      "normalizing keeps the saved operator",
    );
    const control = operatorControl(html);
    assert.equal(control.value, operator);
    assert.equal(control.label, operator.replace(/&/g, "&amp;"));
  });

test("an operator the menu lists is not added twice", async () => {
  const { html } = await render("flag_records", "is equal to");
  const options = html.match(/data-choice-value="is equal to"/g) || [];
  assert.equal(options.length, 1);
});
