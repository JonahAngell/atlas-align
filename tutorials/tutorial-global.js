// ATLAS Align site-wide tutorial.
// The top toolbar ? button should only launch this site-wide walkthrough.
window.ATLAS_TUTORIALS = window.ATLAS_TUTORIALS || {};
window.ATLAS_TUTORIALS.global = [
  {
    selector: "#helpBtn",
    title: "Open the site-wide tutorial anytime",
    body: "Use this question-mark button for the broad ATLAS Align walkthrough. Focused tutorials now live inside their own sections, next to the area they explain.",
    placement: "bottom",
  },
  {
    selector: ".app-sidebar",
    title: "Move through the app by page",
    body: "Use the sidebar to move through the workflow: My Audits, Fields, Logic Builder, Requirements Preview, Readiness & Review, and Publication Preview.",
    placement: "right",
  },
  {
    selector: "#page-my-audits",
    title: "Start from My Audits",
    body: "Use My Audits to load an existing audit definition or start a new audit workspace. The focused Audit Library tutorial is available from this section.",
    placement: "right",
    page: "my-audits",
  },
  {
    selector: "#page-fields",
    title: "Choose source files and fields",
    body: "Use the Fields page to search the source library and select which source files are available to the active audit. The focused Fields tutorial is available from this section.",
    placement: "right",
    page: "fields",
  },
  {
    selector: "#page-steps",
    title: "Build standardized audit logic",
    body: "Use Logic Builder to create rules, joins, nested IF/ELSE structures, and standardized documentation output. The focused Logic Builder tutorial is available from this section.",
    placement: "right",
    page: "steps",
  },
  {
    selector: "#page-save",
    title: "Save and export the finished audit",
    body: "Use Publication Preview to save the audit locally and export the documentation package. The focused Save / Export tutorial is available from this section.",
    placement: "left",
    page: "save",
  },
];
