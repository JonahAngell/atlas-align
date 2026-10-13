/**
 * 08-step-templates-validation.js
 *
 * Legacy step-template helpers and validation-panel logic. Template UI may be hidden, but validation still evaluates audit completeness and step consistency.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Legacy step templates
// -----------------------------------------------------------------------------
const STEP_TEMPLATES = [
  {
    id: "source-review",
    label: "Source File Review",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Review source file",
      type: "source",
      level: 0,
      source: state.audit.sources[0]?.name || "Primary Source File",
      field: "",
      action:
        "Confirm the source file is current and use it as the starting population.",
      conditions: [],
      notes:
        "This step should appear before joins, filters, or field creation steps.",
    }),
  },
  {
    id: "create-field",
    label: "Create / Populate Field",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Create output field",
      type: "create",
      level: 0,
      source: state.audit.sources[0]?.name || "",
      field: state.audit.fields[0]?.name || "New Output Field",
      action:
        "Populate the output field using the configured source value or rule result.",
      conditions: [],
      notes:
        "Use this when documentation needs an explicit field creation step.",
    }),
  },
  {
    id: "if-condition",
    label: "IF / THEN Condition",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Apply IF condition",
      type: "if",
      level: 0,
      source: state.audit.sources[0]?.name || "",
      field: state.audit.fields[0]?.name || "",
      action:
        "include the row in the audit output or apply the documented action.",
      conditions: [
        { id: uid("cond"), field: "Status", operator: "equals", value: "Open" },
      ],
      notes:
        "Review the returned rows to confirm the condition is not too broad.",
    }),
  },
  {
    id: "compare-values",
    label: "Compare Values",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Compare source values",
      type: "compare",
      level: 0,
      source: state.audit.sources[0]?.name || "",
      field: "Comparison Field",
      action: "identify rows where the compared values do not align.",
      conditions: [
        {
          id: uid("cond"),
          field: "Left Value",
          operator: "not equal",
          value: "Right Value",
        },
      ],
      notes:
        "Use preview/review output to verify that comparison values are being interpreted correctly.",
    }),
  },
  {
    id: "join-sources",
    label: "Join Sources",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Join source files",
      type: "join",
      level: 0,
      source: "Primary Source File + Lookup Source File",
      field: "",
      action: "bring supporting lookup fields into the audit population.",
      conditions: [
        {
          id: uid("cond"),
          field: "Employee ID",
          operator: "equals",
          value: "Employee ID",
        },
      ],
      notes:
        "Document the join key plainly if the audience does not need technical join terminology.",
    }),
  },
  {
    id: "manual-review",
    label: "Manual Review / Quality Check",
    step: () => ({
      id: uid("step"),
      enabled: true,
      parentId: null,
      branchType: "root",
      sortOrder: state.audit.steps.length + 1,
      title: "Review results before export",
      type: "transform",
      level: 0,
      source: "",
      field: "",
      action:
        "Review the rows returned by the previous steps before using or exporting the audit documentation.",
      conditions: [],
      notes: "Use this as a final quality-control reminder.",
    }),
  },
];

// -----------------------------------------------------------------------------
// Template insertion
// -----------------------------------------------------------------------------
/**
 * Populates the legacy step-template selector if present.
 */
function renderStepTemplateOptions() {
  const select = $("stepTemplateSelect");
  if (!select) return;
  select.innerHTML = STEP_TEMPLATES.map(
    (template) =>
      `<option value="${template.id}">${esc(template.label)}</option>`,
  ).join("");
}

/**
 * Inserts the selected legacy step template.
 */
function insertSelectedStepTemplate() {
  capture();
  const selected = $("stepTemplateSelect")?.value;
  const template =
    STEP_TEMPLATES.find((item) => item.id === selected) || STEP_TEMPLATES[0];
  if (!template) return;
  const step = template.step();
  state.audit.steps.push(step);
  state.selectedStepId = step.id;
  atlasInvalidatePages?.(["steps", "preview", "review"]);
  showSection("steps");
  atlasRenderActivePage?.({ force: true });
  scheduleAutosave();
  status(`Inserted template: ${template.label}`, "ok");
}

// -----------------------------------------------------------------------------
// Audit validation
// -----------------------------------------------------------------------------
/**
 * Builds validation issues for audit setup and step consistency.
 */

function atlasKnownFieldOptionValues() {
  const values = new Set();
  (state.audit.fields || []).forEach((field) => {
    if (field.name) values.add(field.name);
    if (field.rawFieldName) values.add(field.rawFieldName);
  });
  (repoLibraryState?.sourceFiles || []).forEach((source) => {
    if (source.sourceKey) values.add(source.sourceKey);
    (source.fields || []).forEach((field) => {
      const raw =
        field.fieldName || field.rawFieldName || field.name || field.label;
      if (raw) values.add(raw);
      if (field.vanityLabel) values.add(field.vanityLabel);
      if (field.label) values.add(field.label);
    });
  });
  return values;
}

function validateAudit() {
  return window.ATLASAuditIssues?.legacyIssues?.() || [];
}
// -----------------------------------------------------------------------------
// Validation rendering
// -----------------------------------------------------------------------------
/** Renders the canonical issue result through the legacy Readiness panel. */
function renderValidationPanel() {
  if (window.ATLASAuditIssues?.render) {
    window.ATLASAuditIssues.render();
    return;
  }
  return atlasMeasure?.("atlas.validation", () => {
    const target = $("validationPanel");
    if (!target) return;
    const issues = validateAudit();
    if (!issues.length) {
      target.innerHTML =
        '<div class="validation-ok">No validation issues found.</div>';
      return;
    }
    target.innerHTML = `<div class="validation-list">${issues
      .map(
        (issue) =>
          `<div class="validation-item ${issue.level}"><strong>${
            issue.level === "error" ? "Error" : "Warning"
          }:</strong> ${esc(issue.message)}</div>`,
      )
      .join("")}</div>`;
  });
}
