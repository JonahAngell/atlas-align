// ATLAS Align Fields tutorial.
window.ATLAS_TUTORIALS = window.ATLAS_TUTORIALS || {};
window.ATLAS_TUTORIALS.fields = [
  {
    selector: "#page-fields",
    title: "Use Fields before building rules",
    body: "Select the source files and inspect the field library before creating logic steps. The Logic Builder uses the sources selected on this page.",
    placement: "right",
    page: "fields",
  },
  {
    selector: "#sourceFieldSearch",
    title: "Search source files and fields",
    body: "Search by source file, alias, raw field name, or vanity label. This helps users find the right file without needing to know the exact technical name.",
    placement: "bottom",
    page: "fields",
  },
  {
    selector: "#sourceLibraryTabs",
    title: "Filter the source library",
    body: "Use the source library tabs to narrow the list by source grouping or selected files. This keeps the field browser manageable when the library is large.",
    placement: "bottom",
    page: "fields",
  },
  {
    selector: "#sourceFieldBrowser",
    title: "Select source files for the audit",
    body: "Use the source browser to add source files to the audit. Selected sources become available in rule criteria, joins, and action builders.",
    placement: "right",
    page: "fields",
  },
  {
    selector: "#sourcesList",
    title: "Review selected sources and fields",
    body: "The selected source panel shows what this audit can use. Review field names, aliases, and colors before moving into the Logic Builder.",
    placement: "left",
    page: "fields",
  },
];
