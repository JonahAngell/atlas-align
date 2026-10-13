// ATLAS Align Save and Export tutorial.
window.ATLAS_TUTORIALS = window.ATLAS_TUTORIALS || {};
window.ATLAS_TUTORIALS.saveExport = [
  {
    selector: "#page-save",
    title: "Use Publication Preview for saves and exports",
    body: "This page is where users save the active audit locally, reload saved audits, and export documentation formats.",
    placement: "left",
    page: "save",
  },
  {
    selector: "#saveFlowBtn",
    title: "Save the current audit locally",
    body: "Save Current Audit Locally preserves the audit configuration in this browser. It is useful for drafts or recurring audits on the same machine.",
    placement: "right",
    page: "save",
  },
  {
    selector: "#flowSelect",
    title: "Reload saved local work",
    body: "Use the saved audit dropdown to reload previous local work. This restores setup and logic configuration, not external source data.",
    placement: "right",
    page: "save",
  },
  {
    selector: "#downloadDocBtn",
    title: "Export audit JSON",
    body: "Download JSON exports the active audit definition. This is useful for sharing or versioning the audit configuration.",
    placement: "left",
    page: "save",
  },
  {
    selector: "#downloadExcelBtn",
    title: "Export Excel when reviewers need a workbook view",
    body: "Download Excel creates a table-style workbook output for easier review outside the browser.",
    placement: "left",
    page: "save",
  },
  {
    selector: "#exportAllBtn",
    title: "Package saved audits",
    body: "Export All Saved Audits creates a bundle of locally saved audit flows so they can be backed up or shared with another user.",
    placement: "left",
    page: "save",
  },
];
