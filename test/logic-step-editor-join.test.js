import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadJoinEditor() {
  const calls = [];
  const sandbox = {
    calls,
    esc: (value) => String(value ?? ""),
    renderGuidedBuilder: () => "previous-builder",
    normalizeCatalogStep: (step) => step,
    sourceInputFromOptions(options) {
      calls.push(["source", options]);
      return `SOURCE:${options.name}`;
    },
    fieldInputFromOptions(options) {
      calls.push(["field", options]);
      return `FIELD:${options.name}:${options.sourceFile || ""}`;
    },
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      createElement() {
        return { append() {}, querySelector() { return null; } };
      },
      body: { append() {} },
    },
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    readFileSync(new URL("../js/15f-join-picker.js", import.meta.url), "utf8"),
    sandbox,
  );
  return sandbox;
}

test("Join steps render editable controls instead of calling removed picker helpers", () => {
  const { renderGuidedBuilder, calls } = loadJoinEditor();
  const html = renderGuidedBuilder({
    id: "step-join",
    step_type: "join",
    params: {
      join_type: "LEFT JOIN",
      left_source: "employees.csv",
      left_field: "Employee ID",
      right_source: "roster.csv",
      right_field: "Person ID",
    },
  });

  assert.match(html, /class="guided-builder join-guided-builder"/);
  assert.match(html, /data-open-join-picker="step-join"/);
  assert.match(html, /data-param="join_type" value="LEFT JOIN"/);
  assert.match(html, /data-param="left_source" value="employees.csv"/);
  assert.match(html, /FIELD:left_field:employees.csv/);
  assert.match(html, /FIELD:right_field:roster.csv/);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        calls
          .filter(([kind]) => kind === "field")
          .map(([, options]) => options),
      ),
    ),
    [
      {
        name: "left_field",
        value: "Employee ID",
        placeholder: "Select left field",
        sourceFile: "employees.csv",
      },
      {
        name: "right_field",
        value: "Person ID",
        placeholder: "Select right field",
        sourceFile: "roster.csv",
      },
    ],
  );
});

test("Union steps render source pickers through the current source helper", () => {
  const { renderGuidedBuilder, calls } = loadJoinEditor();
  const html = renderGuidedBuilder({
    id: "step-union",
    step_type: "join",
    params: {
      join_type: "UNION",
      left_source: "file-a.csv",
      right_source: "file-b.csv",
      output_source: "combined.csv",
    },
  });

  assert.match(html, /Union Sources/);
  assert.match(html, /SOURCE:left_source/);
  assert.match(html, /SOURCE:right_source/);
  assert.match(html, /SOURCE:output_source/);
  assert.equal(
    calls.filter(([kind]) => kind === "field").length,
    0,
  );
});

test("non-join steps still use the previous guided builder", () => {
  const { renderGuidedBuilder } = loadJoinEditor();
  assert.equal(
    renderGuidedBuilder({ id: "step-if", step_type: "if_then", params: {} }),
    "previous-builder",
  );
});

function loadJoinPicker() {
  const listeners = [];
  let modalHtml = "";
  const sandbox = {
    esc: (value) => String(value ?? ""),
    renderGuidedBuilder: () => "previous-builder",
    normalizeCatalogStep: (step) => step,
    sourceInputFromOptions: () => "",
    fieldInputFromOptions: () => "",
    CSS: { escape: (value) => String(value) },
    atlasSelectedSourceColor: () => "#4d6fa9",
    SOURCE_COLOR_PALETTE: ["#4d6fa9", "#b54b4b"],
    sourceAliasFor: (sourceFile) => sourceFile,
    state: { audit: { steps: [] }, selectedStepId: "" },
    document: {
      addEventListener(type, handler) {
        listeners.push({ type, handler });
      },
      querySelector() {
        return null;
      },
      createElement() {
        const node = {
          className: "",
          innerHTML: "",
          querySelector() {
            return { focus() {} };
          },
        };
        return node;
      },
      body: {
        append(node) {
          modalHtml = node.innerHTML;
        },
      },
    },
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    readFileSync(new URL("../js/15f-join-picker.js", import.meta.url), "utf8"),
    sandbox,
  );
  return {
    open(step) {
      sandbox.state.audit.steps = [step];
      sandbox.state.selectedStepId = step.id;
      sandbox.window.ATLASJoinPicker.open(step.id);
      return modalHtml;
    },
    choose(type) {
      const click = listeners.find((listener) => listener.type === "click");
      const target = {
        dataset: { joinTypeOption: type },
        closest(selector) {
          return selector === "[data-join-type-option]" ? target : null;
        },
      };
      click.handler({ target });
      return modalHtml;
    },
    html: () => modalHtml,
  };
}

function joinOption(html, type) {
  const match = html.match(
    new RegExp(
      `<button type="button" class="join-type-rectangle(?: active)?(?: union)?" data-join-type-option="${type}" aria-pressed="(true|false)" aria-selected="(true|false)">`,
    ),
  );
  assert.ok(match, `missing join option ${type}`);
  return {
    tag: match[0],
    pressed: match[1] === "true",
    selected: match[2] === "true",
    active: match[0].includes(" active"),
  };
}

test("Choose Join Type opens with the current type selected and lays out list, diagram, and info", () => {
  const picker = loadJoinPicker();
  const html = picker.open({
    id: "step-join",
    step_type: "join",
    params: {
      join_type: "LEFT JOIN",
      left_source: "employees.csv",
      left_field: "Employee ID",
      right_source: "roster.csv",
      right_field: "Person ID",
    },
  });
  const listAt = html.indexOf('class="join-picker-type-list"');
  const diagramAt = html.indexOf('class="join-picker-visual-column"');
  const infoAt = html.indexOf('class="join-picker-details-card"');
  assert.ok(listAt >= 0 && listAt < diagramAt && diagramAt < infoAt);
  assert.doesNotMatch(html, /join-type-options-under-venn/);
  assert.equal(html.match(/aria-pressed="true"/g).length, 1);
  assert.equal(html.match(/aria-selected="true"/g).length, 1);
  const left = joinOption(html, "LEFT JOIN");
  assert.equal(left.pressed, true);
  assert.equal(left.selected, true);
  assert.equal(left.active, true);
  assert.match(left.tag, /class="join-type-rectangle active"/);
  assert.match(html, /join-type-rectangle-state/);
  for (const type of ["INNER JOIN", "RIGHT JOIN", "FULL OUTER JOIN", "UNION"]) {
    const option = joinOption(html, type);
    assert.equal(option.pressed, false);
    assert.equal(option.selected, false);
    assert.equal(option.active, false);
  }
  assert.match(html, /data-join-type="LEFT JOIN"/);
  assert.match(html, /LEFT JOIN Venn diagram/);
  assert.match(html, /All rows from the left source, plus matching rows from the right source/);
});

test("choosing a join type updates the selected list item, diagram, and info together", () => {
  const picker = loadJoinPicker();
  picker.open({
    id: "step-join",
    step_type: "join",
    params: { join_type: "INNER JOIN", left_field: "Employee ID", right_field: "Person ID" },
  });
  for (const type of ["LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN", "UNION", "INNER JOIN"]) {
    const html = picker.choose(type);
    const chosen = joinOption(html, type);
    assert.equal(chosen.pressed, true);
    assert.equal(chosen.selected, true);
    assert.equal(chosen.active, true);
    assert.equal(html.match(/aria-pressed="true"/g).length, 1);
    assert.equal(html.match(/class="join-type-rectangle active/g).length, 1);
    if (type === "UNION") {
      assert.match(html, /class="join-union-visual"/);
      assert.match(html, /Append rows from both sources into one combined output/);
      assert.match(html, />UNION \/ APPEND ROWS</);
    } else {
      assert.match(html, new RegExp(`data-join-type="${type}"`));
      assert.match(html, new RegExp(`${type} Venn diagram`));
      assert.match(html, new RegExp(`<strong>${type}</strong>`));
    }
  }
});
