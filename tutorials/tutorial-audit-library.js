// ATLAS Align Audit Library tutorial.
window.ATLAS_TUTORIALS = window.ATLAS_TUTORIALS || {};
window.ATLAS_TUTORIALS.auditLibrary = [
  {
    selector: "#page-my-audits",
    title: "Use My Audits as the starting page",
    body: "Begin here when you want to load a repo audit, review saved local work, or create a new audit shell.",
    placement: "right",
    page: "my-audits",
  },
  {
    selector: "#auditLibraryVisual",
    title: "Browse the audit library",
    body: "The library shows available audits in a contacts-style list. Use it to find existing audit definitions before creating new work from scratch.",
    placement: "top",
    page: "my-audits",
  },
  {
    selector: "#loadLibraryAuditBtn",
    title: "Load the selected audit",
    body: "After selecting an audit, load it into the active workspace. The active audit then drives the overview, fields, logic builder, preview, and export pages.",
    placement: "bottom",
    page: "my-audits",
  },
  {
    selector: "#refreshLibraryBtn",
    title: "Refresh the library when needed",
    body: "Use Refresh Library when repo-backed audit definitions have changed or when you want to reload the available audit list.",
    placement: "bottom",
    page: "my-audits",
  },
  {
    selector: "#newAuditBtn",
    title: "Create a new audit when no template fits",
    body: "Use New Audit when you need a blank workspace. After creating it, move to Audit Overview to name it and describe its purpose.",
    placement: "bottom",
    page: "my-audits",
  },
];
