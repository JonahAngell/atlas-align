(function registerReadOnlyIsolationSuite() {
  "use strict";
  globalThis.ATLASValidation?.registerSuite({
    id: "read-only-isolation",
    version: 1,
    title: "Read-Only Isolation",
    prerequisites: [
      "Use a saved audit with a current revision.",
      "Complete only the manual navigation or viewing action described by each step.",
    ],
    steps: [
      {
        id: "read-only-isolation-01",
        checklist: "1",
        title: "Audit Overview navigation",
        purpose:
          "Confirm that viewing Audit Overview does not mutate protected audit or persistence state.",
        instructions:
          "Capture the baseline, select Go to step, review the Audit Overview without editing, then select Check.",
        page: "overview",
        selector: '[data-section="overview"]',
        expected:
          "Audit, persistence, revision, and autosave snapshots remain unchanged.",
        observations: ["state.audit", "persistence", "revision", "autosave"],
        evidenceSummary: "Protected before and after snapshots.",
      },
      {
        id: "read-only-isolation-02",
        checklist: "2",
        title: "Requirements Preview navigation",
        purpose: "Confirm that viewing Requirements Preview is observational.",
        instructions:
          "Select Go to step, review the generated requirements without changing options, then select Check.",
        page: "preview",
        selector: '[data-section="preview"]',
        expected:
          "Audit, persistence, revision, and autosave snapshots remain unchanged.",
        observations: ["state.audit", "persistence", "revision", "autosave"],
        evidenceSummary: "Protected before and after snapshots.",
      },
      {
        id: "read-only-isolation-03",
        checklist: "3",
        title: "Readiness Review navigation",
        purpose:
          "Confirm that viewing readiness results does not mutate protected state.",
        instructions:
          "Select Go to step, review readiness information without using a fix action, then select Check.",
        page: "review",
        selector: '[data-section="review"]',
        expected:
          "Audit, persistence, revision, and autosave snapshots remain unchanged.",
        observations: ["state.audit", "persistence", "revision", "autosave"],
        evidenceSummary: "Protected before and after snapshots.",
      },
      {
        id: "read-only-isolation-04",
        checklist: "4",
        title: "Export navigation",
        purpose:
          "Confirm that viewing the Export page does not mutate protected state.",
        instructions:
          "Select Go to step, review the Export page without exporting, locking, or saving, then select Check.",
        page: "export",
        selector: '[data-section="export"]',
        expected:
          "Audit, persistence, revision, and autosave snapshots remain unchanged.",
        observations: ["state.audit", "persistence", "revision", "autosave"],
        evidenceSummary: "Protected before and after snapshots.",
      },
    ],
  });
})();
